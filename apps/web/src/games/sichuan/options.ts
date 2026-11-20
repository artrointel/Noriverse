export const sichuanThemes = ['classic', 'pixel', 'food', 'animals', 'electronics', 'flags', 'school', 'numbers'] as const;
export type SichuanTheme = typeof sichuanThemes[number];
export const sichuanSizes = [6, 8, 10, 12] as const;
export type SichuanSize = typeof sichuanSizes[number];
export const sichuanTimeLimits: Record<SichuanSize, number> = { 6: 30, 8: 60, 10: 105, 12: 165 };
export const motifCount = (theme: SichuanTheme) => theme === 'numbers' ? 10 : theme === 'classic' ? 16 : 14;

export type SichuanSettings = {
  theme: SichuanTheme | 'random';
  size: SichuanSize;
  density: number | 'random';
  obstacles: boolean;
  shuffles: number;
  timeLimit?: number;
};

export const defaultSichuanSettings: SichuanSettings = { theme: 'random', size: 8, density: 80, obstacles: true, shuffles: 3 };
export type SichuanMode = 'race' | 'coop';
export type SichuanRoomSettings = { mode: SichuanMode; settings: SichuanSettings };
export const defaultSichuanRoomSettings: SichuanRoomSettings = { mode: 'race', settings: defaultSichuanSettings };

export function readSichuanRoomSettings(value: unknown): SichuanRoomSettings | undefined {
  if (!value || typeof value !== 'object') return;
  const { mode, settings } = value as Partial<SichuanRoomSettings>;
  if ((mode !== 'race' && mode !== 'coop') || !settings || typeof settings !== 'object') return;
  const { size, theme, density, obstacles, shuffles, timeLimit } = settings;
  if (!sichuanSizes.includes(size) || (theme !== 'random' && !sichuanThemes.includes(theme))
    || (density !== 'random' && (!Number.isInteger(density) || density < 50 || density > 100))
    || typeof obstacles !== 'boolean' || !Number.isInteger(shuffles) || shuffles < 0 || shuffles > 5
    || (timeLimit !== undefined && (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > 3600))) return;
  return { mode, settings: { size, theme, density, obstacles, shuffles, timeLimit } };
}

export function resolveSichuanSettings(settings: SichuanSettings, random = Math.random) {
  const { theme, density, size, timeLimit } = settings;
  return {
    ...settings,
    theme: theme === 'random' ? sichuanThemes[Math.floor(random() * sichuanThemes.length)] : theme,
    density: density === 'random' ? 50 + Math.floor(random() * 51) : density,
    timeLimit: timeLimit ?? sichuanTimeLimits[size],
  };
}
