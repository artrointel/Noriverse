import { tableSize } from '../table.ts';
import { orbitHeight, orbitWidth } from './rules.ts';
import { orbitControls } from './controls.ts';

export const orbitGutter = 12;
export const orbitPixel = 2;
export const orbitSpritePixels = 32;
export const orbitIconPixels = 12;
export const orbitPanePixels = 19;
const cell = (orbitPanePixels + 2) * orbitPixel;
const boardInset = 8;
const paneInset = orbitPixel;

export const orbitBoardFrame = {
  x: orbitGutter, y: orbitGutter, width: orbitWidth * cell + 2 * boardInset, height: orbitHeight * cell + 2 * boardInset,
};
export const orbitGrid = { x: orbitBoardFrame.x + boardInset, y: orbitBoardFrame.y + boardInset,
  width: orbitWidth * cell, height: orbitHeight * cell, cell };
const hudX = orbitBoardFrame.x + orbitBoardFrame.width + orbitGutter;
export const orbitSidebar = { x: hudX, y: orbitBoardFrame.y, width: tableSize - orbitGutter - hudX, height: orbitBoardFrame.height };
export const orbitTabHeight = 36;
export const orbitControlFrame = { x: orbitGutter, y: orbitBoardFrame.y + orbitBoardFrame.height + orbitGutter,
  width: tableSize - 2 * orbitGutter, height: 48 };
export const orbitControlGap = 8;
export const orbitControlWidth = (orbitControlFrame.width - (orbitControls.length - 1) * orbitControlGap) / orbitControls.length;
export const orbitPanes = Array.from({ length: orbitWidth * orbitHeight }, (_, index) => ({
  x: orbitGrid.x + (index % orbitWidth) * cell + paneInset,
  y: orbitGrid.y + Math.floor(index / orbitWidth) * cell + paneInset,
  dark: (index % orbitWidth + Math.floor(index / orbitWidth)) % 2 === 1,
}));
