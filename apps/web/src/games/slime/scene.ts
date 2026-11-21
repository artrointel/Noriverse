import Phaser from 'phaser';
import atlas from '../../assets/jelly-orbit-atlas.png';
import buttonAtlas from '../../assets/jelly-orbit-button-states.png';
import iconAtlas from '../../assets/jelly-orbit-icons.png';
import paneAtlas from '../../assets/jelly-orbit-panes.png';
import { playSound } from '../../platform/audio.ts';
import type { SceneFactory } from '../scene-loader.ts';
import { orbitControls } from './controls.ts';
import type { OrbitControl } from './controls.ts';
import { createOrbitHud, drawOrbitColorMark as colorMark, orbitFrame as frame, orbitPalette as palette,
  orbitSpriteKey as spriteKey, orbitText as text } from './hud.ts';
import type { OrbitHudView } from './hud.ts';
import { createOrbitBackground, orbitWorld, queueOrbitWorld } from './background.ts';
import { orbitControlFrame, orbitControlGap, orbitControlWidth, orbitGrid, orbitIconPixels, orbitPanePixels, orbitPanes, orbitPixel,
  orbitSpritePixels } from './layout.ts';
import { orbitHeight, orbitLanding, orbitResolutionMs, orbitWidth, pairPoints } from './rules.ts';
import type { OrbitBoard } from './rules.ts';

export type OrbitView = OrbitHudView & { control: (input: OrbitControl) => void; playing: boolean; clockOffset: number };

const column = (x: number) => orbitGrid.x + orbitGrid.cell * (x + .5);
const row = (y: number) => orbitGrid.y + orbitGrid.cell * (y + .5);
const buttonKey = 'orbit-button';
const iconKey = 'orbit-icons';
const paneKey = 'orbit-panes';
const blinkDelay = () => 3_400 + Math.random() * 4_300;

