import { tableSize } from './table.ts';

export const fixedResolutions = [480, 720, 960, 1440, 1920] as const;
export type RenderResolution = 'auto' | typeof fixedResolutions[number];
export type RenderSize = { width: number; height: number };

export function readResolution(value: string | null): RenderResolution {
  return fixedResolutions.find(size => String(size) === value) ?? 'auto';
}

export function renderFrameSize(quality: RenderResolution, availableWidth: number, availableHeight: number, sceneHeight: number): RenderSize {
  const limit = quality === 'auto' ? fixedResolutions[fixedResolutions.length - 1] : quality;
  const aspect = sceneHeight / tableSize;
  const width = Math.max(0, Math.floor(Math.min(limit, availableWidth, availableHeight / aspect)));
  return { width, height: Math.round(width * aspect) };
}

export function renderBufferSize(quality: RenderResolution, frame: RenderSize, sceneHeight: number, devicePixelRatio: number): RenderSize {
  const density = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const width = frame.width > 0 ? Math.max(1, Math.round(frame.width * density)) : 0;
  return renderFrameSize(quality, width, Infinity, sceneHeight);
}
