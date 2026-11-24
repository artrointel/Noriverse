import { gameFontFamily } from '../game-font.ts';
import { burgerFoodFrames, cupTexture, grillResidueArt } from './art.ts';
import { burgerRewardRates } from './balance.ts';
import { cardDeck } from './card-hud.ts';
import { burgerLayerSpacing, burgerSceneHeight } from './layout.ts';
import { manualCardPages } from './manual-card-pages.ts';
import { ingredients } from './rules.ts';
import { kitchenSound } from './sounds.ts';
import Phaser from 'phaser';

type Translate = (key: string) => string;
type Direction = -1 | 1;
const manualSections = ['tutorial', 'cards'] as const;
type ManualSection = typeof manualSections[number];
type ManualTarget = 'previous' | 'next' | 'close' | ManualSection;

const sceneWidth = 480;
const pageWidth = 210, pageHeight = 237;
const bookX = 258, bookY = burgerSceneHeight / 2, bookScale = .93;
const pageTop = -118;
const clipX = -271, clipWidth = 68, clipHeight = 34;
const clipTop = (index: number) => -93 + index * 43;
const turnMs = 360;
const pageChapters = ['prep', 'grill', 'doneness', 'tray', 'trash', 'assembly', 'wrap', 'serve', 'callGuest'] as const;
const pageCounts: Record<ManualSection, number> = { tutorial: pageChapters.length, cards: manualCardPages.length };
const coverKey = 'burger-manual-cover';
export const manualIcon = { texture: 'burger-manual-icon' };
const forest = '#234c3c', brown = '#514033', rust = '#995030';

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number,
  fill: string | CanvasGradient, stroke?: string, lineWidth = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function texture(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const scale = 2;
  const target = scene.textures.createCanvas(key, w * scale, h * scale);
  if (!target) return;
  const ctx = target.getContext();
  ctx.scale(scale, scale);
  paint(ctx);
  target.refresh().setFilter(Phaser.Textures.FilterMode.LINEAR);
}

function drawSprite(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, key: string, frameNumber: number | undefined,
  x: number, y: number, size: number, angle = 0) {
  const frame = scene.textures.getFrame(key, frameNumber);
  if (!frame) return;
  const fit = size / Math.max(frame.cutWidth, frame.cutHeight);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
    -frame.cutWidth * fit / 2, -frame.cutHeight * fit / 2, frame.cutWidth * fit, frame.cutHeight * fit);
  ctx.restore();
}

function makeIcon(scene: Phaser.Scene) {
  texture(scene, manualIcon.texture, 40, 40, ctx => {
    ctx.save();
    ctx.translate(15, 19);
    ctx.rotate(-.29);
    plate(ctx, -11, -14, 22, 28, 3.2, '#b6c797', '#91835a', .8);
    plate(ctx, -9.6, -12.6, 19.2, 25.2, 2.4, '#c4d1aa');
    ctx.restore();

    ctx.translate(23, 21);
    ctx.rotate(.13);
    const paper = ctx.createLinearGradient(0, -14, 0, 15);
    paper.addColorStop(0, '#ffe9b9');
    paper.addColorStop(1, '#f6d29e');
    plate(ctx, -12, -14, 24, 29, 3.5, paper, '#a97849', .9);
    plate(ctx, -10.6, -12.4, 21.2, 25.6, 2.4, '#fff2c83d', '#fff1cc', .65);

    ctx.fillStyle = '#fff0c7';
    ctx.strokeStyle = '#767b54';
    ctx.lineWidth = 1.45;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -4.5); ctx.quadraticCurveTo(-3.8, -7, -7.5, -5.2);
    ctx.lineTo(-7.5, 4.5); ctx.quadraticCurveTo(-3.8, 3, 0, 5.5);
    ctx.quadraticCurveTo(3.8, 3, 7.5, 4.5);
    ctx.lineTo(7.5, -5.2); ctx.quadraticCurveTo(3.8, -7, 0, -4.5);
    ctx.closePath();
    ctx.fill();
    ctx.moveTo(0, -4.5); ctx.lineTo(0, 5.5);
    ctx.stroke();
  });
}