export const slimeScene: SceneFactory = (view) => {
  const world = orbitWorld(view().slime?.id ?? '');
  let tiles: Phaser.GameObjects.Sprite[];
  let active: Phaser.GameObjects.Sprite[];
  let landingJellies: Phaser.GameObjects.Sprite[];
  let marks: Phaser.GameObjects.Graphics;
  let status: Phaser.GameObjects.Text;
  let hud: ReturnType<typeof createOrbitHud>;
  let background: ReturnType<typeof createOrbitBackground>;
  let controls: { panel: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; icon: Phaser.GameObjects.Image; hot: boolean; held: boolean }[];
  let previous: OrbitView | undefined;
  let enabled = false;
  let nextActiveBlink = 0;
  const nextBlink = new Float64Array(orbitWidth * orbitHeight).fill(Infinity);

  function sprite(scene: Phaser.Scene) {
    return scene.add.sprite(0, 0, spriteKey).setScale(orbitPixel).setVisible(false);
  }

  function paintControl(index: number) {
    const control = controls[index];
    const frame = !enabled ? 4 : control.held ? 3 : control.hot ? 2 : orbitControls[index] === 'down' ? 1 : 0;
    control.panel.setFrame(frame);
    control.label.setAlpha(enabled ? 1 : .45);
    control.icon.setAlpha(enabled ? 1 : .45);
  }

  function drawBoard(scene: Phaser.Scene, current: OrbitView, moved: boolean, phaseChanged: boolean, time: number) {
    const { board } = current;
    const old = previous?.board;
    const first = previous?.id !== current.id;
    const spawned = !first && old?.serial !== board.serial;
    const landedNow = !first && !old?.resolution && (spawned || Boolean(board.resolution));
    for (const [index, tile] of tiles.entries()) {
      const color = board.cells[index];
      const changed = first || old?.cells[index] !== color;
      const jelly = color > 0 && color < 5;
      if (changed) nextBlink[index] = jelly ? time + blinkDelay() : Infinity;
      if (changed || phaseChanged) {
        tile.stop().setY(row(Math.floor(index / orbitWidth))).setVisible(jelly);
        if (jelly) tile.setFrame(frame(color));
      }
      if (landedNow && !board.resolution && jelly && board.event?.landed.includes(index)) tile.play('jelly-land-' + color, true);
    }

    const points = pairPoints(board.piece);
    for (const [half, [x, y]] of points.entries()) {
      const tile = active[half];
      tile.setVisible(!board.out && !board.resolution);
      if (first || spawned || phaseChanged || old?.out) {
        scene.tweens.killTweensOf(tile);
        tile.stop().setPosition(column(x), row(y)).setFrame(frame(board.piece.pair[half]));
      } else if (moved) {
        scene.tweens.killTweensOf(tile);
        scene.tweens.add({ targets: tile, x: column(x), y: row(y), duration: 85, ease: 'Sine.easeOut' });
        if (board.piece.y > (old?.piece.y ?? 0)) tile.play('jelly-fall-' + board.piece.pair[half], true);
      }
    }

    const landing = !board.out && !board.resolution ? orbitLanding(board) : [];
    for (const [half, jelly] of landingJellies.entries()) {
      const target = landing[half];
      const visible = target && !points.some(([x, y]) => x === target[0] && y === target[1]);
      jelly.setVisible(Boolean(visible));
      if (visible) jelly.setPosition(column(target[0]), row(target[1])).setFrame(frame(board.piece.pair[half]));
    }

    if (landedNow && !board.resolution) playSound('drop');
    if (!phaseChanged || board.resolution?.kind !== 'clear') return;
    playSound('combo', board.resolution.chain);
    if (board.resolution.chain > 1) {
      const duration = orbitResolutionMs(board.resolution);
      const banner = text(scene, orbitGrid.x + orbitGrid.width / 2, 173, 36, '#ffeda4').setText(current.labels.chainCue).setDepth(6)
        .setStroke('#27203c', 6).setScale(.7);
      scene.tweens.add({ targets: banner, scale: 1.05, duration: duration * .4, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: banner, alpha: 0, y: 153, delay: duration * .65, duration: duration * .35,
        onComplete: () => banner.destroy() });
    }
  }

  function drawMarks(board: OrbitBoard) {
    const phase = board.resolution;
    marks.clear();
    if (!board.out && !phase) {
      const points = pairPoints(board.piece);
      points.forEach(([x, y], i) => colorMark(marks, column(x) + 13, row(y) + 15, board.piece.pair[i], .95));
    }

    for (const [i, color] of board.cells.entries()) {
      if (!color || phase?.kind === 'clear' && phase.indices.includes(i)) continue;
      const x = column(i % orbitWidth), y = tiles[i].y;
      if (color === 5) {
        marks.fillStyle(0x2d284c).fillRoundedRect(x - 14, y - 13, 28, 27, 6)
          .lineStyle(1.3, 0x8978aa).strokeRoundedRect(x - 14, y - 13, 28, 27, 6)
          .fillStyle(0x9982be).fillTriangle(x - 10, y + 7, x - 4, y - 9, x + 10, y + 6)
          .fillStyle(0xc5acd8).fillTriangle(x - 4, y - 9, x + 10, y + 6, x + 2, y - 4);
      } else colorMark(marks, x + 13, y + 15, color, .82);
    }
  }

  function animateResolution(current: OrbitView) {
    const { board, clockOffset } = current;
    const phase = board.resolution;
    if (!phase) return;
    const elapsed = 1 - (phase.until + clockOffset - Date.now()) / orbitResolutionMs(phase);
    const progress = Phaser.Math.Clamp(elapsed, 0, 1);
    if (phase.kind === 'fall') {
      for (const { from, to } of phase.moves) {
        const start = row(Math.floor(from / orbitWidth));
        const end = row(Math.floor(to / orbitWidth));
        tiles[from].setY(start + (end - start) * progress ** 1.55);
      }
    } else {
      const offset = Math.min(3, Math.floor(progress * 4));
      for (const index of phase.indices) {
        const color = board.cells[index];
        tiles[index].setVisible(true).setFrame(frame(color === 5 ? 1 : color, 3) + offset);
      }
    }
  }

  return {
    preload() {
      this.load.spritesheet(spriteKey, atlas, { frameWidth: orbitSpritePixels, frameHeight: orbitSpritePixels });
      this.load.spritesheet(buttonKey, buttonAtlas, { frameWidth: orbitControlWidth / orbitPixel, frameHeight: orbitControlFrame.height / orbitPixel });
      this.load.spritesheet(iconKey, iconAtlas, { frameWidth: orbitIconPixels, frameHeight: orbitIconPixels });
      this.load.spritesheet(paneKey, paneAtlas, { frameWidth: orbitPanePixels, frameHeight: orbitPanePixels });
      queueOrbitWorld(this, world);
    },
    create() {
      background = createOrbitBackground(this, world);
      for (const key of [spriteKey, buttonKey, iconKey, paneKey]) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      for (let color = 1; color <= 4; color++) {
        for (const [state, name, rate] of [[0, 'idle', 9], [1, 'fall', 27], [2, 'land', 18]] as const) {
          const start = frame(color, state);
          this.anims.create({ key: 'jelly-' + name + '-' + color, frames: this.anims.generateFrameNumbers(spriteKey, { start, end: start + 3 }), frameRate: rate });
        }
      }
      for (const pane of orbitPanes) this.add.image(pane.x, pane.y, paneKey, Number(pane.dark))
        .setOrigin(0).setScale(orbitPixel).setAlpha(pane.dark ? .58 : .66);
      const art = this.add.graphics();
      art.fillStyle(0xe4a4e8, .38).fillRect(orbitGrid.x, orbitGrid.y + orbitGrid.cell, orbitGrid.width, orbitPixel);
      hud = createOrbitHud(this);
      marks = this.add.graphics().setDepth(2);
      tiles = Array.from({ length: orbitWidth * orbitHeight }, (_, i) =>
        sprite(this).setPosition(column(i % orbitWidth), row(Math.floor(i / orbitWidth))).setDepth(1));
      active = [sprite(this).setDepth(3), sprite(this).setDepth(3)];
      landingJellies = active.map(() => sprite(this).setDepth(1.5).setAlpha(.42));
      status = text(this, orbitGrid.x + orbitGrid.width / 2, 250, 25, '#ffd5ed').setDepth(4).setStroke('#141529', 6).setVisible(false);
      controls = orbitControls.map((input, index) => {
        const left = orbitControlFrame.x + index * (orbitControlWidth + orbitControlGap);
        const top = orbitControlFrame.y;
        const x = left + orbitControlWidth / 2;
        const control = { panel: this.add.image(left, top, buttonKey).setOrigin(0).setScale(orbitPixel),
          label: text(this, x, top + 34, 15), icon: this.add.image(x, top + 16, iconKey, index).setScale(orbitPixel),
          hot: false, held: false };
        const hit = this.add.zone(x, top + orbitControlFrame.height / 2, orbitControlWidth, orbitControlFrame.height)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => { control.hot = true; paintControl(index); });
        hit.on('pointerout', () => { control.hot = false; control.held = false; paintControl(index); });
        hit.on('pointerup', () => { control.held = false; paintControl(index); });
        hit.on('pointerdown', () => {
          if (!view().canMove) return;
          control.held = true;
          paintControl(index);
          view().slime?.control(input);
        });
        return control;
      });
      controls.forEach((_, i) => paintControl(i));
      void document.fonts.load('16px "Sketch Jua"').then(() => {
        if (!this.sys.isActive()) return;
        hud.refreshFonts();
        [status, ...controls.map(control => control.label)].forEach(label => label.updateText());
      }).catch(() => {});
    },
    update(time, delta) {
      const { slime: current, canMove } = view();
      if (!current) return;
      const board = current.board;
      if (current.id !== previous?.id) nextActiveBlink = time + blinkDelay();
      if (enabled !== canMove) {
        enabled = canMove;
        controls.forEach((control, i) => { control.held = false; paintControl(i); });
      }
      if (current.labels !== previous?.labels) {
        status.setText(current.labels.out);
        orbitControls.forEach((input, i) => controls[i].label.setText(current.labels.controls[input]));
      }
      hud.render(current);
      const old = previous?.board;
      const moved = board.piece.x !== old?.piece.x || board.piece.y !== old.piece.y || board.piece.rotation !== old.piece.rotation;
      const phaseChanged = old?.resolution?.until !== board.resolution?.until || old?.resolution?.kind !== board.resolution?.kind;
      const changed = moved || phaseChanged || board.serial !== old?.serial || board.out !== old?.out || current.id !== previous?.id;
      if (changed) drawBoard(this, current, moved, phaseChanged, time);
      if (board.resolution) animateResolution(current);
      if (changed || board.resolution) drawMarks(board);
      status.setVisible(board.out && !view().finished);
      if (current.playing) {
        background(delta);
        if (!board.resolution) {
          for (const [i, tile] of tiles.entries()) {
            if (time < nextBlink[i] || tile.anims.isPlaying) continue;
            tile.play('jelly-idle-' + board.cells[i]);
            nextBlink[i] = time + blinkDelay();
          }
        }
        if (canMove && time >= nextActiveBlink && !active[0].anims.isPlaying) {
          active[0].play('jelly-idle-' + board.piece.pair[0]);
          nextActiveBlink = time + blinkDelay();
        }
      }
      previous = current;
    },
  };
};
