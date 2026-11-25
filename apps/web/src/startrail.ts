import Phaser from 'phaser';
import { loadGameFont } from './games/game-font.ts';
import { OutpostScene } from './games/startrail/scene.ts';
import { defaultPixelStep, maxPixelStep, screen } from './games/startrail/outpost.ts';
import type { IndirectMode } from './games/startrail/gi.ts';
import type { ShadowMode } from './games/startrail/shadow.ts';
import { routeHref } from './platform/route-href.ts';
import './startrail.css';

document.querySelector<HTMLAnchorElement>('#game-library')!.href = routeHref('/games');
await loadGameFont();

const hudCanvas = document.querySelector<HTMLCanvasElement>('#stage-hud')!;
const launch = document.querySelector<HTMLButtonElement>('#launch')!;
const preferredLanguage = (() => { try { return localStorage.getItem('noriverse.language'); } catch { return null; } })();
const storyLanguage = preferredLanguage === 'en' || preferredLanguage !== 'ko' && !navigator.language.toLowerCase().startsWith('ko') ? 'en' : 'ko';
const scene = new OutpostScene(hudCanvas.getContext('2d')!, stage => {
  launch.disabled = false;
  document.title = `별길 탐사대 · ${stage.id} ${stage.title}`;
  document.querySelector('#stage')?.setAttribute('aria-label', `별길 탐사대 ${stage.id} ${stage.title} 게임 화면`);
}, storyLanguage);
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
  scale: { mode: Phaser.Scale.NONE },
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
const lightingMode = document.querySelector<HTMLSelectElement>('#lighting-mode')!;
const directLightStrength = document.querySelector<HTMLInputElement>('#direct-light-strength')!;
const directLightValue = document.querySelector<HTMLOutputElement>('#direct-light-value')!;
const lightingStrength = document.querySelector<HTMLInputElement>('#lighting-strength')!;
const lightingPreview = document.querySelector<HTMLInputElement>('#lighting-preview')!;
const lightingValue = document.querySelector<HTMLOutputElement>('#lighting-value')!;
const lightingBackend = document.querySelector<HTMLElement>('#lighting-backend')!;
const shadowMode = document.querySelector<HTMLSelectElement>('#shadow-type')!;
const frameRate = document.querySelector<HTMLOutputElement>('#frame-rate')!;
const cpuTime = document.querySelector<HTMLOutputElement>('#cpu-time')!;
const gpuTime = document.querySelector<HTMLOutputElement>('#gpu-time')!;
const volume = document.querySelector<HTMLInputElement>('#volume')!;
const volumeValue = document.querySelector<HTMLOutputElement>('#volume-value')!;
const sound = document.querySelector<HTMLButtonElement>('#sound')!;
const fullscreen = document.querySelector<HTMLButtonElement>('#fullscreen')!;
const explorer = document.querySelector<HTMLSelectElement>('#explorer')!;
const expeditionAlly = document.querySelector<HTMLInputElement>('#expedition-ally')!;
const trainingDummy = document.querySelector<HTMLInputElement>('#training-dummy')!;
launch.addEventListener('click', () => {
  launch.disabled = true;
  scene.startExpedition(explorer.value === 'kommi' ? 'kommi' : 'solori', expeditionAlly.checked, trainingDummy.checked);
  game.canvas?.focus({ preventScroll: true });
});

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

function changeLighting() {
  const mode = lightingMode.value as IndirectMode;
  lightingStrength.disabled = lightingPreview.disabled = mode === 'direct';
  directLightValue.value = `${directLightStrength.value}%`;
  directLightStrength.setAttribute('aria-valuetext', directLightValue.value);
  lightingValue.value = `${lightingStrength.value}%`;
  scene.setLighting({
    mode, directStrength: Number(directLightStrength.value) / 100, strength: Number(lightingStrength.value) / 100,
    preview: mode !== 'direct' && lightingPreview.checked,
  });
}

let frameStartedAt = 0, lastFrameTime = 0, interval = 0, cpuTotal = 0, measured = 0, lastGpuUpdates = 0;
game.events.on(Phaser.Core.Events.PRE_STEP, () => { frameStartedAt = performance.now(); });
game.events.on(Phaser.Core.Events.POST_RENDER, (_renderer: unknown, time: number) => {
  const delta = time - lastFrameTime;
  lastFrameTime = time;
  if (delta <= 0 || delta > 750) {
    interval = cpuTotal = measured = 0;
    lastGpuUpdates = scene.lightingDiagnostics().gpuUpdates;
    return;
  }
  interval += delta;
  cpuTotal += performance.now() - frameStartedAt;
  measured++;
  if (interval < 500) return;
  const budget = interval / measured, cpu = cpuTotal / measured;
  const { fallback, gpuSupported, gpuMs, backend, gpuUpdates } = scene.lightingDiagnostics();
  frameRate.value = `${Math.round(1000 / budget)} FPS`;
  const usage = (ms: number, share: number) => `${ms.toFixed(1)} ms · ${Math.round(share * 100)}%`;
  cpuTime.value = `CPU ${usage(cpu, cpu / budget)}`;
  gpuTime.value = `GPU GI ${gpuMs !== undefined ? usage(gpuMs, gpuMs * (gpuUpdates - lastGpuUpdates) / interval) : backend !== 'gpu' ? '—' : gpuSupported ? '측정 중' : '측정 미지원'}`;
  lastGpuUpdates = gpuUpdates;
  lightingBackend.hidden = !fallback;
  interval = cpuTotal = measured = 0;
});

function changeVolume() {
  volumeValue.value = `${volume.value}%`;
  volume.setAttribute('aria-valuetext', volumeValue.value);
  scene.setVolume(Number(volume.value));
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
    // Display one backing pixel per device pixel and use the same snapped viewport for input and both layers.
    const left = Math.round(bounds.left * pixelDensity) / pixelDensity - bounds.left;
    const top = Math.round(bounds.top * pixelDensity) / pixelDensity - bounds.top;
    for (const { style } of [game.canvas, hudCanvas]) {
      style.left = `${left}px`; style.top = `${top}px`;
      style.width = `${width / pixelDensity}px`; style.height = `${height / pixelDensity}px`;
    }
    if (hudCanvas.width !== width) hudCanvas.width = width;
    if (hudCanvas.height !== height) hudCanvas.height = height;
    if (game.scale.width !== width || game.scale.height !== height) game.scale.resize(width, height);
    else game.scale.refresh();
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
pixelSize.value = String(defaultPixelStep);
pixelSize.addEventListener('input', changePixelSize);
lightingMode.addEventListener('change', changeLighting);
directLightStrength.addEventListener('input', changeLighting);
lightingStrength.addEventListener('input', changeLighting);
lightingPreview.addEventListener('change', changeLighting);
shadowMode.addEventListener('change', () => scene.setShadowMode(shadowMode.value as ShadowMode));
volume.addEventListener('input', changeVolume);
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
changeLighting();
scene.setShadowMode(shadowMode.value as ShadowMode);
changeVolume();
