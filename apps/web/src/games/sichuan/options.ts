export const sichuanSceneHeight = 640;
export const sichuanThemes = ['pixel', 'food', 'animals', 'electronics', 'flags', 'school', 'numbers'] as const;
export type SichuanTheme = typeof sichuanThemes[number];
export const sichuanSizes = [6, 8, 10, 12] as const;
export type SichuanSize = typeof sichuanSizes[number];
export const sichuanTimeLimits: Record<SichuanSize, number> = { 6: 30, 8: 60, 10: 105, 12: 165 };
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

export const defaultObstacleDensity = 6;
export const defaultHints = 3;
export const defaultSichuanSettings: SichuanSettings = { theme: 'random', size: 8, density: 80, obstacles: true, obstacleDensity: defaultObstacleDensity, shuffles: 3, hints: defaultHints };
export type SichuanMode = 'race' | 'coop';
export type SichuanRoomSettings = { mode: SichuanMode; settings: SichuanSettings };
export const defaultSichuanRoomSettings: SichuanRoomSettings = { mode: 'race', settings: defaultSichuanSettings };

export const sichuanTileCount = (size: SichuanSize, density: number) => Math.round(size ** 2 * density / 200) * 2;
export const maxSichuanObstacleDensity = (size: SichuanSize, density: number | 'random') =>
  Math.floor((size ** 2 - sichuanTileCount(size, density === 'random' ? 50 : density)) * 100 / size ** 2);

export function sichuanObstacleCount(size: SichuanSize, density: number, obstacleDensity: number) {
  return Math.round(size ** 2 * Math.min(obstacleDensity, maxSichuanObstacleDensity(size, density)) / 100);
}

export function readSichuanRoomSettings(value: unknown): SichuanRoomSettings | undefined {
  if (!value || typeof value !== 'object') return;
  const { mode, settings } = value as Partial<SichuanRoomSettings>;
  if ((mode !== 'race' && mode !== 'coop') || !settings || typeof settings !== 'object') return;
  const { size, theme, density, obstacles, obstacleDensity, shuffles, hints, timeLimit } = settings;
  if (!sichuanSizes.includes(size) || (theme !== 'random' && !sichuanThemes.includes(theme))
    || (density !== 'random' && (!Number.isInteger(density) || density < 50 || density > 100))
    || typeof obstacles !== 'boolean' || !Number.isInteger(shuffles) || shuffles < 0 || shuffles > 5
    || (hints !== undefined && (!Number.isInteger(hints) || hints < 0 || hints > 5))
    || (obstacleDensity !== undefined && (!Number.isInteger(obstacleDensity) || obstacleDensity < 0 || obstacleDensity > 50))
    || (timeLimit !== undefined && (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > 3600))) return;
  return { mode, settings: { size, theme, density, obstacles, obstacleDensity, shuffles, hints, timeLimit } };
}

export function resolveSichuanSettings(settings: SichuanSettings, random = Math.random) {
  const { theme, density, size, timeLimit } = settings;
  const resolvedTheme = theme === 'random' ? sichuanThemes[Math.floor(random() * sichuanThemes.length)] : theme;
  const resolvedDensity = density === 'random' ? 50 + Math.floor(random() * 51) : density;
  return {
    ...settings,
    theme: resolvedTheme,
    density: resolvedDensity,
    hints: settings.hints ?? defaultHints,
    obstacleDensity: settings.obstacles ? Math.min(settings.obstacleDensity ?? defaultObstacleDensity, maxSichuanObstacleDensity(size, resolvedDensity)) : 0,
    timeLimit: timeLimit ?? sichuanTimeLimits[size],
  };
}