function makeCover(scene: Phaser.Scene) {
  texture(scene, coverKey, 458, 276, ctx => {
    ctx.shadowColor = '#21151c99';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    plate(ctx, 8, 9, 442, 256, 13, '#1e392f');
    ctx.shadowColor = 'transparent';
    const cloth = ctx.createLinearGradient(0, 0, 0, 264);
    cloth.addColorStop(0, '#5b7c55');
    cloth.addColorStop(1, '#294c3a');
    plate(ctx, 9, 9, 440, 254, 12, cloth, '#b09157', 1.5);
    plate(ctx, 14, 15, 430, 245, 8, '#d2ad7c', '#3d4833');
    plate(ctx, 15, 14, 428, 242, 7, '#f2d5a3', '#a27951');
    for (let y = 251; y <= 258; y += 2) {
      ctx.fillStyle = '#7e5a3e67';
      ctx.fillRect(19, y, 420, .65);
    }
    // The bookmark is sewn under the paper block.
    ctx.fillStyle = '#c56944';
    ctx.beginPath();
    ctx.moveTo(400, 249); ctx.lineTo(413, 249); ctx.lineTo(413, 274);
    ctx.lineTo(406.5, 269); ctx.lineTo(400, 274); ctx.closePath(); ctx.fill();
  });
}

