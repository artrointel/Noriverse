import type Phaser from 'phaser';
import hudArt from '../../assets/sichuan-hud.webp';

type HudLabel = 'timeLeft' | 'remaining' | 'available' | 'shuffles' | 'elapsed' | 'shuffle' | 'hint';
export type SichuanHudView = {
  status: string; description: string; feedback?: string;
  startedAt: number; endedAt?: number; remaining: number; available: number; shuffles: number;
  labels: Record<HudLabel, string>;
  shuffle?: () => void; hint?: () => void;
};

const clockText = (seconds: number) => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
const buttonTop = 572, buttonHeight = 44;
const texture = 'sichuan-hud';
const metricNames = ['timeLeft', 'remaining', 'available', 'shuffles', 'elapsed'] as const;
const frame = (x: number, y: number, w: number, h: number) => ({ frame: { x, y, w, h } });

export function loadSichuanHud(scene: Phaser.Scene) {
  scene.load.atlas(texture, hudArt, { frames: {
    panel: frame(0, 0, 960, 300), rail: frame(0, 304, 896, 102),
    shuffleButton: frame(0, 410, 532, 84), hintButton: frame(536, 410, 316, 84),
    ...Object.fromEntries([...metricNames, 'shuffle', 'hint'].map((key, index) => [key, frame(4 + index * 52, 498, 48, 42)])),
  } });
}

export function createSichuanHud(scene: Phaser.Scene) {
  const image = (x: number, y: number, key: string, width: number, height: number) => scene.add.image(x, y, texture, key)
    .setDisplaySize(width, height).setDepth(8);
  image(240, 560, 'panel', 472, 156);
  image(240, 543, 'rail', 424, 49);
  const fontFamily = 'system-ui, "Malgun Gothic", sans-serif';
  const text = (x: number, y: number, fontSize: number, bold = false) => scene.add.text(x, y, '', {
    fontFamily, fontSize, fontStyle: bold ? 'bold' : 'normal', color: '#fff7e2',
  }).setResolution(2).setOrigin(0, .5).setDepth(9);
  const status = text(31, 503, 15, true);
  const description = text(446, 503, 11).setOrigin(1, .5).setColor('#e1d2f2');
  const feedback = text(240, 624, 11).setOrigin(.5).setColor('#f6d794');
  const metrics = metricNames.map((key, i) => {
    const x = 74 + i * 83;
    return { key, icon: image(x - 23, 537, key, 18, 16), label: text(x, 555, 11).setOrigin(.5).setColor('#e4d6f1'),
      value: text(x + 9, 537, 19, true).setOrigin(.5) };
  });
  const makeButton = (key: 'shuffle' | 'hint', x: number, width: number) => {
    const y = buttonTop + buttonHeight / 2;
    return { key, x, width, plate: image(x + width / 2, y, key + 'Button', width, buttonHeight),
      icon: image(x + 25, y, key, 20, 18).setDepth(9), label: text(x + width / 2 + 8, y, 14, true).setOrigin(.5) };
  };
  const buttons = [makeButton('shuffle', 29, 268), makeButton('hint', 304, 147)];
  let lastLabels: Record<HudLabel, string> | undefined;
  let backgroundState = '';
  let hotButton: HudLabel | undefined;
  let lowTime = false;

  function update(view: SichuanHudView, deadline: number) {
    const active = Boolean(view.startedAt);
    const now = view.endedAt ?? Date.now();
    const elapsed = active ? Math.max(0, Math.floor((now - view.startedAt) / 1000)) : 0;
    const remaining = active ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
    const values = { timeLeft: active ? clockText(remaining) : '–:––', remaining: view.remaining,
      available: view.available, shuffles: view.shuffles, elapsed: clockText(elapsed) };
    const state = [Boolean(view.shuffle), Boolean(view.hint), hotButton].join('/');
    if (state !== backgroundState) {
      backgroundState = state;
      for (const { key, plate, icon, label } of buttons) {
        const enabled = Boolean(view[key]);
        const primary = key === 'shuffle';
        plate.setTint(!enabled ? 0x988caa : hotButton === key ? 0xffe6b4 : 0xffffff).setAlpha(enabled ? 1 : .55);
        icon.setTint(enabled && primary ? 0x783918 : 0xffffff).setAlpha(enabled ? 1 : .66);
        label.setColor(enabled && primary ? '#2b1728' : '#fff5e6');
      }
    }
    status.setText(view.status).setScale(Math.min(1, 224 / Math.max(1, status.width)), 1);
    description.setText(view.description).setScale(Math.min(1, 181 / Math.max(1, description.width)), 1);
    feedback.setText(view.feedback ?? '').setScale(Math.min(1, 404 / Math.max(1, feedback.width)), 1);
    if (view.labels !== lastLabels) {
      lastLabels = view.labels;
      for (const { key, label } of [...metrics, ...buttons]) label.setText(view.labels[key]);
    }
    for (const { key, value } of metrics) value.setText(String(values[key]));
    const low = active && remaining <= 10;
    if (low !== lowTime) {
      lowTime = low;
      metrics[0].value.setColor(low ? '#ffaf69' : '#fff7e2');
      metrics[0].icon.setTint(low ? 0xff9e52 : 0xffffff);
    }
  }

  function hitTest(x: number, y: number) {
    return y >= buttonTop && y <= buttonTop + buttonHeight ? buttons.find(button => x >= button.x && x <= button.x + button.width)?.key : undefined;
  }

  return { update, hitTest, setHover(key: ReturnType<typeof hitTest>) { hotButton = key; } };
}
