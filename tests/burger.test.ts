import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitBurgerPixels, orderBubbleSize } from '../apps/web/src/games/burger/layout.ts';
import { seatDiner, shiftDiner } from '../apps/web/src/games/burger/dining.ts';
import {
  advanceBurger, applyBurgerAction, burgerOutcome, createBurgerRound, cupAmount, cupSize, grillCount,
  burgerStorageSize, judgeOrder, nextBurgerAt, pattyAt, pattyDoneness, pattyFaces, pattyFrame, readBurgerRound, resignBurger, shiftBurgerClock, startBurgerRound,
} from '../apps/web/src/games/burger/rules.ts';
import type { BurgerAction, BurgerRound, Order } from '../apps/web/src/games/burger/rules.ts';

const opening = 100_000;
const initial = (players: BurgerRound['players'] = ['host']) =>
  startBurgerRound(createBurgerRound(3, players, 17), opening);

test('the pixel slider keeps a 3:2 screen and uses whole display pixels at each density', () => {
  assert.deepEqual(fitBurgerPixels(960, 640, 1, 2), {
    frame: { width: 960, height: 640 }, buffer: { width: 480, height: 320 }, step: 2,
  });
  assert.deepEqual(fitBurgerPixels(960, 640, 1, 4), {
    frame: { width: 960, height: 640 }, buffer: { width: 240, height: 160 }, step: 4,
  });
  assert.deepEqual(fitBurgerPixels(400, 260, 3, 3), {
    frame: { width: 390, height: 260 }, buffer: { width: 390, height: 260 }, step: 3,
  });
  assert.equal(fitBurgerPixels(1920, 1280, 3, 1).step, 3);
});

test('order bubbles contain the whole burger and leave room for a drink at every stack height', () => {
  for (let layers = 1; layers <= 7; layers++) {
    const burgerOnly = orderBubbleSize(layers, false);
    const withDrink = orderBubbleSize(layers, true);
    for (const { width, height, burger, stack } of [burgerOnly, withDrink]) {
      assert(width >= burger + 12);
      assert(height >= burger + stack + 8);
    }
    assert(withDrink.width > burgerOnly.width && withDrink.height >= 40);
  }
});

test('served diners reserve the next free table in FIFO order and keep their schedule on pause', () => {
  const diners = [];
  for (let id = 1; id <= 8; id++) {
    diners.push(seatDiner(diners, { id, guest: id }, opening + id * 200, 'perfect'));
  }
  assert.deepEqual(diners.slice(0, 6).map(({ table }) => table), [0, 1, 2, 3, 4, 5]);
  for (const diner of diners.slice(6)) {
    const previous = diners.find(entry => entry.table === diner.table);
    assert(previous && diner.walkAt >= previous.doneAt);
  }
  assert(diners.every((diner, i) => !i || diner.walkAt >= diners[i - 1].walkAt));
  const delayed = shiftDiner(diners[2], 4000);
  assert.equal(delayed.walkAt, diners[2].walkAt + 4000);
  assert.equal(delayed.exitAt - delayed.eatAt, diners[2].exitAt - diners[2].eatAt);
});

function action(round: BurgerRound, input: BurgerAction, now: number): BurgerRound {
  const next = applyBurgerAction(round, 'host', input, now);
  assert(next, JSON.stringify(input));
  return next;
}

