import Phaser from 'phaser';
import { playSound } from '../../platform/audio.ts';
import { addStoneShadow, createBoardArt, preloadBoard, stoneTexture } from '../board-art.ts';
import { tableSize } from '../table.ts';
import type { Stone } from '../table.ts';
import type { GameView } from '../scenes.ts';
import { alkkagiEdge, canFlick, endShot, initialAlkkagi, isOffBoard } from './rules.ts';
import type { AlkkagiStatus } from './rules.ts';

type Piece = {
  owner: Stone;
  sprite: Phaser.Physics.Arcade.Image;
  shadow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  out: boolean;
};

const diameter = 42;
const maxPull = 113;
const minPull = 7;
const stopSpeed = 12;

export function alkkagiScene(view: () => GameView) {
  let now = 0;
  let status = initialAlkkagi;
  let board: ReturnType<typeof createBoardArt>;
  let aim: Phaser.GameObjects.Graphics;
  let stage: Phaser.Scene;
  let group: Phaser.Physics.Arcade.Group;
  let selection: Piece | undefined;
  let pointer: { id: number; x: number; y: number } | undefined;
  let keyboardAim = { angle: -Math.PI / 2, power: 68 };
  let lastImpact = -100;
  let slowSince: number | undefined;
  let dark: boolean;
  const stones: Piece[] = [];

  function publish(next: AlkkagiStatus) {
    status = next;
    view().onAlkkagi(next);
  }

  function addPiece(owner: Stone, x: number, y: number) {
    const shadow = addStoneShadow(stage, x, y, diameter);
    const sprite = group.create(x, y, stoneTexture(owner)) as Phaser.Physics.Arcade.Image;
    sprite.setDisplaySize(diameter, diameter).setDepth(1);
    const radius = sprite.width * .46;
    const offset = sprite.width / 2 - radius;
    sprite.setCircle(radius, offset, offset).setDamping(true).setDrag(.28).setBounce(.86);
    const stone = { owner, sprite, shadow, x, y, out: false };
    stones.push(stone);
    return stone;
  }

  function available(stone: Piece) {
    return !view().finished && !stone.out && canFlick(status, stone.owner, view().practice);
  }

  function showAim(dx: number, dy: number) {
    aim.clear();
    if (!selection) return;
    const { x, y } = selection.sprite;
    const length = Math.min(maxPull, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    aim.lineStyle(2, 0xf6e6a6, .96).strokeCircle(x, y, diameter / 2 + 2);
    if (length < minPull) return;
    const distance = 31 + length * .82;
    const endX = x + Math.cos(angle) * distance;
    const endY = y + Math.sin(angle) * distance;
    aim.lineStyle(4, 0x382341, .35).lineBetween(x, y, endX, endY);
    aim.lineStyle(2, 0xfff2cd).lineBetween(x, y, endX, endY);
    aim.fillStyle(0xfff2cd).fillTriangle(endX, endY,
      endX - Math.cos(angle - .42) * 12, endY - Math.sin(angle - .42) * 12,
      endX - Math.cos(angle + .42) * 12, endY - Math.sin(angle + .42) * 12);
  }

  function clearAim() {
    selection = undefined;
    pointer = undefined;
    aim.clear();
  }

  function shoot(dx: number, dy: number) {
    const stone = selection;
    const length = Math.hypot(dx, dy);
    clearAim();
    if (!stone || !available(stone) || length < minPull) return;
    const strength = Math.min(length, maxPull) / maxPull;
    const velocity = Math.min(820, (55 + strength * 685) * view().force);
    stone.sprite.setVelocity(dx / length * velocity, dy / length * velocity);
    slowSince = undefined;
    publish({ ...status, phase: 'moving' });
    playSound('flick', strength);
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
    const remaining: [number, number] = [...status.remaining];
    remaining[stone.owner - 1]--;
    publish({ ...status, remaining });
  }

  function resetPractice() {
    if (stones.some(stone => stone.out)) {
      for (const stone of stones) {
        stage.tweens.killTweensOf(stone.sprite);
        stone.sprite.destroy();
        stone.shadow.destroy();
      }
      stones.length = 0;
      addPiece(1, 240, 340);
      addPiece(2, 240, 140);
    }
    publish({ turn: 1, remaining: [1, 1], phase: 'aim' });
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
      board = createBoardArt(this, alkkagiEdge, 19, 9);
      dark = view().dark;
      board.paint(dark);
      aim = this.add.graphics().setDepth(2);
      group = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image });
      if (view().practice) {
        resetPractice();
      } else {
        const rows = [357, 331, 351, 331, 357];
        rows.forEach((y, index) => {
          addPiece(1, 100 + index * 70, y);
          addPiece(2, 100 + index * 70, tableSize - y);
        });
        publish(initialAlkkagi);
      }

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
          x: Phaser.Math.Clamp((event.clientX - rect.left) * tableSize / rect.width, 0, tableSize),
          y: Phaser.Math.Clamp((event.clientY - rect.top) * tableSize / rect.height, 0, tableSize),
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
        if (isOffBoard(sprite.x, sprite.y)) {
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
      if (view().practice) {
        resetPractice();
      } else {
        const next = endShot(status);
        keyboardAim = { angle: next.turn === 1 ? -Math.PI / 2 : Math.PI / 2, power: 68 };
        publish(next);
      }
    },
  };
}
