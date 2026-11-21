import type Phaser from 'phaser';
import type { OrbitControl } from './controls.ts';
import { orbitGutter, orbitPixel, orbitSidebar, orbitTabHeight } from './layout.ts';
import { orbitHeight, orbitWidth } from './rules.ts';
import type { OrbitBoard, OrbitCell } from './rules.ts';

export type OrbitOpponent = { name: string; cells: readonly OrbitCell[]; serial: number; out: boolean };
export type OrbitHudView = {
  id: string; board: OrbitBoard; versus: boolean; opponents?: readonly OrbitOpponent[];
  labels: { next: string; cleared: string; chain: string; incoming: string; out: string; alive: string; chainCue: string;
    controls: Record<OrbitControl, string> };
};

export const orbitSpriteKey = 'jelly-orbit';
export const orbitFont = '"Sketch Jua", "Malgun Gothic", sans-serif';
export const orbitPalette = [0, 0xc395ff, 0xff9e89, 0x83edda, 0xffc86b, 0xb6b5cc];
export const orbitFrame = (color: number, state = 0) => (color - 1) * 16 + state * 4;
const { x: left, y: top, width, height: sidebarHeight } = orbitSidebar;
const center = left + width / 2;

export function orbitText(scene: Phaser.Scene, x: number, y: number, size: number, color = '#ecedff') {
  return scene.add.text(x, y, '', { fontFamily: orbitFont, fontSize: size, color }).setOrigin(.5);
}

export function drawOrbitColorMark(graphics: Phaser.GameObjects.Graphics, x: number, y: number, color: number, alpha: number) {
  graphics.lineStyle(1.3, orbitPalette[color], alpha);
  graphics.fillStyle(orbitPalette[color], alpha);
  switch (color) {
    case 1: graphics.strokeCircle(x, y, 2.5); break;
    case 2: graphics.fillTriangle(x, y - 3.3, x + 3, y + 2.5, x - 3, y + 2.5); break;
    case 3: graphics.strokeRect(x - 2.5, y - 2.5, 5, 5); break;
    case 4: graphics.fillCircle(x, y, 2.3); break;
  }
}

function fitText(text: Phaser.GameObjects.Text, label: string, maxWidth: number) {
  text.setText(label);
  if (text.width <= maxWidth) return;
  const chars = Array.from(label);
  while (chars.length && text.width > maxWidth) {
    chars.pop();
    text.setText(chars.join('') + '…');
  }
}