test('grill heat follows both faces independently and tray and burger moves preserve the patty', () => {
  let round = advanceBurger(initial(), opening + 250)!;
  const tap = (input: BurgerAction, age: number) => { round = action(round, input, opening + age); };
  assert.equal(round.counters.host!.grill.length, grillCount);
  assert.equal(grillCount, 8);
  tap({ type: 'grill', kind: 'beef', slot: 0 }, 500);
  tap({ type: 'flip', slot: 0 }, 7500);
  assert.deepEqual(pattyFaces(round.counters.host!.grill[0]!, opening + 14_500), [100, 100]);
  assert.equal(applyBurgerAction(round, 'host', { type: 'hold', slot: 0 }, opening + 10_700), undefined);
  tap({ type: 'hold', slot: 0 }, 14_500);
  tap({ type: 'grill', kind: 'chicken', slot: 1 }, 14_600);
  tap({ type: 'move', from: 1, to: 'tray' }, 15_000);
  assert.equal(round.counters.host!.tray.at(-1)?.kind, 'chicken');
  tap({ type: 'move', from: 'tray', to: 'trash' }, 15_100);
  tap({ type: 'add', item: 'paper', slot: 1 }, 15_200);
  tap({ type: 'add', item: 'bun', slot: 1 }, 15_250);
  tap({ type: 'stack', from: 'tray', slot: 1 }, 15_300);
  assert.equal(round.counters.host!.tray.length, 0);
  tap({ type: 'pop', slot: 1 }, 15_400);
  assert.deepEqual(round.counters.host!.tray[0].faces, [100, 100]);
  tap({ type: 'stack', from: 'tray', slot: 1 }, 15_500);
  tap({ type: 'add', item: 'bun', slot: 1 }, 15_600);
  tap({ type: 'wrap', slot: 1 }, 15_700);
  assert.equal(applyBurgerAction(round, 'host', { type: 'pop', slot: 1 }, opening + 15_800), undefined);
  tap({ type: 'stage-burger', slot: 1 }, 15_900);
  tap({ type: 'serve', order: 1 }, 16_000);
  assert.equal(round.counters.host!.money, 155);
  assert.equal(round.counters.host!.combo, 1);
  assert.deepEqual([pattyDoneness([70, 70]), pattyDoneness([90, 110]), pattyDoneness([130, 130])], ['rare', 'medium', 'well']);
  assert.equal(pattyDoneness([49, 110]), undefined);
  assert.equal(pattyDoneness([151, 70]), 'medium');
  assert.equal(pattyDoneness([199, 70]), 'well');
  assert.equal(pattyDoneness([200, 70]), undefined);
  assert.equal(pattyDoneness([70, 200]), undefined);
  assert.equal(pattyFrame([199, 70], 0), 3);
  assert.equal(pattyFrame([200, 70], 1), 4);
  assert.equal(pattyFrame([70, 200]), 4);
  const burnt = action(round, { type: 'grill', kind: 'beef', slot: 7 }, opening + 16_050);
  assert.deepEqual(pattyFaces(burnt.counters.host!.grill[7]!, opening + 120_000), [200, 0]);
});

test('drinks keep the same three size thresholds and spill as soon as they reach 200%', () => {
  let round = advanceBurger(initial(['host', 'guest']), opening + 250)!;
  round = action(round, { type: 'pour', drink: 0 }, opening + 500);
  const cup = round.counters.host!.cups[0];
  assert.deepEqual([1500, 2000, 2500].map(ms => cupSize(cupAmount(cup, opening + 500 + ms))), ['small', 'medium', 'large']);
  assert.deepEqual([0, 87.45, 87.5, 112.45, 112.5, 150, 199.95, 200].map(cupSize),
    [undefined, 'small', 'medium', 'medium', 'large', 'large', 'large', undefined]);
  round = action(round, { type: 'pour', drink: 0 }, opening + 2500);
  assert.equal(cupAmount(round.counters.host!.cups[0], opening + 7000), 100);
  round = action(round, { type: 'pour', drink: 1 }, opening + 3000);
  assert.equal(nextBurgerAt(round), opening + 7000);
  assert.equal(advanceBurger(round, opening + 6999), undefined);
  const stopped = action(round, { type: 'pour', drink: 1 }, opening + 6999);
  assert.equal(stopped.counters.host!.cups[1].amount, 199.95);
  assert.deepEqual(readBurgerRound(stopped)?.counters.host?.cups, stopped.counters.host!.cups);
  const resumed = action(stopped, { type: 'pour', drink: 1 }, opening + 8000);
  assert.equal(nextBurgerAt(resumed), opening + 8001);
  assert.equal(advanceBurger(resumed, opening + 8001)?.counters.host!.cups[1].amount, 0);
  round = advanceBurger(round, opening + 7000)!;
  assert.deepEqual(round.counters.host!.cups.map(cup => cupAmount(cup, opening + 7000)), [100, 0]);
  assert.equal(round.counters.host!.feedback?.kind, 'spill');
});

test('each holding well pops its own most recent patty and rejects the other kind', () => {
  let round = advanceBurger(initial(), opening + 250)!;
  const tap = (input: BurgerAction) => { round = action(round, input, opening + 300); };
  tap({ type: 'grill', kind: 'beef', slot: 0 });
  tap({ type: 'grill', kind: 'chicken', slot: 1 });
  tap({ type: 'grill', kind: 'beef', slot: 2 });
  tap({ type: 'flip', slot: 2 });
  assert.equal(applyBurgerAction(round, 'host', { type: 'move', from: 1, to: 'beef' }, opening + 300), undefined);
  tap({ type: 'move', from: 0, to: 'beef' });
  tap({ type: 'move', from: 1, to: 'chicken' });
  tap({ type: 'move', from: 2, to: 'beef' });
  assert.equal(pattyAt(round.counters.host!, 'beef')?.side, 1);
  assert.equal(pattyAt(round.counters.host!, 'chicken')?.kind, 'chicken');
  tap({ type: 'move', from: 'beef', to: 'trash' });
  assert.equal(pattyAt(round.counters.host!, 'beef')?.side, 0);
  assert.equal(pattyAt(round.counters.host!, 'chicken')?.kind, 'chicken');
});

