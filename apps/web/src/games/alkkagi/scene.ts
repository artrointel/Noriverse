import Phaser from 'phaser';
import { playSound } from '../../platform/audio.ts';
import { addStoneShadow, createBoardArt, preloadBoard, stoneTexture } from '../board-art.ts';
import { paintGoldRing } from '../board-marks.ts';
import { createPieceSelection } from '../piece-selection.ts';
import { tableSize } from '../table.ts';
import type { GameView } from '../game-view.ts';
import { alkkagiWorldOrigin, alkkagiWorldSize, canFlick, defaultFlickSettings, endShot, flickDiameter, flickEdge, initialAlkkagi, initialFlickRound, isOffBoard, pieceOwner, settledStatus } from './rules.ts';
import type { AlkkagiStatus, Flick, FlickPlayer, FlickRound, StonePosition } from './rules.ts';

type Piece = {
  owner: FlickPlayer;
  sprite: Phaser.Physics.Arcade.Image;
  shadow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  out: boolean;
};

const maxPull = 113;
const minPull = 7;
const stopSpeed = 12;

export function alkkagiScene(view: () => GameView) {
  const initial = view().onlineFlick ?? view().localFlick ?? initialFlickRound;
  const settings = initial.settings ?? defaultFlickSettings;
  const edge = flickEdge(settings), diameter = flickDiameter(settings);
  let now = 0;
  let status = initialAlkkagi;
  let board: ReturnType<typeof createBoardArt>;
  let aim: Phaser.GameObjects.Graphics;
  let showSelection: ReturnType<typeof createPieceSelection>;
  let stage: Phaser.Scene;
  let group: Phaser.Physics.Arcade.Group;
  let selection: Piece | undefined;
  let pointer: { id: number; x: number; y: number } | undefined;
  let keyboardAim = { angle: -Math.PI / 2, power: 68 };
  let lastImpact = -100;
  let slowSince: number | undefined;
  let dark: boolean;
  let previousRound: FlickRound | undefined;
  const stones: Piece[] = [];

  function publish(next: AlkkagiStatus) {
    status = next;
    view().onAlkkagi(next);
  }

  function addPiece(owner: FlickPlayer, x: number, y: number) {
    const shadow = addStoneShadow(stage, x, y, diameter);
    const sprite = group.create(x, y, stoneTexture(owner === 1 ? 1 : 2)) as Phaser.Physics.Arcade.Image;
    if (owner === 3) sprite.setTint(0x69b8ff);
    if (owner === 4) sprite.setTint(0xff777c);
    sprite.setDisplaySize(diameter, diameter).setDepth(1);
    const radius = sprite.width * .46;
    const offset = sprite.width / 2 - radius;
    sprite.setCircle(radius, offset, offset).setDamping(true).setDrag(.28).setBounce(.86);
    const stone = { owner, sprite, shadow, x, y, out: false };
    stones.push(stone);
    return stone;
  }

  function available(stone: Piece) {
    const { canMove, deadline, onlineFlick } = view();
    if (onlineFlick && (onlineFlick.shot || onlineFlick.layout !== previousRound?.layout)) return false;
    return canMove && (!deadline || Date.now() < deadline) && !stone.out && canFlick(status, stone.owner);
  }

  function showAim(dx: number, dy: number) {
    aim.clear();
    if (!selection) return;
    const { x, y } = selection.sprite;
    const length = Math.min(maxPull, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    paintGoldRing(aim, x, y, diameter / 2 + 2);
    if (length < minPull) return;
    const distance = 31 + length * .82;
    const unitX = Math.cos(angle), unitY = Math.sin(angle);
    const startX = x + unitX * (diameter / 2 + 3), startY = y + unitY * (diameter / 2 + 3);
    const endX = x + unitX * distance, endY = y + unitY * distance;
    aim.lineStyle(5, 0x332018, .48).lineBetween(startX, startY, endX, endY);
    aim.lineStyle(3.5, 0xffc673, .23).lineBetween(startX, startY, endX, endY);
    aim.lineStyle(1.4, 0xffe7b6, .96).lineBetween(startX, startY, endX, endY);
    aim.fillStyle(0xfff2cd).fillTriangle(endX, endY,
      endX - Math.cos(angle - .42) * 12, endY - Math.sin(angle - .42) * 12,
      endX - Math.cos(angle + .42) * 12, endY - Math.sin(angle + .42) * 12);
  }

  function clearAim() {
    selection = undefined;
    pointer = undefined;
    aim.clear();
    showSelection();
  }

  function shoot(dx: number, dy: number) {
    const stone = selection;
    const length = Math.hypot(dx, dy);
    clearAim();
    if (!stone || !available(stone) || length < minPull) return;
    const strength = Math.min(length, maxPull) / maxPull;
    const velocity = Math.min(820, (55 + strength * 685) * view().force);
    const shot = { stone: stones.indexOf(stone), vx: dx / length * velocity, vy: dy / length * velocity };
    const online = view().onlineFlick;
    if (online) online.send(shot);
    else launch(shot);
  }

  function launch(shot: Flick) {
    stones[shot.stone].sprite.setVelocity(shot.vx, shot.vy);
    slowSince = undefined;
    publish({ ...status, phase: 'moving' });
    playSound('flick', Math.hypot(shot.vx, shot.vy) / 820);
  }

  function applyLayout(round: FlickRound) {
    clearAim();
    stage.physics.world.resume();
    const next = settledStatus({ ...round, shot: undefined });
    round.layout.forEach((point, index) => {
      const { sprite, shadow } = stones[index];
      stage.tweens.killTweensOf(sprite);
      sprite.setVelocity(0).setAlpha(1).setDisplaySize(diameter, diameter);
      stones[index].out = point === null;
      if (point) {
        sprite.enableBody(true, point[0], point[1], true, true);
        shadow.setPosition(point[0] + 1.8, point[1] + 3.5).setVisible(true);
      } else {
        sprite.disableBody(true, true);
        shadow.setVisible(false);
      }
    });
    keyboardAim = { angle: next.turn === 1 ? -Math.PI / 2 : Math.PI / 2, power: 68 };
    publish(next);
  }

  function removeStone(stone: Piece) {
    const sprite = stone.sprite;
    const velocity = sprite.body?.velocity.clone();
    stone.out = true;
    sprite.disableBody(false, false);
    stone.shadow.setVisible(false);
    playSound('drop');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sprite.setVisible(false);
    } else {
      stage.tweens.add({
        targets: sprite,
        x: sprite.x + (velocity?.x ?? 0) * .065,
        y: sprite.y + (velocity?.y ?? 0) * .065 + 10,
        alpha: 0, scale: sprite.scaleX * .63,
        duration: 220, ease: 'Quad.Out',
        onComplete: () => { if (stone.out) sprite.setVisible(false); },
      });
    }
    const remaining = [...status.remaining];
    remaining[stone.owner - 1]--;
    publish({ ...status, remaining });
  }

  function handleKeyboard(event: KeyboardEvent) {
    if (pointer || status.phase !== 'aim' || !['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight',
      'ArrowUp', 'ArrowDown', 'Enter', 'Space', 'Escape'].includes(event.code)) return;
    event.preventDefault();
    if (event.code === 'Escape') {
      clearAim();
      return;
    }
    const candidates = stones.filter(available);
    if (!candidates.length) return;
    if (!selection || !available(selection)) selection = candidates[0];
    const index = candidates.indexOf(selection);
    if (event.code === 'KeyA' || event.code === 'KeyD') {
      selection = candidates[(index + candidates.length + (event.code === 'KeyA' ? -1 : 1)) % candidates.length];
    }
    if (event.code === 'ArrowLeft') keyboardAim.angle -= Math.PI / 18;
    if (event.code === 'ArrowRight') keyboardAim.angle += Math.PI / 18;
    if (event.code === 'ArrowUp') keyboardAim.power = Math.min(maxPull, keyboardAim.power + 8);
    if (event.code === 'ArrowDown') keyboardAim.power = Math.max(14, keyboardAim.power - 8);
    const x = Math.cos(keyboardAim.angle) * keyboardAim.power;
    const y = Math.sin(keyboardAim.angle) * keyboardAim.power;
    if (event.code === 'Enter' || event.code === 'Space') {
      if (!event.repeat) shoot(x, y);
    } else showAim(x, y);
  }

  return {
    preload(this: Phaser.Scene) { preloadBoard(this); },
    create(this: Phaser.Scene) {
      stage = this;
      board = createBoardArt(this, edge, 19 * 1.3, settings.board === 'small' ? 7 : settings.board === 'large' ? 13 : 9, undefined, alkkagiWorldSize);
      dark = view().dark;
      board.paint(dark);
      aim = this.add.graphics().setDepth(2);
      showSelection = createPieceSelection(this);
      group = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image });
      initial.layout.forEach((point, index) => {
        const [x, y] = point ?? [tableSize / 2, tableSize / 2];
        addPiece(pieceOwner(index, initial.players), x, y);
      });
      applyLayout(initial);

      this.physics.add.collider(group, group, (first, second) => {
        if (now - lastImpact < 55) return;
        const a = (first as Phaser.Physics.Arcade.Image).body;
        const b = (second as Phaser.Physics.Arcade.Image).body;
        if (!a || !b) return;
        const difference = Phaser.Math.Distance.Between(a.velocity.x, a.velocity.y, b.velocity.x, b.velocity.y);
        if (difference < 23) return;
        lastImpact = now;
        playSound('impact', difference / 540);
      });

      const canvas = this.game.canvas;
      function position(event: PointerEvent) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: alkkagiWorldOrigin + Phaser.Math.Clamp((event.clientX - rect.left) / rect.width, 0, 1) * alkkagiWorldSize,
          y: alkkagiWorldOrigin + Phaser.Math.Clamp((event.clientY - rect.top) / rect.height, 0, 1) * alkkagiWorldSize,
        };
      }
      function pointerDown(event: PointerEvent) {
        if (pointer || event.button !== 0) return;
        const point = position(event);
        selection = stones.find(stone => available(stone)
          && Phaser.Math.Distance.Between(stone.sprite.x, stone.sprite.y, point.x, point.y) <= diameter / 2 + 5);
        if (selection) {
          pointer = { id: event.pointerId, ...point };
          canvas.setPointerCapture(event.pointerId);
          showAim(0, 0);
        } else aim.clear();
      }
      function pointerMove(event: PointerEvent) {
        if (pointer?.id !== event.pointerId) return;
        const point = position(event);
        showAim(pointer.x - point.x, pointer.y - point.y);
      }
      function pointerUp(event: PointerEvent) {
        if (pointer?.id !== event.pointerId) return;
        const point = position(event);
        shoot(pointer.x - point.x, pointer.y - point.y);
      }
      function pointerCancel(event: PointerEvent) {
        if (pointer?.id === event.pointerId) clearAim();
      }
      canvas.addEventListener('pointerdown', pointerDown);
      canvas.addEventListener('pointermove', pointerMove);
      canvas.addEventListener('pointerup', pointerUp);
      canvas.addEventListener('pointercancel', pointerCancel);
      canvas.addEventListener('lostpointercapture', pointerCancel);
      const parent = canvas.parentElement;
      parent?.addEventListener('keydown', handleKeyboard);
      const onBlur = () => { if (!pointer) clearAim(); };
      parent?.addEventListener('blur', onBlur);
      this.events.once('shutdown', () => {
        canvas.removeEventListener('pointerdown', pointerDown);
        canvas.removeEventListener('pointermove', pointerMove);
        canvas.removeEventListener('pointerup', pointerUp);
        canvas.removeEventListener('pointercancel', pointerCancel);
        canvas.removeEventListener('lostpointercapture', pointerCancel);
        parent?.removeEventListener('keydown', handleKeyboard);
        parent?.removeEventListener('blur', onBlur);
      });
    },
    update(time: number) {
      now = time;
      if (dark !== view().dark) {
        dark = view().dark;
        board.paint(dark);
      }
      const online = view().onlineFlick;
      if (online) {
        const layoutChanged = online.layout !== previousRound?.layout;
        if (layoutChanged) applyLayout(online);
        if (online.shot && !view().finished && (layoutChanged || online.shot !== previousRound?.shot)) {
          clearAim();
          launch(online.shot);
        }
        previousRound = online;
      }
      if (selection && !available(selection)) clearAim();
      showSelection(selection?.sprite);
      if (view().finished) {
        if (!stage.physics.world.isPaused) {
          stage.physics.world.pause();
          clearAim();
        }
        return;
      }
      if (status.phase !== 'moving') return;
      let moving = false;
      for (const stone of stones) {
        if (stone.out) continue;
        const sprite = stone.sprite;
        if (isOffBoard(sprite.x, sprite.y, edge)) {
          removeStone(stone);
          continue;
        }
        moving ||= (sprite.body?.velocity.lengthSq() ?? 0) > stopSpeed ** 2;
        stone.shadow.setPosition(sprite.x + 1.8, sprite.y + 3.5);
      }
      if (moving) {
        slowSince = undefined;
        return;
      }
      slowSince ??= time;
      if (time - slowSince < 130) return;
      for (const stone of stones) if (!stone.out) stone.sprite.setVelocity(0);
      const next = endShot(status);
      keyboardAim = { angle: next.turn === 1 ? -Math.PI / 2 : Math.PI / 2, power: 68 };
      publish(next);
      if (online?.host && online.shot) {
        const layout = stones.map(({ out, sprite }): StonePosition => out ? null : [sprite.x, sprite.y]);
        online.settle(layout, online.revision);
      }
    },
  };
}
