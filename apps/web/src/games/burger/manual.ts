import { gameFontFamily } from '../game-font.ts';
import { burgerFoodFrames, cupTexture } from './art.ts';
import { burgerRewardRates } from './balance.ts';
import { burgerLayerSpacing, burgerSceneHeight } from './layout.ts';
import { ingredients } from './rules.ts';
import { kitchenSound } from './sounds.ts';
import Phaser from 'phaser';

type Translate = (key: string) => string;
type Direction = -1 | 1;
type ManualTarget = 'previous' | 'next' | 'close';

const sceneWidth = 480;
const pageWidth = 210, pageHeight = 237;
const spine = sceneWidth / 2;
const top = 42;
const leftEdge = spine - pageWidth, rightEdge = spine + pageWidth;
const turnMs = 360;
const pageChapters = ['patty', 'patty', 'tray', 'trash', 'assembly', 'wrap'] as const;
const spreadCount = pageChapters.length / 2;
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

function makeIcon(scene: Phaser.Scene) {
  texture(scene, manualIcon.texture, 40, 40, ctx => {
    plate(ctx, 3, 5, 29, 32, 5, '#93ad84', '#4b5433', 1.5);
    ctx.translate(4, 2);
    ctx.rotate(.08);
    plate(ctx, 5, 2, 30, 33, 5, '#d5b071', '#634627', 1.6);
    plate(ctx, 6, 2, 28, 30, 4, '#ffe7aa', '#9b743c', 1.1);
    ctx.strokeStyle = forest;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(20, 12); ctx.quadraticCurveTo(15, 8, 10.5, 11);
    ctx.lineTo(10.5, 22); ctx.quadraticCurveTo(15, 19, 20, 23);
    ctx.quadraticCurveTo(25, 19, 29.5, 22);
    ctx.lineTo(29.5, 11); ctx.quadraticCurveTo(25, 8, 20, 12);
    ctx.closePath();
    ctx.moveTo(20, 12); ctx.lineTo(20, 23);
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

function paintPage(scene: Phaser.Scene, key: string, page: number, t: Translate) {
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
    function caption(text: string, x: number, y: number, size = 12, color = brown, align: CanvasTextAlign = 'center', maxWidth = 177) {
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.font = `${size}px ${gameFontFamily}`;
      for (const [i, line] of text.split('\n').entries()) ctx.fillText(line, x, y + i * (size + 2), maxWidth);
    }
    function sprite(key: string, frameNumber: number | undefined, x: number, y: number, size: number, angle = 0) {
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

    caption(t('burgerManual_' + pageChapters[page - 1]), 16, 20, 21, forest, 'left');
    ctx.fillStyle = '#aa8554a0';
    ctx.fillRect(16, 34, 178, 1);

    if (page === 1) {
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
    } else if (page === 2) {
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
      const percentage = Math.round(burgerRewardRates.perfectTip * 100);
      caption(t('burgerManual_combo'), 105, 173, 12, forest);
      caption(t('burgerManual_tipMatch'), 70, 190, 11, brown, 'center', 98);
      caption(t('burgerManual_tip') + ' +' + percentage + '%', 155, 190, 13, rust, 'center', 63);
    } else if (page === 3) {
      station(52, 49, 106, 68, 186, 237, 60, 38);
      for (const offset of [0, 4, 8, 12]) patty(2, 82, 94 - offset, 38);
      caption(t('burgerManual_trayLimit'), 105, 130, 16, forest);
      caption(t('burgerManual_toTray'), 105, 155, 12);
      well(16, 176, 178, 33);
      caption(t('burgerManual_holdTray'), 105, 193, 12, forest);
    } else if (page === 4) {
      patty(4, 44, 78, 44);
      food('wrap', 106, 77, 48);
      sprite(cupTexture('cola', 'medium'), undefined, 164, 77, 41);
      caption('↓', 105, 112, 23, rust);
      station(54, 130, 102, 46, 9, 284, 64, 28);
      caption(t('burgerManual_discard'), 105, 190, 13, forest);
    } else if (page === 5) {
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
    } else {
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
    }
    caption(String(page), 105, 225, 11, '#826346');
    if (right ? page < pageChapters.length : page > 1) {
      const x = right ? 180 : 30;
      plate(ctx, x - 14, 215, 28, 17, 5, '#dfc498', '#ae8858');
      caption(right ? '→' : '←', x, 224, 16, forest);
    }
  });
}

export function createBurgerManual(scene: Phaser.Scene) {
  makeIcon(scene);
  const dim = scene.add.rectangle(spine, burgerSceneHeight / 2, sceneWidth, burgerSceneHeight, 0x211321, .68).setDepth(64).setVisible(false);
  let book: ReturnType<typeof makeBook> | undefined;
  let spread = 0;
  let turn: { from: number; at: number; direction: Direction } | undefined;
  let openedAt: number | undefined;
  let pageLocale: string | undefined;

  function makeBook() {
    makeCover(scene);
    const group = scene.add.container(spine, burgerSceneHeight / 2).setDepth(65);
    const cover = scene.add.image(0, 0, coverKey).setDisplaySize(458, 276);
    const image = () => scene.add.image(0, 0, '__MISSING').setOrigin(0, 0);
    const left = image(), right = image(), sheet = image();
    const shading = scene.add.graphics();
    const close = scene.add.graphics();
    close.fillStyle(0x2d503d).fillCircle(208, -128, 12).lineStyle(1, 0xe9cd92).strokeCircle(208, -128, 12)
      .lineStyle(1.7, 0xffe9bd).lineBetween(205, -131, 211, -125).lineBetween(205, -125, 211, -131);
    group.add([cover, left, right, sheet, shading, close]);
    return { group, left, right, sheet, shading };
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
      spread = 0;
      openedAt = performance.now();
      turn = undefined;
      kitchenSound('paper', .26);
    },
    close,
    target(x: number, y: number): ManualTarget | undefined {
      if ((x >= 435 && y <= 44 && x <= 462 && y >= 19)
        || x < leftEdge - 10 || x > rightEdge + 10 || y < top - 12 || y > top + pageHeight + 8) return 'close';
      if (y < top || y > top + pageHeight || x < leftEdge || x > rightEdge) return;
      return x < spine ? 'previous' : 'next';
    },
    act(target: ManualTarget, reduceMotion: boolean) {
      if (target === 'close') { close(); return; }
      const direction = target === 'previous' ? -1 : 1;
      const next = spread + direction;
      if (openedAt === undefined || turn || next < 0 || next >= spreadCount) return;
      if (!reduceMotion) turn = { from: spread, at: performance.now(), direction };
      spread = next;
      kitchenSound('paper', .32);
    },
    render(locale: string, translate: Translate, reduceMotion: boolean) {
      if (!book || openedAt === undefined) return;
      const now = performance.now();
      if (pageLocale !== locale) {
        for (let page = 1; page <= pageChapters.length; page++) {
          paintPage(scene, 'burger-manual-' + locale + '-' + page, page, translate);
        }
        pageLocale = locale;
      }
      const show = Math.min(1, (now - openedAt) / 180);
      const alpha = reduceMotion ? 1 : 1 - (1 - show) ** 3;
      dim.setVisible(true).setAlpha(alpha);
      book.group.setVisible(true).setAlpha(alpha).setScale(.96 + .04 * alpha);
      if (turn && (reduceMotion || now - turn.at >= turnMs)) turn = undefined;
      const y = top - burgerSceneHeight / 2;
      function leaf(image: Phaser.GameObjects.Image, page: number, x: number, anchor: number, span = pageWidth) {
        const key = 'burger-manual-' + locale + '-' + page;
        if (image.texture.key !== key) image.setTexture(key);
        image.setVisible(true).setPosition(x, y).setOrigin(anchor, 0).setDisplaySize(span, pageHeight);
      }
      book.shading.clear();
      book.sheet.setVisible(Boolean(turn));
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
        book.shading.fillStyle(0x533521, shadow).fillRect(onLeft ? edge : 0, y, span, pageHeight);
        book.shading.fillStyle(0xf8d49c, shadow).fillRect(edge - 1, y, 2, pageHeight);
      }
    },
  };
}