test('the rack preserves eight distinct orders and only stages one burger at a time', () => {
  let round = advanceBurger(initial(['host', 'guest']), opening + 250)!;
  const ready = {
    paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }],
  } satisfies NonNullable<BurgerRound['counters']['host']>['burgers'][0];
  for (let index = 0; index < burgerStorageSize; index++) {
    round.counters.host!.burgers[0] = ready;
    round = action(round, { type: 'store-burger', slot: 0, index }, opening + 400);
  }
  assert.equal(round.counters.host!.storage?.length, 8);
  round.counters.host!.burgers[1] = ready;
  assert.equal(applyBurgerAction(round, 'host', { type: 'store-burger', slot: 1, index: 0 }, opening + 500), undefined);
  assert.equal(applyBurgerAction(round, 'host', { type: 'store-burger', slot: 1, index: 8 }, opening + 500), undefined);
  const snapshot = JSON.parse(JSON.stringify(round));
  assert.deepEqual(readBurgerRound(snapshot)?.counters.host?.storage, snapshot.counters.host.storage);
  round = action(round, { type: 'stage-stored', index: 7 }, opening + 500);
  assert.equal(round.counters.host!.storage?.[7], null);
  assert.equal(applyBurgerAction(round, 'host', { type: 'stage-stored', index: 6 }, opening + 500), undefined);
  round = action(round, { type: 'discard-stored', index: 6 }, opening + 500);
  assert.equal(round.counters.host!.storage?.[6], null);
  round = action(round, { type: 'serve', order: 1 }, opening + 600);
  assert.equal(round.counters.host!.money, 155);
  assert.equal(round.counters.host!.storage?.filter(Boolean).length, 6);
});

test('the order judge compares layer positions, doneness, and drink separately', () => {
  const meal: Order = {
    id: 2, guest: 1, bread: 'rice', price: 220, at: opening, until: opening + 30_000,
    layers: [{ ingredient: 'cheese' }, { ingredient: 'chicken', cooked: 'well' }, { ingredient: 'pickle' }],
    drink: { kind: 'soda', size: 'large' },
  };
  const burger = {
    bread: 'rice', paper: true, packed: true, top: true,
    layers: [{ ingredient: 'cheese' }, { ingredient: 'chicken', patty: { kind: 'chicken', side: 0, faces: [131, 129], heatAt: 0 } },
      { ingredient: 'pickle' }],
  } satisfies Parameters<typeof judgeOrder>[1];
  assert.deepEqual(judgeOrder(meal, burger, meal.drink), { money: 305, perfect: true });
  const wrong = judgeOrder(meal, { ...burger, layers: [...burger.layers].reverse() }, { kind: 'cola', size: 'small' });
  assert(!wrong.perfect);
  assert(wrong.money > 0 && wrong.money < 110);
  assert.deepEqual(judgeOrder(meal, burger), { money: 220, perfect: false });
});

test('the fifth perfect order starts fever and the next fifth refreshes its active window to five seconds', () => {
  let round = advanceBurger(initial(), opening + 250)!;
  const board = round.counters.host!;
  const ready = {
    ...board.burgers[0], paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }],
  } satisfies typeof board.burgers[0];
  const first = board.orders[0];
  Object.assign(board, { combo: 4, served: 4, best: 4, service: { burger: ready } });
  round = action(round, { type: 'serve', order: 1 }, opening + 1000);
  assert.equal(round.counters.host!.feverUntil, opening + 11_000);
  assert.equal(round.counters.host!.money, 155);
  Object.assign(round.counters.host!, { combo: 9, served: 9, best: 9, orders: [first], service: { burger: ready } });
  round = action(round, { type: 'serve', order: 1 }, opening + 2500);
  assert.equal(round.counters.host!.money, 465);
  assert.equal(round.counters.host!.feverUntil, opening + 7500);
});

