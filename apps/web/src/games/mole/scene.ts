import { gameFontFamily } from '../game-font.ts';
import type Phaser from 'phaser';
import type { SceneFactory } from '../scene-loader.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';
import { playMoleSound } from '../../platform/audio.ts';
import { tableSize } from '../table.ts';
import type { MoleBoard, MoleStrike, MoleTarget } from './rules.ts';
import { feverDuration, feverThreshold, giantDuration, moleRemaining } from './rules.ts';
import { createMoleBackground, loadMoleBackground } from './background.ts';
import { hammerGrip, hammerHeadOffset, hammerSwing } from './hammer.ts';
import { createFeverEffects, loadFeverEffects } from './fever-effects.ts';
import props from '../../assets/mole/props.webp';
import solori from '../../assets/mole/crew/solori.webp';
import toring from '../../assets/mole/crew/toring.webp';
import kommi from '../../assets/mole/crew/kommi.webp';
import talgak from '../../assets/mole/crew/talgak.webp';
import bilmong from '../../assets/mole/crew/bilmong.webp';
import jiena from '../../assets/mole/crew/jiena.webp';

export type MoleView = {
  id: string;
  size: 3 | 4;
  board: MoleBoard;
  labels: Record<'score' | 'time' | 'combo' | 'giant' | 'fog' | 'decoys', string>;
  language: 'ko' | 'en';
  hit: (target: number) => void;
  active: boolean;
  clockOffset: number;
  start: number;
  limit: number;
  hardEnd?: number;
  rivals: { role: Role; name: string; score: number; out: boolean; strike?: MoleStrike; feverUntil: number }[];
};

