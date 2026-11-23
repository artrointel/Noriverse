import type Phaser from 'phaser';
import { cardRerollLimit } from './cards.ts';
import type { BurgerCard } from './cards.ts';
import surfaces from '../../assets/burger/card-surfaces.webp';
import emblems from '../../assets/burger/card-emblems.webp';

export type CardHud = {
  showDraft: boolean;
  title: string; instruction: string; lockedInstruction: string; history: string; empty: string;
  reroll: (remaining: number, limit: number) => string;
  describe: (card: BurgerCard) => { category: 'unlock' | 'guest' | 'special'; tag: string; name: string; detail: string };
};
type CardSprite = { texture: string; frame?: number };
type CardZone = { x: number; y: number; w: number; h: number };
export type CardHit = 'card-choice' | 'card-reroll' | 'card-page' | 'card-close';
type CardDraw = {
  image: (sprite: CardSprite, x: number, y: number, width: number, height: number, depth: number, alpha?: number, stretch?: boolean) => void;
  text: (text: string, x: number, y: number, size: number, color: string, maxWidth?: number) => void;
  hit: (type: CardHit, index: number, zone: CardZone) => void;
  item: (name: string) => CardSprite;
};

const faces = 'burger-card-surfaces';
const symbols = 'burger-card-emblems';
const emblemFrame = { rush: 1, patient: 2, advertise: 3, picky: 4, simple: 5,
  broom: 6, griddle: 7, assembly: 8, storage: 9, table: 10, tray: 11, highHeat: 7, autoGrill: 7 } as const;
const categories = { unlock: { frame: 0, color: '#20624f' }, guest: { frame: 1, color: '#723d21' },
  special: { frame: 2, color: '#62346e' } };
export const cardDeck = { texture: symbols, frame: 0 };
export const cardsPerPage = 3;

export function loadCardArt(scene: Phaser.Scene) {
  scene.load.spritesheet(faces, surfaces, { frameWidth: 192, frameHeight: 320, margin: 4, spacing: 4 });
  scene.load.spritesheet(symbols, emblems, { frameWidth: 80, frameHeight: 80, margin: 4, spacing: 4 });
}

export function drawCardHud(copy: CardHud, draw: CardDraw,
  draft: { offers: readonly BurgerCard[]; canChoose: boolean; rerollsLeft: number } | undefined,
  history: readonly BurgerCard[], page: number) {
  const unique = [...new Set(history)];
  const pages = Math.max(1, Math.ceil(unique.length / cardsPerPage));
  const { offers, canChoose, rerollsLeft = 0 } = draft ?? {};
  const visible = offers ?? unique.slice(page * cardsPerPage, (page + 1) * cardsPerPage);
  draw.image({ texture: faces, frame: 3 }, 240, 160, 464, 307, 51, 1, true);
  draw.image(cardDeck, 240, 47, 28, 28, 52);
  draw.text(offers ? copy.title : copy.history, 240, 75, 17, '#ffedd2', 360);
  if (offers) draw.text(canChoose ? copy.instruction : copy.lockedInstruction, 240, 91, 9, '#f7ddba', 397);
  if (!visible.length) draw.text(copy.empty, 240, 155, 13, '#513347', 315);

  visible.forEach((card, index) => {
    const x = 240 + (index - (visible.length - 1) / 2) * 140;
    const { category, tag, name, detail } = copy.describe(card);
    const { frame, color } = categories[category];
    const stock = card.includes(':') ? card.slice(card.indexOf(':') + 1) : undefined;
    draw.image({ texture: faces, frame }, x, 184, 131, 164, 52, 1, true);
    draw.image(stock ? draw.item(stock) : { texture: symbols, frame: emblemFrame[card as keyof typeof emblemFrame] }, x, 173, 46, 38, 53);
    if (card === 'highHeat') draw.image({ texture: symbols, frame: 1 }, x + 21, 173, 25, 25, 54);
    if (card === 'autoGrill') draw.image({ texture: 'burger-spatula' }, x + 21, 173, 18, 25, 54);
    if (card.startsWith('sold:')) draw.text('×', x + 18, 172, 15, '#9c2942');
    draw.text(tag, x, 143, 9, '#3c2331', 106);
    draw.text(name, x, 200, 13, color, 106);
    const separator = detail.indexOf(' · ');
    const lines = separator < 0 ? [detail] : [detail.slice(0, separator), detail.slice(separator + 3)];
    lines.forEach((line, i) => draw.text(line, x, 220 + i * 13, 9, '#493843', 108));
    if (offers) {
      if (canChoose) draw.hit('card-choice', index, { x: x - 65, y: 102, w: 130, h: 163 });
    } else {
      const count = history.filter(item => item === card).length;
      if (count > 1) draw.text('×' + count, x, 250, 8, color);
    }
  });

  if (offers) {
    const enabled = canChoose && rerollsLeft > 0;
    draw.image(cardDeck, 183, 282, 18, 18, 54, enabled ? 1 : .45);
    draw.text(copy.reroll(rerollsLeft, cardRerollLimit), 250, 282, 11, enabled ? '#20624f' : '#786b64', 124);
    if (enabled) draw.hit('card-reroll', 0, { x: 165, y: 270, w: 155, h: 26 });
    return;
  }
  draw.text('×', 429, 52, 17, '#ffedd2');
  draw.hit('card-close', 0, { x: 411, y: 34, w: 38, h: 36 });
  if (pages > 1) {
    draw.text(`${page + 1} / ${pages}`, 240, 282, 10, '#4f3852');
    for (const delta of [-1, 1]) {
      if (page + delta < 0 || page + delta >= pages) continue;
      const x = 240 + delta * 50;
      draw.text(delta < 0 ? '‹' : '›', x, 282, 18, '#663553');
      draw.hit('card-page', delta, { x: x - 20, y: 266, w: 40, h: 31 });
    }
  }
}