test('the service tray moves food without paying and only submits to the guest at the front', () => {
  let round = advanceBurger(initial(['host', 'guest']), opening + 250)!;
  round = advanceBurger(round, nextBurgerAt(round)!)!;
  const board = round.counters.host!;
  const now = board.orders[1].at + 1;
  const ready = {
    ...board.burgers[0], paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }],
  } satisfies typeof board.burgers[0];
  board.burgers[0] = ready;
  board.cups[0] = { amount: 70, pourAt: now - 600 };
  assert.equal(applyBurgerAction(round, 'host', { type: 'serve', order: 1 }, now), undefined);
  round = action(round, { type: 'stage-burger', slot: 0 }, now);
  round = action(round, { type: 'stage-drink', drink: 0 }, now);
  assert.equal(round.counters.host!.burgers[0].paper, false);
  assert.equal(round.counters.host!.money, 0);
  assert.deepEqual(round.counters.host!.service, { burger: ready, drink: { kind: 'cola', amount: 100 } });
  assert.deepEqual(round.counters.host!.cups[0], { amount: 0, pourAt: 0 });
  assert.equal(applyBurgerAction(round, 'host', { type: 'serve', order: 2 }, now), undefined);
  assert.equal(applyBurgerAction(round, 'host', { type: 'stage-burger', slot: 1 }, now), undefined);
  const snapshot = JSON.parse(JSON.stringify(round));
  assert.deepEqual(readBurgerRound(snapshot)?.counters.host?.service, snapshot.counters.host.service);
  const afterExpiry = advanceBurger(round, round.counters.host!.orders[0].until)!;
  assert.notEqual(afterExpiry.counters.host!.orders[0]?.id, 1);
  assert.deepEqual(afterExpiry.counters.host!.service, round.counters.host!.service);
  round = action(round, { type: 'return-burger', to: 1 }, now);
  round = action(round, { type: 'return-drink', to: 'machine' }, now);
  assert.deepEqual(round.counters.host!.burgers[1], ready);
  assert.equal(round.counters.host!.cups[0].amount, 100);
  round = action(round, { type: 'stage-burger', slot: 1 }, now);
  round = action(round, { type: 'serve', order: 1 }, now);
  assert.equal(round.counters.host!.money, 155);
  assert.equal(round.counters.host!.orders[0].id, 2);
  assert.equal(round.counters.host!.service, undefined);
  assert.equal(round.counters.host!.diners?.[0].id, 1);
  const served = JSON.parse(JSON.stringify(round));
  assert.deepEqual(readBurgerRound(served)?.counters.host?.diners, served.counters.host.diners);
  const exitAt = round.counters.host!.diners![0].exitAt;
  while (nextBurgerAt(round)! <= exitAt) round = advanceBurger(round, nextBurgerAt(round)!)!;
  assert.deepEqual(round.counters.host!.diners, []);
});

test('four counters resume from the same snapshot and rank by sales at closing', () => {
  const seats = ['host', 'guest', 'guest2', 'guest3'] satisfies BurgerRound['players'];
  let round = advanceBurger(initial(seats), opening + 250)!;
  assert.deepEqual(round.counters.host!.orders, round.counters.guest3!.orders);
  round = action(round, { type: 'grill', kind: 'beef', slot: 0 }, opening + 500);
  round = action(round, { type: 'pour', drink: 0 }, opening + 600);
  const shifted = shiftBurgerClock(round, 5000);
  assert.equal(shifted.counters.host!.orders[0].until, round.counters.host!.orders[0].until + 5000);
  assert.deepEqual(pattyFaces(shifted.counters.host!.grill[0]!, opening + 8000),
    pattyFaces(round.counters.host!.grill[0]!, opening + 3000));
  const snapshot = JSON.parse(JSON.stringify(shifted));
  assert.deepEqual(JSON.parse(JSON.stringify(readBurgerRound(snapshot))), snapshot);
  assert.equal(readBurgerRound({ ...shifted, end: shifted.end + 100 }), undefined);
  round = resignBurger(round, 'guest2')!;
  round.counters.host!.money = 100;
  round.counters.guest!.money = 140;
  round.counters.guest2!.money = 250;
  const finished = advanceBurger(round, round.end)!;
  assert.equal(burgerOutcome(finished, 'guest'), 'win');
  assert.equal(burgerOutcome(finished, 'host'), 'loss');
  assert.equal(burgerOutcome(finished, 'guest2'), 'loss');
});

test('late-game customer requests keep one patty, a seven-layer limit, and independent expiry', () => {
  let round = advanceBurger(initial(), opening + 250)!;
  round.counters.host!.served = 12;
  round.counters.host!.combo = 3;
  while (round.counters.host!.orders.length < 4) round = advanceBurger(round, nextBurgerAt(round)!)!;
  const orders = round.counters.host!.orders;
  assert(orders.slice(1).every(order => order.layers.length === 7 && order.layers.some(layer => layer.cooked)
    && order.layers.every(layer => order.layers.filter(other => other.ingredient === layer.ingredient).length <= 2)));
  const expires = Math.min(...orders.map(order => order.until));
  while (nextBurgerAt(round)! <= expires) round = advanceBurger(round, nextBurgerAt(round)!)!;
  assert(round.counters.host!.orders.every(order => order.until > expires));
  assert.equal(round.counters.host!.combo, 0);
});
