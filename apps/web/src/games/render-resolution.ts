export const fixedResolutions = [480, 720, 960, 1440, 1920] as const;
export type RenderResolution = 'auto' | typeof fixedResolutions[number];

export function readResolution(value: string | null): RenderResolution {
  return fixedResolutions.find(size => String(size) === value) ?? 'auto';
}

export function renderPixelSize(quality: RenderResolution, width: number, height: number, pixelRatio: number) {
  if (quality !== 'auto') return quality;
  const size = Math.round(Math.min(width, height) * pixelRatio);
  return Number.isFinite(size) && size > 0 ? Math.min(fixedResolutions[fixedResolutions.length - 1], size) : 0;
}