function paintClip(scene: Phaser.Scene, key: string, section: ManualSection, active: boolean, t: Translate) {
  texture(scene, key, clipWidth, clipHeight, ctx => {
    plate(ctx, 1, 4, 65, 29, 6, '#462d25aa');
    const cloth = ctx.createLinearGradient(0, 1, 0, 32);
    cloth.addColorStop(0, active ? '#71936b' : '#d7bb87');
    cloth.addColorStop(1, active ? '#3b624e' : '#aa8757');
    plate(ctx, 1, 1, 65, 29, 6, cloth, active ? '#edd396' : '#725434', 1.2);
    const icon: { texture: string; frame?: number } = section === 'tutorial' ? manualIcon : cardDeck;
    drawSprite(scene, ctx, icon.texture, icon.frame, 13, 16, 16);
    ctx.fillStyle = active ? '#fff5d5' : '#382818';
    ctx.font = `12px ${gameFontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(t('burgerManual_' + section), 22, 16, 40);
    ctx.fillStyle = active ? '#edd396' : '#79562c';
    ctx.fillRect(63, 6, 1, 19);
  });
}

function paintPage(scene: Phaser.Scene, key: string, section: ManualSection, page: number, t: Translate) {
  texture(scene, key, pageWidth, pageHeight, ctx => {
    const right = page % 2 === 0;
    const paper = ctx.createLinearGradient(right ? 0 : pageWidth, 0, right ? pageWidth : 0, 0);
    paper.addColorStop(0, '#d1b088');
    paper.addColorStop(.06, '#f4e0b9');
    paper.addColorStop(.19, '#fff0d0');
    paper.addColorStop(1, '#f8e7c2');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, pageWidth, pageHeight);
    for (let i = 0; i < 110; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#fff9e38a' : '#8a623a17';
      ctx.fillRect(i * 83 % pageWidth, i * 53 % pageHeight, 1 + i % 5, .5);
    }
    if (page > pageCounts[section]) return;

    function caption(text: string, x: number, y: number, size = 12, color = brown, align: CanvasTextAlign = 'center', maxWidth = 177) {
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.font = `${size}px ${gameFontFamily}`;
      for (const [i, line] of text.split('\n').entries()) ctx.fillText(line, x, y + i * (size + 2), maxWidth);
    }
    const sprite = (key: string, frameNumber: number | undefined, x: number, y: number, size: number, angle = 0) =>
      drawSprite(scene, ctx, key, frameNumber, x, y, size, angle);
    function station(x: number, y: number, w: number, h: number, sourceX: number, sourceY: number, sourceW: number, sourceH: number) {
      const frame = scene.textures.getFrame('burger-shop');
      if (!frame) return;
      const scaleX = frame.cutWidth / sceneWidth, scaleY = frame.cutHeight / burgerSceneHeight;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.clip();
      ctx.drawImage(frame.source.image as CanvasImageSource, sourceX * scaleX, sourceY * scaleY, sourceW * scaleX, sourceH * scaleY, x, y, w, h);
      ctx.restore();
    }
    const patty = (frame: number, x: number, y: number, size = 47, angle = 0) =>
      sprite('burger-patties', frame, x, y, size, angle);
    const food = (item: keyof typeof burgerFoodFrames, x: number, y: number, size: number) =>
      sprite('burger-food', burgerFoodFrames[item], x, y, size);
    const well = (x: number, y: number, w: number, h: number) =>
      plate(ctx, x, y, w, h, 8, '#eed8b37a', '#b58d647a');

    const card = section === 'cards' ? manualCardPages[page - 1] : undefined;
    const chapter = pageChapters[page - 1];
    const title = chapter === 'grill' || chapter === 'doneness' ? 'patty' : chapter;
    caption(t(card?.title ?? 'burgerManual_' + title), 16, 20, 21, forest, 'left');
    ctx.fillStyle = '#aa8554a0';
    ctx.fillRect(16, 34, 178, 1);

    if (card) {
      well(16, 44, 178, 76);
      if (card.id === 'autoGrill2') {
        station(109, 63, 65, 48, 186, 237, 60, 38);
        caption('→', 94, 87, 15, rust);
      }
      if (card.id === 'storage' || card.id === 'orderStorage') station(28, 60, 154, 45, 83, 287, 145, 30);
      for (const art of card.art) sprite(art.texture, art.frame, art.x, art.y, art.size, art.angle);
      if (card.stat) caption(card.stat, 135, 84, 19, rust);
      caption(t('burgerManualCard_' + card.id), 105, 133, 13);
      plate(ctx, 16, 175, 178, 36, 7, '#dce5c5', '#88a07d');
      const note = t('burgerManualCardNote_' + card.id);
      caption(note, 105, note.includes('\n') ? 185 : 193, 12, forest, 'center', 161);
    } else if (chapter === 'prep') {
      plate(ctx, 53, 45, 104, 24, 7, '#dce5c5', '#88a07d');
      caption(t('burgerManual_prepTime'), 105, 57, 15, forest);
      well(16, 78, 178, 74);
      station(23, 95, 64, 44, 13, 227, 90, 50);
      patty(2, 56, 115, 43);
      caption('→', 100, 116, 17, rust);
      station(115, 92, 70, 48, 186, 237, 60, 38);
      for (const offset of [0, 4, 8]) patty(2, 136, 122 - offset, 31);
      caption(t('burgerManual_prepHow'), 105, 171, 13);
    } else if (chapter === 'grill') {
      well(16, 44, 178, 77);
      station(23, 62, 65, 36, 13, 227, 90, 50);
      patty(0, 58, 80, 43);
      caption(t('burgerManual_grill'), 100, 62, 15, forest, 'left', 83);
      caption(t('burgerManual_grillHow'), 100, 81, 12, brown, 'left', 83);
      well(16, 128, 178, 78);
      sprite('burger-spatula', undefined, 60, 169, 62, -.66);
      patty(1, 55, 154, 42, -.24);
      caption('×2', 42, 192, 15, rust);
      caption(t('burgerManual_flip'), 100, 147, 15, forest, 'left', 83);
      caption(t('burgerManual_flipHow'), 100, 167, 12, brown, 'left', 83);
    } else if (chapter === 'doneness') {
      well(16, 44, 178, 54);
      patty(1, 51, 69, 58);
      caption(t('burgerManual_flipWhen'), 83, 61, 12, brown, 'left', 103);
      const grades = ['rare', 'medium', 'well', 'charred'];
      for (const [i, grade] of grades.entries()) {
        const x = 37 + 45 * i;
        patty(i + 1, x, 122, 40);
        caption(t('burgerLabel_' + grade), x, 150, 11, i === 3 ? rust : forest, 'center', 42);
      }
      plate(ctx, 16, 162, 178, 47, 7, '#dce5c5', '#88a07d');
      const tip = Math.round(burgerRewardRates.perfectTip * 100);
      const xp = Math.round(burgerRewardRates.perfectXp * 100);
      caption(t('burgerManual_combo'), 105, 172, 11, forest);
      caption(t('burgerManual_tipMatch'), 105, 186, 11, brown);
      caption(`${t('burgerManual_tip')} +${tip}% · XP +${xp}%`, 105, 200, 13, rust);
    } else if (chapter === 'tray') {
      station(52, 49, 106, 68, 186, 237, 60, 38);
      for (const offset of [0, 4, 8, 12]) patty(2, 82, 94 - offset, 38);
      caption(t('burgerManual_trayLimit'), 105, 130, 16, forest);
      caption(t('burgerManual_toTray'), 105, 155, 12);
      well(16, 176, 178, 33);
      caption(t('burgerManual_holdTray'), 105, 193, 12, forest);
    } else if (chapter === 'trash') {
      well(16, 44, 178, 65);
      food('wrap', 36, 59, 27);
      sprite(cupTexture('cola', 'medium'), undefined, 65, 59, 23);
      caption('↓', 50, 74, 13, rust);
      station(23, 79, 55, 24, 9, 284, 64, 28);
      caption(t('burgerManual_discard'), 91, 64, 13, brown, 'left', 97);

      well(16, 117, 178, 65);
      station(22, 132, 61, 36, 16, 232, 80, 45);
      sprite(grillResidueArt, undefined, 52, 150, 54);
      sprite('burger-spatula', undefined, 58, 148, 35, -1.6);
      caption(t('burgerManual_scrapeTitle'), 91, 131, 14, forest, 'left', 97);
      caption(t('burgerManual_scrapeHow'), 91, 150, 12, brown, 'left', 97);
      plate(ctx, 16, 188, 178, 25, 7, '#dce5c5', '#88a07d');
      caption(t('burgerManual_scrapeWait'), 105, 201, 12, forest, 'center', 160);
    } else if (chapter === 'assembly') {
      well(16, 44, 178, 68);
      station(23, 59, 65, 39, 246, 232, 45, 44);
      sprite('burger-paper', undefined, 55, 80, 40);
      food('bun', 55, 77, 34);
      caption(t('burgerManual_base'), 99, 61, 15, forest, 'left', 87);
      caption(t('burgerManual_baseHow'), 99, 79, 12, brown, 'left', 87);

      well(16, 120, 178, 89);
      caption(t('burgerManual_fillings'), 105, 135, 15, forest);
      patty(2, 53, 164, 33);
      caption('→', 79, 164, 15, rust);
      sprite('burger-ingredient-icons', ingredients.indexOf('cheese'), 105, 164, 32);
      caption('→', 131, 164, 15, rust);
      sprite('burger-ingredient-icons', ingredients.indexOf('lettuce'), 157, 164, 32);
      caption(t('burgerManual_fillingsHow'), 105, 194, 12);
    } else if (chapter === 'wrap') {
      well(16, 44, 178, 70);
      const size = 51, step = size * burgerLayerSpacing;
      food('bun', 55, 93, size);
      patty(2, 55, 93 - step, size);
      food('cheese', 55, 93 - step * 2, size);
      food('lettuce', 55, 93 - step * 3, size);
      food('bunTop', 55, 93 - step * 4, size);
      caption(t('burgerManual_cap'), 99, 62, 15, forest, 'left', 87);
      caption(t('burgerManual_capHow'), 99, 81, 12, brown, 'left', 87);

      well(16, 121, 178, 62);
      food('wrap', 55, 151, 55);
      caption(t('burgerManual_package'), 99, 138, 15, forest, 'left', 87);
      caption(t('burgerManual_packageHow'), 99, 156, 12, brown, 'left', 87);
      plate(ctx, 16, 190, 178, 21, 7, '#dce5c5', '#88a07d');
      caption(t('burgerManual_packageLocked'), 105, 201, 12, forest);
    } else if (chapter === 'serve') {
      station(45, 49, 120, 77, 399, 228, 78, 50);
      food('wrap', 83, 82, 47);
      sprite(cupTexture('cola', 'medium'), undefined, 129, 83, 36);
      caption(t('burgerManual_stageOrder'), 105, 138, 12);
      plate(ctx, 16, 170, 178, 40, 7, '#dce5c5', '#88a07d');
      caption(t('burgerManual_sendOrder'), 105, 183, 12, forest);
    } else {
      well(16, 44, 178, 86);
      caption(t('burgerManual_emptyQueue'), 105, 60, 14, forest);
      station(66, 77, 78, 41, 421, 256, 33, 17);
      caption(t('burgerManual_ringBell'), 105, 150, 13);
      plate(ctx, 16, 178, 178, 31, 7, '#dce5c5', '#88a07d');
      caption(t('burgerManual_bellBonus'), 105, 194, 13, forest);
    }
    caption(String(page), 105, 225, 11, '#826346');
    if (right ? page < pageCounts[section] : page > 1) {
      const x = right ? 180 : 30;
      plate(ctx, x - 14, 215, 28, 17, 5, '#dfc498', '#ae8858');
      caption(right ? '→' : '←', x, 224, 16, forest);
    }
  });
}

export function createBurgerManual(scene: Phaser.Scene) {
  makeIcon(scene);
  const dim = scene.add.rectangle(sceneWidth / 2, bookY, sceneWidth, burgerSceneHeight, 0x211321, .68).setDepth(64).setVisible(false);
  let book: ReturnType<typeof makeBook> | undefined;
  let section: ManualSection = 'tutorial';
  const spreads = { tutorial: 0, cards: 0 };
  let turn: { from: number; at: number; direction: Direction } | undefined;
  let openedAt: number | undefined;

  function makeBook() {
    makeCover(scene);
    const group = scene.add.container(bookX, bookY).setDepth(65);
    const cover = scene.add.image(0, 0, coverKey).setDisplaySize(458, 276);
    const image = () => scene.add.image(0, 0, '__MISSING').setOrigin(0, 0);
    const left = image(), right = image(), sheet = image();
    const clips = manualSections.map((_, index) => image().setPosition(clipX, clipTop(index)));
    const shading = scene.add.graphics();
    const close = scene.add.graphics();
    close.fillStyle(0x2d503d).fillCircle(208, -128, 12).lineStyle(1, 0xe9cd92).strokeCircle(208, -128, 12)
      .lineStyle(1.7, 0xffe9bd).lineBetween(205, -131, 211, -125).lineBetween(205, -125, 211, -131);
    group.add([cover, left, right, sheet, shading, ...clips, close]);
    return { group, left, right, sheet, shading, clips };
  }

  function close() {
    openedAt = undefined;
    turn = undefined;
    dim.setVisible(false);
    book?.group.setVisible(false);
  }

  return {
    get isOpen() { return openedAt !== undefined; },
    open() {
      book ??= makeBook();
      section = 'tutorial';
      spreads.tutorial = spreads.cards = 0;
      openedAt = performance.now();
      turn = undefined;
      kitchenSound('paper', .26);
    },
    close,
    target(worldX: number, worldY: number): ManualTarget | undefined {
      const x = (worldX - bookX) / bookScale, y = (worldY - bookY) / bookScale;
      if (x >= clipX && x <= clipX + clipWidth) {
        const clip = manualSections.find((_, index) => y >= clipTop(index) && y <= clipTop(index) + clipHeight);
        if (clip) return clip;
      }
      if (Math.hypot(x - 208, y + 128) <= 14
        || x < -pageWidth - 12 || x > pageWidth + 12 || y < pageTop - 12 || y > pageTop + pageHeight + 8) return 'close';
      if (y < pageTop || y > pageTop + pageHeight || x < -pageWidth || x > pageWidth) return;
      return x < 0 ? 'previous' : 'next';
    },
    act(target: ManualTarget, reduceMotion: boolean) {
      if (target === 'close') { close(); return; }
      if (openedAt === undefined) return;
      if (target === 'tutorial' || target === 'cards') {
        if (section === target) return;
        section = target;
        turn = undefined;
        kitchenSound('paper', .26);
        return;
      }
      const direction = target === 'previous' ? -1 : 1;
      const spread = spreads[section];
      const next = spread + direction;
      if (turn || next < 0 || next * 2 >= pageCounts[section]) return;
      if (!reduceMotion) turn = { from: spread, at: performance.now(), direction };
      spreads[section] = next;
      kitchenSound('paper', .32);
    },
    render(locale: string, translate: Translate, reduceMotion: boolean) {
      if (!book || openedAt === undefined) return;
      const now = performance.now();
      for (const [index, name] of manualSections.entries()) {
        const active = name === section;
        const clip = book.clips[index];
        const key = `burger-manual-clip-${locale}-${name}-${active}`;
        if (clip.texture.key !== key) {
          paintClip(scene, key, name, active, translate);
          clip.setTexture(key).setDisplaySize(clipWidth, clipHeight);
        }
      }
      const show = Math.min(1, (now - openedAt) / 180);
      const alpha = reduceMotion ? 1 : 1 - (1 - show) ** 3;
      dim.setVisible(true).setAlpha(alpha);
      book.group.setVisible(true).setAlpha(alpha).setScale(bookScale * (.96 + .04 * alpha));
      if (turn && (reduceMotion || now - turn.at >= turnMs)) turn = undefined;
      function leaf(image: Phaser.GameObjects.Image, page: number, x: number, anchor: number, span = pageWidth) {
        const key = `burger-manual-${locale}-${section}-${page}`;
        if (image.texture.key !== key) {
          paintPage(scene, key, section, page, translate);
          image.setTexture(key);
        }
        image.setVisible(true).setPosition(x, pageTop).setOrigin(anchor, 0).setDisplaySize(span, pageHeight);
      }
      book.shading.clear();
      book.sheet.setVisible(Boolean(turn));
      const spread = spreads[section];
      const from = turn?.from ?? spread;
      const forward = turn?.direction === 1;
      leaf(book.left, (forward ? from : spread) * 2 + 1, -pageWidth, 0);
      leaf(book.right, (forward ? spread : from) * 2 + 2, 0, 0);
      if (turn) {
        const phase = Math.min(1, (now - turn.at) / turnMs);
        const bend = Math.cos(phase * Math.PI);
        const farSide = phase >= .5;
        const onLeft = forward === farSide;
        const number = (farSide ? spread : from) * 2 + (onLeft ? 1 : 2);
        const span = Math.max(1, Math.abs(bend) * pageWidth);
        leaf(book.sheet, number, 0, Number(onLeft), span);
        const edge = onLeft ? -span : span;
        const shadow = .32 * Math.sin(phase * Math.PI);
        book.shading.fillStyle(0x533521, shadow).fillRect(onLeft ? edge : 0, pageTop, span, pageHeight);
        book.shading.fillStyle(0xf8d49c, shadow).fillRect(edge - 1, pageTop, 2, pageHeight);
      }
    },
  };
}
