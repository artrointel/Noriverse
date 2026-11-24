import Phaser from 'phaser';
import { loadGameFont } from './games/game-font.ts';
import { OutpostScene } from './games/startrail/scene.ts';
import { maxPixelStep, screen } from './games/startrail/outpost.ts';
import './startrail.css';

await loadGameFont();

const hudCanvas = document.querySelector<HTMLCanvasElement>('#stage-hud')!;
const scene = new OutpostScene(hudCanvas.getContext('2d')!);
const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'stage',
  ...screen,
  backgroundColor: '#071321',
  antialias: false,
  transparent: true,
  clearBeforeRender: false,
  disableContextMenu: true,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: 0 }, autoUpdate: false } },
  scene,
});

const shell = document.querySelector<HTMLElement>('#game-shell')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const viewScale = document.querySelector<HTMLInputElement>('#view-scale')!;
const viewAuto = document.querySelector<HTMLButtonElement>('#view-auto')!;
const dimensions = document.querySelector<HTMLOutputElement>('#view-size')!;
const pixelSize = document.querySelector<HTMLInputElement>('#pixel-size')!;
const pixelValue = document.querySelector<HTMLOutputElement>('#pixel-value')!;
const sound = document.querySelector<HTMLButtonElement>('#sound')!;
const fullscreen = document.querySelector<HTMLButtonElement>('#fullscreen')!;

function displaySize() {
  const size = (game.canvas ?? stage).getBoundingClientRect();
  dimensions.value = `${Math.round(size.width)} × ${Math.round(size.height)} px`;
}

function changeScale(auto: boolean) {
  if (auto) viewScale.value = '100';
  shell.dataset.auto = String(auto);
  stage.style.setProperty('--view-scale', String(Number(viewScale.value) / 100));
  viewScale.setAttribute('aria-valuetext', `${viewScale.value}%`);
  viewAuto.setAttribute('aria-pressed', String(auto));
}

function changePixelSize() {
  pixelValue.value = `${pixelSize.value} px`;
  pixelSize.setAttribute('aria-valuetext', `${pixelSize.value} 픽셀`);
  scene.setPixelStep(Number(pixelSize.value));
}

function updateFullscreen() {
  const expanded = document.fullscreenElement === shell || shell.dataset.fill === 'true';
  fullscreen.textContent = expanded ? '전체 화면 나가기' : '전체 화면';
  fullscreen.setAttribute('aria-pressed', String(expanded));
  viewScale.disabled = expanded;
  viewAuto.disabled = expanded;
}

let pixelDensity = window.devicePixelRatio;

function fitRenderBuffer() {
  if (game.isBooted) {
    pixelDensity = window.devicePixelRatio;
    const bounds = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * pixelDensity));
    const height = Math.max(1, Math.round(bounds.height * pixelDensity));
    game.scale.getParentBounds();
    if (game.scale.width !== width || game.scale.height !== height) game.scale.setGameSize(width, height);
    else game.scale.refresh();
    const canvas = game.canvas;
    if (hudCanvas.width !== canvas.width) hudCanvas.width = canvas.width;
    if (hudCanvas.height !== canvas.height) hudCanvas.height = canvas.height;
    hudCanvas.style.width = canvas.style.width;
    hudCanvas.style.height = canvas.style.height;
    hudCanvas.style.marginLeft = canvas.style.marginLeft;
    hudCanvas.style.marginTop = canvas.style.marginTop;
  }
  displaySize();
}

const sizeObserver = new ResizeObserver(fitRenderBuffer);
sizeObserver.observe(stage);
game.events.on(Phaser.Core.Events.READY, fitRenderBuffer);
window.addEventListener('resize', fitRenderBuffer);
game.events.on(Phaser.Core.Events.PRE_STEP, () => {
  if (window.devicePixelRatio !== pixelDensity) fitRenderBuffer();
});
viewScale.addEventListener('input', () => changeScale(false));
viewAuto.addEventListener('click', () => changeScale(true));
pixelSize.max = String(maxPixelStep);
pixelSize.addEventListener('input', changePixelSize);
sound.setAttribute('aria-pressed', String(scene.isMuted()));
sound.addEventListener('click', () => {
  scene.setMuted(!scene.isMuted());
  sound.setAttribute('aria-pressed', String(scene.isMuted()));
});
document.addEventListener('fullscreenchange', updateFullscreen);
fullscreen.addEventListener('click', async () => {
  if (document.fullscreenElement === shell) {
    await document.exitFullscreen();
  } else if (shell.dataset.fill === 'true') {
    delete shell.dataset.fill;
  } else {
    try {
      if (!shell.requestFullscreen) throw new Error('Fullscreen is unsupported');
      await shell.requestFullscreen();
    } catch {
      shell.dataset.fill = 'true';
    }
  }
  updateFullscreen();
  game.canvas?.focus({ preventScroll: true });
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && shell.dataset.fill === 'true') {
    delete shell.dataset.fill;
    updateFullscreen();
  }
});
changeScale(true);
changePixelSize();
