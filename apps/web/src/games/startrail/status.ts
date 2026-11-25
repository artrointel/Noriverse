export const statusSpecs = {
  ignition: { name: '점화', color: '#ff9b61', duration: [5, 5] },
  freeze: { name: '빙결', color: '#8ceaff', duration: [5, 5] },
  stun: { name: '기절', color: '#ffde7e', duration: [3, 5] },
  poison: { name: '맹독', color: '#d8a3f8', duration: [10, 20] },
  shock: { name: '감전', color: '#b6c2ff', duration: [5, 5] },
} as const;

export type StatusKind = keyof typeof statusSpecs;
export type BlockingStatus = 'stun' | 'poison' | 'shock';
export type StatusLevel = 1 | 2;
export type StatusEffect = { kind: StatusKind; level: StatusLevel; until: number; tickAt: number };
export type Statuses = Partial<Record<StatusKind, StatusEffect>>;

type StatusProc = { kind: StatusKind; chance: number; strongChance?: number };
const combatStatusProcs: Readonly<Partial<Record<string, StatusProc>>> = {
  pulse: { kind: 'ignition', chance: .33 },
  boar: { kind: 'stun', chance: .30 },
  spore: { kind: 'freeze', chance: .40, strongChance: .55 },
  grub: { kind: 'poison', chance: .28 },
  sentinel: { kind: 'shock', chance: .25, strongChance: .40 },
};

export function rollCombatStatus(statuses: Statuses, source: string, now: number, strong = false, random = Math.random) {
  const proc = Object.hasOwn(combatStatusProcs, source) ? combatStatusProcs[source] : undefined;
  if (!proc) return;
  const strongChance = strong ? proc.strongChance : undefined;
  if (random() < (strongChance ?? proc.chance)) applyStatus(statuses, proc.kind, strongChance === undefined ? 1 : 2, now);
}

export function applyStatus(statuses: Statuses, kind: StatusKind, level: StatusLevel, now: number) {
  const existing = statuses[kind];
  const active = existing && existing.until > now ? existing : undefined;
  if (active && active.level > level) return false;
  statuses[kind] = { kind, level, until: now + statusSpecs[kind].duration[level - 1], tickAt: active?.tickAt ?? now + 1 };
  return !active || level > active.level;
}

export function activeStatuses(statuses: Statuses, now: number) {
  return Object.values(statuses).filter(effect => effect.until > now);
}

export function shortenStatuses(statuses: Statuses, now: number, time: number) {
  for (const effect of activeStatuses(statuses, now)) {
    effect.until -= time;
    if (effect.until <= now) delete statuses[effect.kind];
  }
}

export function statusModifiers(statuses: Statuses, now: number) {
  const active = (kind: StatusKind) => (statuses[kind]?.until ?? -Infinity) > now;
  const stunned = active('stun'), shocked = active('shock');
  const attackBlock: BlockingStatus | undefined = stunned ? 'stun' : shocked ? 'shock' : undefined;
  const supportBlock: BlockingStatus | undefined = stunned ? 'stun' : active('poison') ? 'poison' : undefined;
  return {
    speed: stunned ? 0 : active('freeze') ? statuses.freeze!.level === 2 ? .5 : .7 : 1,
    stunned, attack: !attackBlock, roll: !attackBlock, attackBlock,
    support: !supportBlock, supportBlock, outgoing: shocked && statuses.shock!.level === 2 ? .5 : 1,
  };
}

export function tickStatuses(statuses: Statuses, now: number, hp: number, maxHp: number) {
  const dot = [statuses.ignition, statuses.poison].filter((effect): effect is StatusEffect => !!effect);
  while (dot.length) {
    const effect = dot.reduce((first, next) => first.tickAt <= next.tickAt ? first : next);
    if (effect.tickAt > now + 1e-8) break;
    if (effect.tickAt <= effect.until + 1e-8) {
      hp = Math.max(0, hp - (effect.kind === 'poison' ? hp * .05 : maxHp * .05 * effect.level));
      effect.tickAt++;
    } else dot.splice(dot.indexOf(effect), 1);
  }
  for (const effect of Object.values(statuses)) if (now >= effect.until) delete statuses[effect.kind];
  return hp;
}
