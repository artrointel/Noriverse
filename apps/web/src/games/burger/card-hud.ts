import Phaser from 'phaser';
import { assemblerArt, cupTexture } from './art.ts';
import { cardRerollLimit, cardXpPercent } from './cards.ts';
import type { BurgerCard } from './cards.ts';
import surfaces from '../../assets/burger/card-surfaces.webp';
import emblems from '../../assets/burger/card-emblems.webp';
import panelArt from '../../assets/burger/card-panel.webp';
import storeIconArt from '../../assets/burger/store-status.webp';

export type CardHud = {
  showDraft: boolean;
  title: string; instruction: string; lockedInstruction: string; confirmed: string; history: string; empty: string;
  reroll: (remaining: number, limit: number) => string;
  describe: (card: BurgerCard) => { category: 'unlock' | 'guest' | 'special'; tag: string; name: string; detail: string };
};
type CardSprite = { texture: string; frame?: number };
type CardZone = { x: number; y: number; w: number; h: number };
export type CardHit = 'card-choice' | 'card-reroll' | 'card-page' | 'card-close';
type CardPaint = {
  image: (sprite: CardSprite, x: number, y: number, width: number, height: number, depth: number, alpha?: number) => void;
  text: (text: string, x: number, y: number, size: number, color: string, maxWidth?: number) => void;
};
type CardDraw = CardPaint & {
  card: (index: number, x: number, y: number, selected: boolean) => CardPaint;
  hit: (type: CardHit, index: number, zone: CardZone) => void;
  item: (name: string) => CardSprite;
};

const faces = 'burger-card-surfaces';
const symbols = 'burger-card-emblems';
const emblemFrame = { rush: 1, patient: 2, advertise: 3, picky: 4, simple: 5,
  broom: 6, griddle: 7, assembly: 8, storage: 9, orderStorage: 9, table: 10, tray: 11, highHeat: 7, autoGrill: 7, highHeat2: 7, autoGrill2: 7 } as const;
const categories = { unlock: { frame: 0, color: '#20624f' }, guest: { frame: 1, color: '#723d21' },
  special: { frame: 2, color: '#62346e' } };
export const cardDeck = { texture: symbols, frame: 0 };
export const cardPanel = { texture: 'burger-card-panel' };
export const storeStatusIcon = { texture: 'burger-store-status' };
export const cardsPerPage = 3;

export function loadCardArt(scene: Phaser.Scene) {
  scene.load.image(cardPanel.texture, panelArt);
  scene.load.image(storeStatusIcon.texture, storeIconArt);
  scene.load.spritesheet(faces, surfaces, { frameWidth: 396, frameHeight: 504, margin: 4, spacing: 4 });
  scene.load.spritesheet(symbols, emblems, { frameWidth: 80, frameHeight: 80, margin: 4, spacing: 4 });
}

export function prepareCardArt(scene: Phaser.Scene) {
  for (const key of [faces, symbols, cardPanel.texture, storeStatusIcon.texture]) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (const { frame } of Object.values(categories)) grayscaleCardSprite(scene, { texture: faces, frame });
}

const luminance = (red: number, green: number, blue: number) => .2126 * red + .7152 * green + .0722 * blue;

