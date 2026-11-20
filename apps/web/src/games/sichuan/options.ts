export const sichuanThemes = ['classic', 'pixel', 'food', 'animals', 'electronics', 'flags', 'school', 'numbers'] as const;
export type SichuanTheme = typeof sichuanThemes[number];
export const sichuanSizes = [6, 8, 10, 12] as const;
export type SichuanSize = typeof sichuanSizes[number];
export const sichuanTimeLimits: Record<SichuanSize, number> = { 6: 120, 8: 240, 10: 420, 12: 660 };
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

export function resolveSichuanSettings(settings: SichuanSettings, random = Math.random) {
  const { theme, density, size, timeLimit } = settings;
  return {
    ...settings,
    theme: theme === 'random' ? sichuanThemes[Math.floor(random() * sichuanThemes.length)] : theme,
    density: density === 'random' ? 50 + Math.floor(random() * 51) : density,
    timeLimit: timeLimit ?? sichuanTimeLimits[size],
  };
}
