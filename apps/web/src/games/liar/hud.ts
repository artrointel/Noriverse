import type Phaser from 'phaser';
import hudArt from '../../assets/liar-hud.webp';

export type LiarHudView = {
  phase: string; clock?: string; lowTime: boolean;
  card: { open: boolean; title: string; topic: string; subtitle: string };
  scoreLabel: string; players: { name: string; score: string }[];
};

const texture = 'liar-hud';
const frame = (x: number, y: number) => ({ frame: { x, y, w: 384, h: 160 } });

export function loadLiarHud(scene: Phaser.Scene) {
  scene.load.atlas(texture, hudArt, { frames: {
    panel: frame(0, 0), timer: frame(384, 0), back: frame(0, 160), face: frame(384, 160),
  } });
}

export function createLiarHud(scene: Phaser.Scene) {
  const art = (x: number, y: number, frame: string, width: number, height: number) => scene.add.image(x, y, texture, frame)
    .setDisplaySize(width, height);
  const text = (x: number, y: number, size: number, color: string, bold = false) => scene.add.text(x, y, '', {
    color, fontSize: size, fontStyle: bold ? 'bold' : 'normal', fontFamily: 'system-ui, "Malgun Gothic", sans-serif',
  }).setResolution(2).setOrigin(.5);
  const fit = (label: Phaser.GameObjects.Text, value: string, max: number) => {
    label.setText(value).setScale(Math.min(1, max / Math.max(1, label.width)), 1);
  };

  art(240, 32, 'panel', 340, 34);
  const timer = art(359, 32, 'timer', 72, 24);
  const phase = text(196, 32, 14, '#fff1de', true);
  const clock = text(359, 32, 13, '#fff1de', true);
  const card = art(240, 120, 'back', 264, 126);
  const topic = text(240, 84, 12, '#583044');
  const cardTitle = text(240, 119, 25, '#361934', true);
  const caption = text(240, 153, 11, '#704259');
  art(240, 218, 'panel', 428, 55);
  const scoreLabel = text(240, 201, 10, '#f9d9a0', true);
  const names = Array.from({ length: 4 }, () => ({
    name: text(0, 219, 11, '#fff1de', true), score: text(0, 234, 11, '#ffd2a1', true),
  }));
  let previous: LiarHudView | undefined;
  return {
    update(view: LiarHudView) {
      if (view === previous) return;
      previous = view;
      fit(phase.setX(view.clock ? 196 : 240), view.phase, view.clock ? 211 : 300);
      timer.setVisible(Boolean(view.clock));
      clock.setText(view.clock ?? '').setColor(view.lowTime ? '#ffbf8c' : '#fff1de');
      const open = view.card.open;
      card.setFrame(open ? 'face' : 'back').setDisplaySize(264, 126);
      fit(topic.setColor(open ? '#583044' : '#ffdea9'), view.card.topic, 204);
      fit(cardTitle.setY(open ? 119 : 150).setFontSize(open ? 25 : 13).setColor(open ? '#361934' : '#fff1de'), view.card.title, 226);
      fit(caption.setY(open ? 153 : 167).setColor(open ? '#704259' : '#ffe3c6'), view.card.subtitle, 214);
      fit(scoreLabel, view.scoreLabel, 230);
      names.forEach(({ name, score }, i) => {
        const player = view.players[i];
        name.setVisible(Boolean(player));
        score.setVisible(Boolean(player));
        if (!player) return;
        const x = 51 + 378 * ((i + .5) / view.players.length);
        fit(name.setX(x), player.name, 86);
        fit(score.setX(x), player.score, 86);
      });
    },
  };
}
