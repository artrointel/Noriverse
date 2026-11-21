export const sichuanSceneHeight = 640;
export const sichuanThemes = ['pixel', 'food', 'animals', 'electronics', 'flags', 'school', 'numbers'] as const;
export type SichuanTheme = typeof sichuanThemes[number];
export const sichuanSizes = [6, 8, 10, 12] as const;
export type SichuanSize = 4 | typeof sichuanSizes[number];
export const sichuanTimeLimits: Record<SichuanSize, number> = { 4: 90, 6: 30, 8: 60, 10: 105, 12: 165 };
export const motifCount = (theme: SichuanTheme) => theme === 'numbers' ? 10 : 14;

export type SichuanSettings = {
  theme: SichuanTheme | 'random';
  size: SichuanSize;
  density: number | 'random';
  obstacles: boolean;
  obstacleDensity?: number;
  shuffles: number;
  hints?: number;
  timeLimit?: number;
};

export const minSichuanTileDensity = 30;
export const maxSichuanTileDensity = 100;
export const defaultSichuanTileDensity = 60;
export const defaultObstacleDensity = 20;
export const defaultHints = 3;
export const defaultSichuanSettings: SichuanSettings = { theme: 'random', size: 8, density: defaultSichuanTileDensity, obstacles: true, obstacleDensity: defaultObstacleDensity, shuffles: 3, hints: defaultHints };
export type SichuanMode = 'race' | 'coop';
export type SichuanRoomSettings = { mode: SichuanMode; settings: SichuanSettings };
export const defaultSichuanRoomSettings: SichuanRoomSettings = { mode: 'race', settings: defaultSichuanSettings };

export const sichuanTileCount = (size: SichuanSize, density: number) => Math.round(size ** 2 * density / 200) * 2;
export const maxSichuanObstacleDensity = (size: SichuanSize, density: number | 'random') =>
  Math.floor((size ** 2 - sichuanTileCount(size, density === 'random' ? minSichuanTileDensity : density)) * 100 / size ** 2);

const highestSichuanObstacleDensity = Math.max(...sichuanSizes.map(size => maxSichuanObstacleDensity(size, 'random')));

export function sichuanObstacleCount(size: SichuanSize, density: number, obstacleDensity: number) {
  return Math.round(size ** 2 * Math.min(obstacleDensity, maxSichuanObstacleDensity(size, density)) / 100);
}

export function readSichuanRoomSettings(value: unknown, memory = false): SichuanRoomSettings | undefined {
  if (!value || typeof value !== 'object') return;
  const { mode, settings } = value as Partial<SichuanRoomSettings>;
  if ((mode !== 'race' && mode !== 'coop') || !settings || typeof settings !== 'object') return;
  const { size, theme, density, obstacles, obstacleDensity, shuffles, hints, timeLimit } = settings;
  if (!(memory ? size === 4 || size === 6 : (sichuanSizes as readonly number[]).includes(size))
    || (memory && (mode !== 'race' || density !== 100 || obstacles || shuffles !== 0 || hints !== 0))
    || (theme !== 'random' && !sichuanThemes.includes(theme))
    || (density !== 'random' && (!Number.isInteger(density) || density < minSichuanTileDensity || density > maxSichuanTileDensity))
    || typeof obstacles !== 'boolean' || !Number.isInteger(shuffles) || shuffles < 0 || shuffles > 5
    || (hints !== undefined && (!Number.isInteger(hints) || hints < 0 || hints > 5))
    || (obstacleDensity !== undefined && (!Number.isInteger(obstacleDensity) || obstacleDensity < 0 || obstacleDensity > highestSichuanObstacleDensity))
    || (timeLimit !== undefined && (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > 3600))) return;
  return { mode, settings: { size, theme, density, obstacles, obstacleDensity, shuffles, hints, timeLimit } };
}

export function resolveSichuanSettings(settings: SichuanSettings, random = Math.random) {
  const { theme, density, size, timeLimit } = settings;
  const resolvedTheme = theme === 'random' ? sichuanThemes[Math.floor(random() * sichuanThemes.length)] : theme;
  const resolvedDensity = density === 'random'
    ? minSichuanTileDensity + Math.floor(random() * (maxSichuanTileDensity - minSichuanTileDensity + 1)) : density;
  return {
    ...settings,
    theme: resolvedTheme,
    density: resolvedDensity,
    hints: settings.hints ?? defaultHints,
    obstacleDensity: settings.obstacles ? Math.min(settings.obstacleDensity ?? defaultObstacleDensity, maxSichuanObstacleDensity(size, resolvedDensity)) : 0,
    timeLimit: timeLimit ?? sichuanTimeLimits[size],
  };
}