export function grayscaleCardSprite(scene: Phaser.Scene, sprite: CardSprite): CardSprite {
  const key = `burger-card-gray:${sprite.texture}:${sprite.frame ?? 'base'}`;
  if (scene.textures.exists(key)) return { texture: key };
  const frame = scene.textures.getFrame(sprite.texture, sprite.frame);
  const gray = frame && scene.textures.createCanvas(key, frame.cutWidth, frame.cutHeight);
  if (!gray) return sprite;
  gray.drawFrame(sprite.texture, sprite.frame, 0, 0, false);
  const pixels = gray.context.getImageData(0, 0, gray.width, gray.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const light = luminance(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = light;
  }
  gray.context.putImageData(pixels, 0, 0);
  gray.refresh().setFilter(Phaser.Textures.FilterMode.LINEAR);
  return { texture: key };
}

export function cardTextColor(hex: string, saturation: number) {
  if (saturation >= 1) return hex;
  const { red, green, blue } = Phaser.Display.Color.HexStringToColor(hex);
  const gray = luminance(red, green, blue);
  const mix = (channel: number) => Math.round(gray + (channel - gray) * saturation);
  return `rgb(${mix(red)}, ${mix(green)}, ${mix(blue)})`;
}

export function drawCardHud(copy: CardHud, draw: CardDraw,
  draft: { offers: readonly BurgerCard[]; canChoose: boolean; rerollsLeft: number; selected?: BurgerCard } | undefined,
  history: readonly BurgerCard[], page: number) {
  const unique = [...new Set(history)];
  const pages = Math.max(1, Math.ceil(unique.length / cardsPerPage));
  const { offers, canChoose, rerollsLeft = 0, selected } = draft ?? {};
  const visible = selected && !offers?.includes(selected) ? [selected] : offers ?? unique.slice(page * cardsPerPage, (page + 1) * cardsPerPage);
  draw.image(cardPanel, 240, 160, 464, 307, 51);
  draw.image(cardDeck, 240, 46, 27, 27, 52);
  draw.text(selected ? copy.confirmed : offers ? copy.title : copy.history, 240, 71, 18, '#ffedd2', 360);
  if (offers && !selected) draw.text(canChoose ? copy.instruction : copy.lockedInstruction, 240, 89, 9, '#f7ddba', 397);
  if (!visible.length) draw.text(copy.empty, 240, 155, 13, '#f7ddba', 315);

  visible.forEach((card, index) => {
    const x = 240 + (index - (visible.length - 1) / 2) * 140;
    const paint = draw.card(index, x, 184, card === selected);
    const { category, tag, name, detail } = copy.describe(card);
    const { frame, color } = categories[category];
    const stock = card.includes(':') ? card.slice(card.indexOf(':') + 1) : undefined;
    paint.image({ texture: faces, frame }, x, 184, 132, 168, 52);
    const emblem = card === 'autoAssembly' ? { texture: assemblerArt.texture, frame: assemblerArt.waiting }
      : { texture: symbols, frame: emblemFrame[card as keyof typeof emblemFrame] };
    paint.image(stock ? draw.item(stock) : emblem, x, 166, 50, 45, 53);
    if (card === 'highHeat' || card === 'highHeat2') paint.image({ texture: symbols, frame: 1 }, x + 21, 166, 25, 25, 54);
    if (card === 'autoGrill' || card === 'autoGrill2') paint.image({ texture: 'burger-spatula' }, x + 21, 166, 18, 25, 54);
    if (card === 'orderStorage') paint.image({ texture: cupTexture('cola', 'medium') }, x + 21, 166, 19, 25, 54);
    if (card === 'highHeat2' || card === 'autoGrill2') paint.text('Ⅱ', x + 35, 147, 12, color);
    if (card.startsWith('sold:')) paint.text('×', x + 18, 165, 15, '#9c2942');
    paint.text(tag, x, 127, 9, '#3c2331', 63);
    paint.text(name, x, 203, 13, color, 110);
    const separator = detail.indexOf(' · ');
    const lines = separator < 0 ? [detail] : [detail.slice(0, separator), detail.slice(separator + 3)];
    lines.forEach((line, i) => paint.text(line, x, 222 + i * 13, 9, '#493843', 111));
    const xp = cardXpPercent(card);
    if (xp) paint.text(`XP ${xp > 0 ? '+' : '−'}${Math.abs(xp)}%`, x, 250, 10, xp > 0 ? '#20624f' : '#9c2942', 78);
    if (offers) {
      if (canChoose) draw.hit('card-choice', index, { x: x - 65, y: 102, w: 130, h: 163 });
    } else {
      const count = history.filter(item => item === card).length;
      if (count > 1) draw.text('×' + count, x + 40, 250, 8, color);
    }
  });

  if (offers) {
    if (selected) return;
    const enabled = canChoose && rerollsLeft > 0;
    draw.image(cardDeck, 178, 283, 18, 18, 54, enabled ? 1 : .55);
    draw.text(copy.reroll(rerollsLeft, cardRerollLimit), 253, 283, 11, enabled ? '#ffedd2' : '#c2bfaa', 124);
    if (enabled) draw.hit('card-reroll', 0, { x: 165, y: 270, w: 155, h: 26 });
    return;
  }
  draw.text('×', 429, 52, 17, '#ffedd2');
  draw.hit('card-close', 0, { x: 411, y: 34, w: 38, h: 36 });
  if (pages > 1) {
    draw.text(`${page + 1} / ${pages}`, 240, 282, 10, '#f7ddba');
    for (const delta of [-1, 1]) {
      if (page + delta < 0 || page + delta >= pages) continue;
      const x = 240 + delta * 50;
      draw.text(delta < 0 ? '‹' : '›', x, 282, 18, '#ffedd2');
      draw.hit('card-page', delta, { x: x - 20, y: 266, w: 40, h: 31 });
    }
  }
}