export function createOrbitHud(scene: Phaser.Scene) {
  const panel = scene.add.graphics();
  const mini = scene.add.graphics();
  const next = orbitText(scene, center, 0, 16, '#e2d5ff');
  const preview = [center - 24, center + 24].map(x => scene.add.sprite(x, 0, orbitSpriteKey).setScale(orbitPixel));
  const captions = Array.from({ length: 3 }, () => orbitText(scene, center, 0, 16, '#d8cef4'));
  const numbers = ['#ffd5f2', '#a2eee4', '#ffda9c'].map(tint => orbitText(scene, center, 0, 31, tint));
  const rivals = Array.from({ length: 3 }, () => ({
    name: orbitText(scene, center, 0, 15),
    state: orbitText(scene, center, 0, 12),
  }));
  let last: OrbitHudView | undefined;

  function card(graphics: Phaser.GameObjects.Graphics, y: number, height: number, tint: number) {
    const step = orbitPixel;
    graphics.fillStyle(0x121528).fillRect(left + step, y + step, width - step * 2, height + step)
      .fillStyle(0xb4a7ef, .37).fillRect(left + step, y, width - step * 2, height)
      .fillRect(left, y + step, width, height - step * 2)
      .fillStyle(tint).fillRect(left + step, y + step, width - step * 2, height - step * 2);
  }

  function drawRival(opponent: OrbitOpponent, i: number, count: number, y: number, height: number, labels: OrbitHudView['labels']) {
    const step = count === 1 ? 16 : count === 2 ? 10 : 8;
    const gridX = count === 1 ? center - step * orbitWidth / 2 : left + 10;
    const gridY = y + (count === 1 ? 89 : (height - orbitHeight * step) / 2);
    const textX = count === 1 ? center : (gridX + step * orbitWidth + left + width) / 2;
    const words = count === 1 ? width - 18 : left + width - (gridX + step * orbitWidth) - 10;
    const { name, state } = rivals[i];
    card(mini, y, height, opponent.out ? 0x302c47 : 0x333a66);
    mini.fillStyle(0x161a31).fillRect(gridX - 2, gridY - 2, step * orbitWidth + 4, step * orbitHeight + 4);
    for (const [index, color] of opponent.cells.entries()) {
      const x = gridX + index % orbitWidth * step;
      const row = Math.floor(index / orbitWidth);
      const nextY = gridY + row * step;
      mini.fillStyle(row % 2 ? 0x282947 : 0x20213a).fillRect(x, nextY, step - orbitPixel, step - orbitPixel);
      if (!color) continue;
      mini.fillStyle(orbitPalette[color], opponent.out ? .47 : .9)
        .fillRect(x, nextY, step - orbitPixel, step - orbitPixel)
        .fillStyle(0xffffff, opponent.out ? .15 : .42).fillRect(x + orbitPixel, nextY, step - 3 * orbitPixel, orbitPixel);
      if (color === 5) {
        mini.lineStyle(Math.max(1, step * .13), 0x30233d, .7)
          .lineBetween(x + step * .27, nextY + step * .68, x + step * .73, nextY + step * .32);
      }
    }
    mini.lineStyle(.8, 0xf797b2, .65).lineBetween(gridX, gridY + step, gridX + step * orbitWidth, gridY + step);
    name.setPosition(textX, y + (count === 1 ? 33 : height * .43)).setFontSize(count === 1 ? 20 : 14).setVisible(true);
    state.setPosition(textX, y + (count === 1 ? 57 : height * .63))
      .setFontSize(count === 2 ? 10 : 12).setColor(opponent.out ? '#f0a8c5' : '#a9e7d7').setVisible(true);
    fitText(name, opponent.name, words);
    fitText(state, opponent.out ? labels.out : labels.alive, words);
  }

  return {
    render(current: OrbitHudView) {
      const { id, board, labels, versus, opponents } = current;
      const newRound = last?.id !== id;
      const changedMode = !last || versus !== last.versus || Boolean(opponents) !== Boolean(last.opponents);
      const nextY = top + (versus ? orbitTabHeight + orbitGutter : 0);
      const nextHeight = versus ? 92 : 132;
      const pairY = nextY + (versus ? 58 : 76);
      const cardsTop = nextY + nextHeight + orbitGutter;
      const cardsHeight = top + sidebarHeight - cardsTop;
      if (changedMode || newRound) {
        panel.clear();
        card(panel, nextY, nextHeight, 0x453b72);
        next.setY(nextY + (versus ? 19 : 25));
        preview.forEach(tile => tile.setY(pairY));
        const height = (cardsHeight - 2 * orbitGutter) / 3;
        [0x65497c, 0x456e7c, 0x765c6a].forEach((tint, i) => {
          const y = cardsTop + i * (height + orbitGutter);
          if (!opponents) card(panel, y, height, tint);
          captions[i].setY(y + height * .29).setVisible(!opponents);
          numbers[i].setY(y + height * .65).setVisible(!opponents);
        });
      }
      if (changedMode || newRound || board.serial !== last?.board.serial) {
        preview.forEach((tile, i) => tile.setFrame(orbitFrame(board.next[i])));
      }
      if (labels !== last?.labels) {
        next.setText(labels.next);
        [labels.cleared, labels.chain, labels.incoming].forEach((label, i) => captions[i].setText(label));
      }
      if (board !== last?.board || newRound) {
        [board.cleared, board.bestChain, board.incoming].forEach((value, i) => numbers[i].setText(String(value)));
      }
      const old = last?.opponents;
      const stacksChanged = opponents && (opponents.length !== old?.length || opponents.some((player, i) =>
        player.serial !== old[i].serial || player.out !== old[i].out || player.name !== old[i].name));
      if (changedMode || newRound || stacksChanged || labels !== last?.labels || board.serial !== last?.board.serial) {
        mini.clear();
        rivals.forEach(({ name, state }) => { name.setVisible(false); state.setVisible(false); });
        if (opponents?.length) {
          const count = opponents.length;
          const height = (cardsHeight - (count - 1) * orbitGutter) / count;
          opponents.forEach((opponent, i) => drawRival(opponent, i, count, cardsTop + i * (height + orbitGutter), height, labels));
        }
        board.next.forEach((color, i) => drawOrbitColorMark(mini, preview[i].x, pairY + 25, color, .92));
      }
      last = current;
    },
    refreshFonts() {
      [next, ...captions, ...numbers, ...rivals.flatMap(({ name, state }) => [name, state])].forEach(text => text.updateText());
      last = undefined;
    },
  };
}
