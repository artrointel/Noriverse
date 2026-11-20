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