const crew = [solori, toring, kommi, talgak, bilmong, jiena];
const actorKey = (character: number) => 'mole-crew-' + character;
const pose = { emerge: 0, idle: 1, blink: 2, hide: 3, startled: 4, hit: 5 } as const;
const propsKey = 'mole-props';
const holeFrame = 0, hammerFrame = 1, burstFrame = 2, panelFrame = 3;
const half = tableSize / 2;
const gold = '#fff2a8';
const silver = '#f6ecff';
type TargetArt = { root: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Image;
  marker: Phaser.GameObjects.Text; timer: Phaser.GameObjects.Rectangle; target: MoleTarget; reactedUntil: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function moleCell(size: number, cell: number) {
  const step = size === 4 ? 95 : 117;
  const first = half - step * (size - 1) / 2;
  const y = 267 - step * (size - 1) / 2;
  return { x: first + (cell % size) * step, y: y + Math.floor(cell / size) * step, step };
}

export const moleScene: SceneFactory = view => {
  const targets = new Map<number, TargetArt>();
  const heard = new Map<Role, { strikeId: number; feverUntil: number }>();
  let lastRivalHit = -Infinity;
  let driftBackground: (time: number) => void;
  let showFever: ReturnType<typeof createFeverEffects>;
  let scenery: Phaser.GameObjects.Container;
  let keyboardRing: Phaser.GameObjects.Ellipse;
  let giant: Phaser.GameObjects.Container;
  let giantActor: Phaser.GameObjects.Image;
  let giantMeter: Phaser.GameObjects.Rectangle;
  let giantTitle: Phaser.GameObjects.Text;
  let fog: Phaser.GameObjects.Container;
  let nebulae: Phaser.GameObjects.Ellipse[];
  let fogTitle: Phaser.GameObjects.Text;
  let alert: Phaser.GameObjects.Text;
  let rivalCards: { root: Phaser.GameObjects.Container; name: Phaser.GameObjects.Text; score: Phaser.GameObjects.Text }[];
  let values: Phaser.GameObjects.Text[];
  let labels: Phaser.GameObjects.Text[];
  let comboMeter: Phaser.GameObjects.Rectangle;
  let key = '';
  let strikeId = 0;
  let feverUntil = 0;
  let fogUntil = 0;
  let wasGiant = false;
  let shownClock: string | undefined;
  let shownScore: number | undefined;
  let shownCombo: number | undefined;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion = () => !reducedMotion.matches;
  const worldTime = (data: MoleView) => Date.now() - data.clockOffset;
  const textStyle = (size: number, color = silver) => ({ fontFamily: gameFontFamily, fontSize: size, color, stroke: '#231533', strokeThickness: 3 });

  function reset(scene: Phaser.Scene, data: MoleView) {
    key = data.id + ':' + data.size;
    scenery.removeAll(true);
    for (const value of targets.values()) value.root.destroy();
    targets.clear();
    heard.clear();
    lastRivalHit = -Infinity;
    for (const rival of data.rivals) heard.set(rival.role, { strikeId: rival.strike?.id ?? 0, feverUntil: rival.feverUntil });
    strikeId = 0;
    feverUntil = fogUntil = 0;
    wasGiant = false;
    shownClock = undefined;
    shownScore = shownCombo = undefined;
    for (let cell = 0; cell < data.size ** 2; cell++) {
      const { x, y, step } = moleCell(data.size, cell);
      const shadow = scene.add.ellipse(x, y + 22, step * .83, step * .33, 0x0d0720, .43);
      const hole = scene.add.image(x, y + 14, propsKey, holeFrame).setDisplaySize(step * .89, step * .50);
      scenery.add([shadow, hole]);
    }
    values[0].setText('0');
    values[2].setText('0');
  }

  function addTarget(scene: Phaser.Scene, size: number, target: MoleTarget) {
    const { x, y, step } = moleCell(size, target.cell);
    const root = scene.add.container(x, y).setDepth(12).setAlpha(0);
    const tint = target.kind === 'trap' ? 0xdc5879 : target.kind === 'bonus' ? 0xffd477 : target.kind === 'armored' ? 0xc8bbff : 0x8cf0d7;
    const ring = scene.add.ellipse(0, 13, step * .78, step * .43, tint, target.kind === 'trap' ? .34 : .16)
      .setStrokeStyle(target.kind === 'trap' ? 2.8 : 1.5, tint, .85);
    const sprite = scene.add.image(0, -4, actorKey(target.character), pose.emerge).setOrigin(.5, .65).setDisplaySize(step * .87, step * .87);
    const indicator = target.kind === 'bonus' ? '★' : target.kind === 'armored' ? String(target.hp) : '';
    const marker = scene.add.text(step * .29, -step * .30, indicator,
      { ...textStyle(19, target.kind === 'trap' ? '#ffb7cb' : gold), backgroundColor: '#211535', padding: { x: 5, y: 1 } })
      .setOrigin(.5).setVisible(Boolean(indicator));
    const timer = scene.add.rectangle(0, step * .26, step * .58, 2.5, tint, .9).setOrigin(.5);
    root.add([ring, sprite, marker, timer]);
    if (target.kind === 'trap') {
      const x = step * .29, y = -step * .28;
      const warning = scene.add.circle(x, y, 14, 0xb20d37).setStrokeStyle(2.4, 0xffecd1);
      const cross = scene.add.graphics().lineStyle(3.8, 0xffffff);
      cross.beginPath().moveTo(x - 4.8, y - 4.8).lineTo(x + 4.8, y + 4.8)
        .moveTo(x + 4.8, y - 4.8).lineTo(x - 4.8, y + 4.8).strokePath();
      root.add([scene.add.circle(x, y + 1, 16, 0x220c27, .9), warning, cross]);
    }
    targets.set(target.id, { root, sprite, marker, timer, target, reactedUntil: 0 });
    return targets.get(target.id)!;
  }

  function strikeSound(strike: MoleStrike, distant = false) {
    const effect = strike.kind === 'crew' ? 'bop' : strike.kind === 'armored' ? 'armor' : strike.kind;
    playMoleSound(effect, distant, strike.id);
  }

  function animateStrike(scene: Phaser.Scene, data: MoleView, strike: MoleStrike, onContact: () => void) {
    const mega = strike.kind === 'giant';
    const position = mega ? { x: half + Math.sin(strike.id * 2.1) * 75, y: 260 + Math.cos(strike.id * 2.1) * 51 }
      : moleCell(data.size, Math.max(0, strike.cell));
    const { x, y } = position;
    const trajectory = hammerSwing(strike.id, mega || !motion());
    const size = mega ? 116 : 102;
    const contact = trajectory.pose(trajectory.contactAt);
    const head = hammerHeadOffset(size, contact.angle, trajectory.mirrored);
    const sprite = scene.add.image(x, y, propsKey, hammerFrame).setDisplaySize(size, size)
      .setDepth(75).setFlipX(trajectory.mirrored).setOrigin(trajectory.mirrored ? 1 - hammerGrip.x : hammerGrip.x, hammerGrip.y);
    let landed = false;
    function step(at: number) {
      const frame = trajectory.pose(at);
      sprite.setPosition(x - head.x + frame.x, y - 13 - head.y + frame.y).setAngle(frame.angle).setAlpha(frame.alpha);
      if (!landed && at >= trajectory.contactAt) {
        landed = true;
        onContact();
        if (key === data.id + ':' + data.size) impact(scene, x, y, strike);
      }
    }
    step(0);
    scene.tweens.addCounter({ from: 0, to: trajectory.endAt, duration: trajectory.endAt,
      onUpdate: tween => step(tween.getValue() ?? 0), onComplete: () => { step(trajectory.endAt); sprite.destroy(); } });
  }

  function impact(scene: Phaser.Scene, x: number, y: number, strike: MoleStrike) {
    const mega = strike.kind === 'giant';
    const trap = strike.kind === 'trap';
    const heavy = strike.kind === 'bonus' || strike.kind === 'armored' || strike.fever;
    const hue = trap ? 0xff67a4 : heavy ? 0xfee098 : 0xb8ffef;
    const burst = scene.add.image(x, y - 5, propsKey, burstFrame).setScale(.16).setTint(hue).setDepth(74);
    const label = strike.points > 0 ? '+' + strike.points : String(strike.points || '✦');
    const points = scene.add.text(x, y - 19, label, textStyle(heavy ? 27 : 22, trap ? '#ffb1ce' : gold)).setOrigin(.5).setDepth(76);
    if (strike.timeDelta) {
      const seconds = (strike.timeDelta / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
      const delta = scene.add.text(x, y + 4, (strike.timeDelta > 0 ? '+' : '') + seconds + 's',
        textStyle(15, trap ? '#ffb1ce' : '#b8ffef')).setOrigin(.5).setDepth(76);
      scene.tweens.add({ targets: delta, y: y - 25, alpha: 0, duration: 620, ease: 'Cubic.easeOut', onComplete: () => delta.destroy() });
    }
    scene.tweens.add({ targets: burst, scale: heavy ? .66 : .48, alpha: 0, duration: heavy ? 340 : 215, ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy() });
    scene.tweens.add({ targets: points, y: y - 56, alpha: 0, duration: mega ? 275 : 520, ease: 'Cubic.easeOut', onComplete: () => points.destroy() });
    for (let i = 0; i < (motion() ? heavy ? 11 : 6 : 3); i++) {
      const angle = i * 2.4 + strike.id;
      const radius = (18 + (i % 4) * 8) * (heavy ? 1.5 : 1);
      const spark = scene.add.rectangle(x, y, 4 + i % 3, 4 + i % 3, hue, .95).setAngle(i * 39).setDepth(74);
      scene.tweens.add({ targets: spark, x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius,
        scale: .3, alpha: 0, duration: 190 + i * 15, ease: 'Cubic.easeOut', onComplete: () => spark.destroy() });
    }
    if (motion() && (heavy || trap || mega)) scene.cameras.main.shake(115, trap ? .004 : heavy ? .005 : .003);
    if (mega && giant.visible) {
      giantActor.setFrame(strike.id % 2 ? pose.hit : pose.startled).setDisplaySize(326, 295);
      scene.tweens.killTweensOf(giantActor);
      scene.tweens.add({ targets: giantActor, angle: (strike.id % 2 ? 1 : -1) * 3,
        scaleY: giantActor.scaleY * .93, duration: 65, yoyo: true, onComplete: () => giantActor.setFrame(pose.idle).setDisplaySize(326, 295) });
    }
    strikeSound(strike);
  }

  return {
    preload() {
      loadMoleBackground(this);
      loadFeverEffects(this);
      crew.forEach((atlas, character) => this.load.spritesheet(actorKey(character), atlas, { frameWidth: 192, frameHeight: 192 }));
      this.load.spritesheet(propsKey, props, { frameWidth: 256, frameHeight: 256 });
    },
    create() {
      driftBackground = createMoleBackground(this);
      showFever = createFeverEffects(this);
      scenery = this.add.container(0, 0);
      keyboardRing = this.add.ellipse(0, 0, 80, 43).setStrokeStyle(2, 0x9efce8, .9).setDepth(10).setVisible(false);
      const xs = [97, half, 383];
      for (const x of xs) this.add.image(x, 47, propsKey, panelFrame).setDisplaySize(140, 74).setDepth(50);
      labels = xs.map(x => this.add.text(x, 32, '', textStyle(13, '#e4d8ff')).setOrigin(.5).setDepth(51));
      values = xs.map((x, index) => this.add.text(x, 55, '', textStyle(26, index === 0 ? gold : silver)).setOrigin(.5).setDepth(51));
      this.add.rectangle(331, 70, 104, 3, 0x190e30, .85).setOrigin(0, .5).setDepth(51);
      comboMeter = this.add.rectangle(331, 70, 104, 3, 0x95f0df).setOrigin(0, .5).setDepth(52);
      alert = this.add.text(half, 91, '', textStyle(16, gold)).setOrigin(.5).setDepth(51);
      rivalCards = [0x9cf1df, 0xffd691, 0xf2a7d2].map(color => {
        const bg = this.add.rectangle(0, 0, 132, 23, 0x1e1634, .93).setStrokeStyle(1, color, .75);
        const dot = this.add.circle(-54, 0, 3.2, color);
        const name = this.add.text(-46, 0, '', textStyle(13)).setOrigin(0, .5);
        const score = this.add.text(57, 0, '', textStyle(16, gold)).setOrigin(1, .5);
        const root = this.add.container(0, 461, [bg, dot, name, score]).setDepth(51).setVisible(false);
        return { root, name, score };
      });
      giantActor = this.add.image(half, 243, actorKey(5), pose.idle).setDisplaySize(326, 295);
      giantTitle = this.add.text(half, 392, '', textStyle(25, gold)).setOrigin(.5);
      giantMeter = this.add.rectangle(107, 420, 266, 5, 0xffd775).setOrigin(0, .5);
      giant = this.add.container(0, 0, [
        this.add.rectangle(half, 267, 455, 368, 0x17112c, .91).setStrokeStyle(2, 0xffc66f, .76),
        this.add.circle(half, 244, 147, 0xad66dc, .24).setStrokeStyle(2, 0xdba1ff, .48),
        giantActor, giantTitle, this.add.rectangle(half, 420, 266, 5, 0x504063), giantMeter,
      ]).setDepth(55).setVisible(false);
      nebulae = Array.from({ length: 7 }, (_, index) => this.add.ellipse(42 + index * 71, 148 + index % 3 * 105,
        136, 85, index % 2 ? 0x6341a1 : 0x8972df, .48).setAngle(-18));
      fogTitle = this.add.text(half, 111, '', textStyle(17, '#eed9ff')).setOrigin(.5);
      fog = this.add.container(0, 0, [...nebulae, fogTitle]).setDepth(65).setVisible(false);
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const current = view().mole;
        if (!current?.active || !pointer.leftButtonDown()) return;
        const now = worldTime(current);
        if (current.board.giantUntil > now) { current.hit(0); return; }
        const x = pointer.worldX, y = pointer.worldY;
        let nearest = Infinity;
        let selected: MoleTarget | undefined;
        for (const target of current.board.targets) {
          if (now >= target.until) continue;
          const cell = moleCell(current.size, target.cell);
          const dx = Math.abs(x - cell.x), dy = y - cell.y;
          const distance = Math.hypot(dx, dy + 4);
          if (dx < cell.step * .48 && dy > -cell.step * .56 && dy < cell.step * .32 && distance < nearest) {
            nearest = distance;
            selected = target;
          }
        }
        if (selected) current.hit(selected.id);
      });
    },
    update(time) {
      const current = view();
      const data = current.mole;
      if (!data) return;
      driftBackground(time);
      if (key !== data.id + ':' + data.size) reset(this, data);
      const now = worldTime(data), { board } = data;
      const seconds = data.start && now >= data.start ? Math.ceil(moleRemaining(board, now, data.hardEnd) / 1000) : data.limit;
      const clock = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      labels[0].setText(data.labels.score);
      labels[1].setText(data.labels.time);
      labels[2].setText(data.labels.combo);
      if (shownClock !== clock) { values[1].setText(clock).setColor(seconds <= 10 ? '#ffb2c0' : silver); shownClock = clock; }
      if (shownScore !== board.score) { values[0].setText(String(board.score)); shownScore = board.score; }
      if (shownCombo !== board.combo) {
        values[2].setText(String(board.combo));
        comboMeter.setScale((board.combo % feverThreshold) / feverThreshold, 1);
        shownCombo = board.combo;
      }
      const fever = !board.out && board.feverUntil > now;
      const bruised = !board.out && board.fogUntil > now;
      const giantActive = !board.out && board.giantUntil > now;
      alert.setText(board.decoys > 0 && !board.out ? data.labels.decoys : '');
      showFever(fever ? board.feverUntil - now : 0, time, data.language, motion());
      for (const [index, card] of rivalCards.entries()) {
        const rival = data.rivals[index];
        card.root.setVisible(Boolean(rival));
        if (!rival) continue;
        card.root.setX(half + (index - (data.rivals.length - 1) / 2) * 139).setAlpha(rival.out ? .67 : 1);
        card.name.setText(rival.name);
        card.name.setScale(Math.min(1, 69 / Math.max(1, card.name.width)), 1);
        card.score.setText(String(rival.score));
        const previous = heard.get(rival.role);
        if (previous && rival.strike && rival.strike.id > previous.strikeId
          && now - rival.strike.at < 420 && now - lastRivalHit >= 110) {
          lastRivalHit = now;
          strikeSound(rival.strike, true);
        }
        if (previous && rival.feverUntil > previous.feverUntil && rival.feverUntil - now > feverDuration - 560) playMoleSound('fever', true);
        heard.set(rival.role, { strikeId: rival.strike?.id ?? 0, feverUntil: rival.feverUntil });
      }
      if (fever && board.feverUntil !== feverUntil) {
        feverUntil = board.feverUntil;
        playMoleSound('fever');
      }
      if (bruised && board.fogUntil !== fogUntil) { fogUntil = board.fogUntil; playMoleSound('fog'); }
      fog.setVisible(bruised).setAlpha(bruised ? Math.min(1, (board.fogUntil - now) / 300) : 0);
      if (bruised) {
        fogTitle.setText(data.labels.fog);
        nebulae.forEach((cloud, i) => cloud.setX(42 + i * 71 + (motion() ? Math.sin(time * .0018 + i) * 36 : 0)));
      }
      giant.setVisible(giantActive);
      if (giantActive) {
        giantTitle.setText(data.labels.giant);
        giantMeter.setScale(clamp((board.giantUntil - now) / giantDuration), 1);
        giantActor.setY(243 + (motion() ? Math.sin(time * .005) * 4 : 0));
        if (!wasGiant) this.tweens.add({ targets: giant, alpha: { from: .25, to: 1 }, duration: 170 });
      }
      wasGiant = giantActive;
      const strike = board.strike;
      const fresh = strike && strike.id !== strikeId && now - strike.at < 600;
      let caught: TargetArt | undefined;
      for (const [id, art] of targets) {
        if (board.targets.some(target => target.id === id) && art.target.until > now) continue;
        targets.delete(id);
        if (fresh && strike.cell === art.target.cell && strike.kind !== 'armor') { caught = art; continue; }
        art.sprite.setFrame(pose.hide);
        this.tweens.add({ targets: art.root, alpha: 0, y: art.root.y + 19, scaleY: .7, duration: 145,
          onComplete: () => art.root.destroy() });
      }
      for (const target of board.targets) {
        if (target.until <= now) continue;
        const art = targets.get(target.id) ?? addTarget(this, data.size, target);
        art.target = target;
        const { y } = moleCell(data.size, target.cell);
        const age = now - target.from;
        const rise = clamp((age + 18) / 165);
        const lift = 1 - (1 - rise) ** 3;
        const remaining = target.until - now;
        const dip = clamp(remaining / 245);
        const blink = (age + (target.id % 5) * 147) % 1170;
        art.root.setY(y + (1 - lift) * 33 + (1 - dip) * 23 + (motion() ? Math.sin(time * .007 + target.id) * 1.9 : 0))
          .setScale(.84 + lift * .16, .71 + lift * .29).setAlpha(Math.min(lift, dip));
        art.timer.setScale(clamp((target.until - now) / (target.until - target.from)), 1);
        if (target.kind === 'armored') art.marker.setText(String(target.hp));
        const frame = now < art.reactedUntil ? pose.hit : age < 180 ? pose.emerge
          : remaining < 245 ? pose.hide : blink < 115 ? pose.blink : pose.idle;
        if (Number(art.sprite.frame.name) !== frame) art.sprite.setFrame(frame);
      }
      if (strike && strike.id !== strikeId) {
        strikeId = strike.id;
        if (fresh) {
          const hit = caught;
          const armored = strike.kind === 'armor' ? board.targets.find(target => target.cell === strike.cell) : undefined;
          animateStrike(this, data, strike, () => {
            if (armored) {
              const art = targets.get(armored.id);
              if (art) art.reactedUntil = worldTime(data) + 185;
            }
            if (hit) {
              hit.sprite.setFrame(strike.id % 2 ? pose.hit : pose.startled);
              this.tweens.add({ targets: hit.root, alpha: 0, y: hit.root.y + 19, scaleY: .65, duration: 210,
                onComplete: () => hit.root.destroy() });
            }
          });
        }
      }
      const cursor = current.cursor;
      keyboardRing.setVisible(cursor !== null && data.active && !giantActive);
      if (cursor !== null) {
        const { x, y, step } = moleCell(data.size, cursor);
        keyboardRing.setPosition(x, y + 13).setDisplaySize(step * .93, step * .57);
      }
    },
  };
};
