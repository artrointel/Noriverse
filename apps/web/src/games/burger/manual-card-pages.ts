import { assemblerArt, burgerFoodFrames, cupTexture } from './art.ts';
import { burgerGrillMultiplier } from './rules.ts';
import type { BurgerCard } from './cards.ts';

type ManualArt = { texture: string; frame?: number; x: number; y: number; size: number; angle?: number };
type ManualCardPage = {
  id: BurgerCard | 'unlock' | 'sold';
  title: string;
  art: readonly ManualArt[];
  stat?: string;
};

const food = (item: keyof typeof burgerFoodFrames, x: number, size: number): ManualArt =>
  ({ texture: 'burger-food', frame: burgerFoodFrames[item], x, y: 87, size });
const patty = (x: number, size: number): ManualArt => ({ texture: 'burger-patties', frame: 3, x, y: 89, size });
const spatula = { texture: 'burger-spatula', x: 133, y: 87, size: 49, angle: -.65 };
const drink = { texture: cupTexture('cola', 'medium'), x: 134, y: 87, size: 47 };
const speed = (card: 'highHeat' | 'highHeat2') => `+${Math.round((burgerGrillMultiplier([card]) - 1) * 100)}%`;

export const manualCardPages: readonly ManualCardPage[] = [
  { id: 'autoGrill', title: 'burgerCard_autoGrill', art: [patty(74, 59), spatula] },
  { id: 'autoGrill2', title: 'burgerCard_autoGrill2', art: [patty(59, 53), patty(130, 29)] },
  { id: 'highHeat', title: 'burgerCard_highHeat', art: [patty(74, 62)], stat: speed('highHeat') },
  { id: 'highHeat2', title: 'burgerCard_highHeat2', art: [patty(74, 62)], stat: speed('highHeat2') },
  { id: 'broom', title: 'burgerCard_broom', art: [
    { texture: 'burger-guests', frame: 0, x: 69, y: 87, size: 57 },
    { texture: 'burger-broom', x: 134, y: 87, size: 56, angle: -.7 },
  ] },
  { id: 'autoAssembly', title: 'burgerCard_autoAssembly', art: [
    { texture: assemblerArt.texture, frame: assemblerArt.waiting, x: 64, y: 87, size: 58 },
    { texture: assemblerArt.texture, frame: assemblerArt.assembling, x: 105, y: 87, size: 58 },
    { texture: assemblerArt.texture, frame: assemblerArt.cooldown, x: 146, y: 87, size: 58 },
  ] },
  { id: 'storage', title: 'burgerCard_storage', art: [food('wrap', 105, 69)] },
  { id: 'orderStorage', title: 'burgerCard_orderStorage', art: [food('wrap', 77, 59), drink] },
  { id: 'unlock', title: 'burgerManualCard_unlockTitle', art: [food('cheese', 75, 53), drink] },
  { id: 'sold', title: 'burgerManualCard_soldTitle', art: [
    food('cheese', 75, 53),
    { texture: 'burger-lid', x: 131, y: 89, size: 57 },
  ] },
];
