import type Phaser from 'phaser';

type Graphics = Phaser.GameObjects.Graphics;
export type TargetMark = 'target' | 'capture';
type TileMark = 'origin' | 'arrival' | 'focus' | 'check' | 'capture';
type GuidePalette = 'default' | 'green' | 'muted';

const tileMarks = {
  origin: { tint: 0xa66a39, line: 0xffd49a, fill: .13, edge: .65 },
  arrival: { tint: 0xf0a749, line: 0xffe3ad, fill: .20, edge: .87 },
  focus: { tint: 0x655a9f, line: 0xe5ddff, fill: .14, edge: .99 },
  check: { tint: 0xb3264b, line: 0xffbbc5, fill: .35, edge: .98 },
  capture: { tint: 0x23635a, line: 0xbdffe5, fill: .21, edge: .94 },
} as const;
const greenMarks = {
  origin: { tint: 0x255e43, line: 0x86d8ac },
  arrival: { tint: 0x229567, line: 0xb6f1ca },
  focus: { tint: 0x167653, line: 0xadf4ca },
  capture: { tint: 0x236c56, line: 0xb1f5cf },
};

function corners(layer: Graphics, x: number, y: number, inset: number, length: number) {
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const left = x + dx * inset;
    const top = y + dy * inset;
    layer.beginPath().moveTo(left, top - dy * length).lineTo(left, top - dy * 2)
      .lineTo(left - dx * 2, top).lineTo(left - dx * length, top).strokePath();
  }
}

export function paintTileMark(layer: Graphics, x: number, y: number, size: number, kind: TileMark, palette: GuidePalette = 'default') {
  const mark = tileMarks[kind];
  const { tint, line } = palette === 'muted' ? { tint: 0x525962, line: 0xe2e4e6 }
    : palette === 'green' && kind !== 'check' ? greenMarks[kind] : mark;
  const { fill, edge } = mark;
  const half = size / 2;
  const extent = half - 3;
  const length = size * (kind === 'origin' ? .16 : .22);
  // Several low-opacity passes leave the board grain visible beneath the tint.
  layer.fillStyle(tint, fill * .44).fillRoundedRect(x - half, y - half, size, size, 7);
  layer.fillStyle(tint, fill * .56).fillRoundedRect(x - extent, y - extent, extent * 2, extent * 2, 6);
  layer.lineStyle(1, line, edge * .24).strokeRoundedRect(x - extent, y - extent, extent * 2, extent * 2, 5);
  layer.lineStyle(3.6, palette === 'green' ? 0x102c21 : palette === 'muted' ? 0x26292d : 0x241925, .58);
  corners(layer, x, y, extent, length);
  layer.lineStyle(kind === 'focus' ? 1.7 : 1.3, line, edge);
  corners(layer, x, y, extent, length);
}

export function paintTargetMark(layer: Graphics, x: number, y: number, size: number, kind: TargetMark = 'target', palette: GuidePalette = 'default') {
  if (kind === 'capture') {
    paintTileMark(layer, x, y, size, 'capture', palette);
    return;
  }
  const radius = size * .098;
  const muted = palette === 'muted';
  layer.fillStyle(muted ? 0xb0b3b9 : 0x90e9c9, .14).fillCircle(x, y, radius + 6);
  layer.fillStyle(muted ? 0xc2c5ca : 0x92eacb, .20).fillCircle(x, y, radius + 3);
  layer.fillStyle(muted ? 0x53585f : 0x163e37, .88).fillCircle(x, y, radius + .6);
  layer.lineStyle(1, muted ? 0xd9dbdf : 0xc3f2d9, .88).strokeCircle(x, y, radius);
  layer.fillStyle(muted ? 0xe2e4e8 : 0xc9ffe8, .90).fillCircle(x, y, radius * .48);
}

export function paintGoldRing(layer: Graphics, x: number, y: number, radius: number) {
  layer.lineStyle(4.8, 0x332018, .47).strokeCircle(x, y, radius);
  layer.lineStyle(3, 0xffc673, .23).strokeCircle(x, y, radius);
  layer.lineStyle(1.2, 0xffdf9f, .95).strokeCircle(x, y, radius);
}

export function paintStoneImprint(layer: Graphics, x: number, y: number) {
  layer.fillStyle(0x123729, .67).fillCircle(x, y, 4.7);
  layer.lineStyle(3, 0x70ce9b, .31).strokeCircle(x, y, 4.4);
  layer.lineStyle(1.2, 0xa9f4ca, .95).strokeCircle(x, y, 4.4);
  layer.fillStyle(0xd3fbe5, .94).fillCircle(x, y, 1.5);
}

export function createMoveGhost(scene: Phaser.Scene, size: number) {
  const ghost = scene.add.image(0, 0, '__DEFAULT').setAlpha(.52).setDepth(5).setVisible(false);
  return (position?: readonly [number, number], texture = '__DEFAULT', frame?: string | number) => {
    ghost.setVisible(Boolean(position));
    if (position) ghost.setTexture(texture, frame).setDisplaySize(size, size).setPosition(...position);
  };
}

export function revealMoveMarks(scene: Phaser.Scene, layer: Graphics, animate: boolean) {
  scene.tweens.killTweensOf(layer);
  layer.setAlpha(animate ? .38 : 1);
  if (animate) scene.tweens.add({ targets: layer, alpha: 1, duration: 220, ease: 'Sine.Out' });
}
