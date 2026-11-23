import { cardModifiers, supplyAvailable, unlockLevels } from './cards.ts';
import { burgerFacility, burgerGrillCapacity, burgerGrillMultiplier, burgerStorageSize, burgerTables, burgerTrayCapacity, isAutoAssemblySlot } from './rules.ts';
import type { Counter } from './rules.ts';

export type StoreStatusRow = readonly [label: string, value?: string];

export function burgerStoreRows(counter: Counter, language: string, translate: (key: string) => string): StoreStatusRow[] {
  const cards = counter.cards;
  if (!cards?.length) return [];

  const number = new Intl.NumberFormat(language);
  const signed = new Intl.NumberFormat(language, { signDisplay: 'exceptZero' });
  const bonus = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  const text = (key: string) => translate('burgerStore_' + key);
  const row = (key: string, value: string): StoreStatusRow => [text(key), value];
  const only = (changed: boolean, key: string, value: string) => changed ? row(key, value) : undefined;
  const change = (key: string, multiplier: number) => only(multiplier !== 1, key, bonus.format(multiplier - 1));
  function section(key: string, rows: (StoreStatusRow | undefined)[]): StoreStatusRow[] {
    const shown = rows.filter(value => value !== undefined);
    return shown.length ? [[text(key)], ...shown] : [];
  }

  const { xp, revenue, traffic, patience, layers } = cardModifiers(cards);
  const autoFlip = cards.includes('autoGrill') || cards.includes('autoGrill2');
  const available = text('available');
  const supplies: StoreStatusRow[] = Object.keys(unlockLevels).flatMap(item => {
    if (!cards.some(card => card === `unlock:${item}` || card === `sold:${item}`)) return [];
    return [[translate('burgerLabel_' + item), text(supplyAvailable(cards, item) ? 'unlocked' : 'sold')]];
  });

  return [
    ...section('rewards', [change('xp', xp), change('revenue', revenue)]),
    ...section('guests', [
      change('traffic', traffic), change('waitBonus', patience),
      only(layers !== 0, 'layers', signed.format(layers)),
    ]),
    ...section('equipment', [
      only(burgerFacility(counter, 'griddle'), 'grill', number.format(burgerGrillCapacity(counter))),
      change('grillSpeed', burgerGrillMultiplier(cards)),
      only(autoFlip, 'grillMode', text(cards.includes('autoGrill2') ? 'autoFlipUnload' : 'autoFlip')),
      only(burgerFacility(counter, 'tray'), 'tray', number.format(burgerTrayCapacity(counter))),
      only(burgerFacility(counter, 'assembly'), 'assembly', text(isAutoAssemblySlot(counter, 1) ? 'assemblyAuto' : 'assemblyDouble')),
      only(burgerFacility(counter, 'storage'), 'storage', number.format(burgerStorageSize)),
      only(burgerFacility(counter, 'orderStorage'), 'drinkStorage', available),
      only(cards.includes('table'), 'tables', number.format(burgerTables(counter))),
      only(burgerFacility(counter, 'broom'), 'broom', available),
    ]),
    ...section('supplies', supplies),
  ];
}
