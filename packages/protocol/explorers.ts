export const explorerIds = ['toring', 'solori', 'kommi', 'noeulbi', 'muruon', 'parumi', 'pulsori', 'guriong', 'bilmong', 'talgak', 'jiena'] as const;
export type ExplorerId = (typeof explorerIds)[number];

export const isExplorerId = (value: unknown): value is ExplorerId => explorerIds.some(id => id === value);
