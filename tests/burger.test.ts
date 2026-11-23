import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitBurgerPixels, orderBubbleSize } from '../apps/web/src/games/burger/layout.ts';
import { seatDiner, shiftDiner } from '../apps/web/src/games/burger/dining.ts';
import { chooseBurgerDialogue } from '../apps/web/src/games/burger/dialogue.ts';
import { cardModifiers, cardOffers } from '../apps/web/src/games/burger/cards.ts';
import { burgerPressure, endlessOrderReward, endlessReserveMs } from '../apps/web/src/games/burger/balance.ts';
import {
  advanceBurger, applyBurgerAction, burgerCounter, burgerDeadline, burgerEndlessOpeningMs, burgerLevel, burgerOutcome, burgerPreparationMs, burgerResigned, burgerSupplyUnlocked,
  createBurgerRound as createCardRound, cupAmount, cupSize, grillCount,
  burgerStorageSize, judgeOrder, nextBurgerAt, pattyAt, pattyDoneness, pattyFaces, pattyFrame, readBurgerRound, resignBurger, shiftBurgerClock, startBurgerRound,
} from '../apps/web/src/games/burger/rules.ts';
import type { BurgerAction, BurgerRound, Order } from '../apps/web/src/games/burger/rules.ts';
import { defaultMatchSettings } from '../apps/web/src/games/match-settings.ts';
import { blankMatch, lobbyMatch, matchOutcome, onlineMatchReport, readMatchSnapshot } from '../apps/web/src/network/room-match.ts';
import { readReport } from '../packages/protocol/profile.ts';

const opening = 100_000;
const firstGuest = opening + burgerPreparationMs;
function createBurgerRound(...args: Parameters<typeof createCardRound>) {
  const round = createCardRound(...args);
  delete round.difficulty;
  for (const counter of Object.values(round.counters)) { delete counter!.cards; counter!.money = 0; }
  return round;
}
const initial = (players: BurgerRound['players'] = ['host']) =>
  startBurgerRound(createBurgerRound(5, players, 17), opening);

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
    assert.equal(burgerOnly.stripWidth, layers * 12);
    for (const { width, height, burger, stack } of [burgerOnly, withDrink]) {
      assert(width >= burger + 12);
      assert(height >= burger + stack + 23);
    }
    assert(withDrink.width >= withDrink.burger + 36);
    assert(withDrink.width <= 96 && burgerOnly.width <= 96 && withDrink.height >= 55);
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

test('the twenty-second opening allows only starter supplies and the first recipes stay simple', () => {
  let round = initial(['host', 'guest']);
  const early = opening + 100;
  assert.equal(nextBurgerAt(round), firstGuest);
  assert.equal(advanceBurger(round, firstGuest - 1), undefined);
  assert.equal(applyBurgerAction(round, 'host', { type: 'grill', slot: 1, kind: 'chicken' }, early), undefined);
  assert.equal(applyBurgerAction(round, 'host', { type: 'pour', drink: 0 }, early), undefined);
  round = action(round, { type: 'grill', slot: 0, kind: 'beef' }, early);
  round = action(round, { type: 'add', slot: 0, item: 'paper' }, early);
  assert.equal(applyBurgerAction(round, 'host', { type: 'add', slot: 0, item: 'rice' }, early), undefined);
  round = action(round, { type: 'add', slot: 0, item: 'bun' }, early);
  assert.equal(applyBurgerAction(round, 'host', { type: 'add', slot: 0, item: 'cheese' }, early), undefined);
  assert.equal(round.counters.host!.orders.length, 0);
  round = advanceBurger(round, firstGuest)!;
  round = advanceBurger(round, nextBurgerAt(round)!)!;
  for (const order of round.counters.host!.orders) {
    assert.equal(order.bread, 'bun');
    assert.equal(order.layers.length, 1);
    assert.equal(order.layers[0].ingredient, 'beef');
    assert.equal(order.drink, undefined);
    assert(order.until - order.at >= 129_000);
  }
  assert.equal(round.counters.host!.orders[0].layers[0].cooked, 'medium');
  assert.equal(round.counters.host!.orders[1].at - round.counters.host!.orders[0].at, 24_000);
});

test('every four served orders unlock only the next menu, and fresh orders use those supplies', () => {
  const unlocks = [
    ['bun', 'beef'], ['cheese'], ['lettuce', 'cola'], ['onion', 'pickle'],
    ['chicken', 'rice'], ['tomato', 'soda'], ['egg'], ['bacon'],
  ] as const;
  for (const [index, supplies] of unlocks.entries()) {
    const served = index * 4;
    assert.equal(burgerLevel(served), index + 1);
    assert.equal(burgerLevel(served + 3), index + 1);
    for (const supply of supplies) {
      assert(burgerSupplyUnlocked(supply, served));
      if (served) assert(!burgerSupplyUnlocked(supply, served - 1));
    }
    for (let seed = 0; seed < 25; seed++) {
      const round = startBurgerRound(createBurgerRound(3, ['host'], seed), opening);
      round.counters.host!.served = served;
      const first = advanceBurger(round, firstGuest)!.counters.host!.orders[0];
      assert(burgerSupplyUnlocked(first.bread, served));
      assert(first.layers.every(layer => burgerSupplyUnlocked(layer.ingredient, served)));
      assert(!first.drink || burgerSupplyUnlocked(first.drink.kind, served));
      if (index === 1) assert.deepEqual(first.layers.map(layer => layer.ingredient), ['beef', 'cheese']);
    }
  }
});

test('patty speed varies within ten percent and survives holding, flipping, pause and room snapshots', () => {
  let round = initial(['host', 'guest']);
  const createdAt = opening + 120;
  round = action(round, { type: 'grill', kind: 'beef', slot: 0 }, createdAt);
  round = action(round, { type: 'grill', kind: 'beef', slot: 1 }, createdAt);
  const first = pattyAt(round.counters.host!, 0)!;
  const second = pattyAt(round.counters.host!, 1)!;
  assert([first, second].every(patty => patty.speed! >= 900 && patty.speed! <= 1100));
  assert.notEqual(first.speed, second.speed);
  assert.equal(pattyFaces({ ...first, speed: undefined }, createdAt + 7000)[0], 100);
  round = action(round, { type: 'flip', slot: 0 }, createdAt + 7000);
  round = action(round, { type: 'move', from: 0, to: 'beef' }, createdAt + 7600);
  round = action(round, { type: 'move', from: 'beef', to: 0 }, createdAt + 7900);
  const afterResume = readBurgerRound(JSON.parse(JSON.stringify(shiftBurgerClock(round, 3000))))!;
  const resumed = pattyAt(afterResume.counters.host!, 0)!;
  assert.equal(resumed.speed, first.speed);
  assert.deepEqual(pattyFaces(resumed, createdAt + 12_000), pattyFaces(pattyAt(round.counters.host!, 0)!, createdAt + 9000));
});

test('each tray holds eight patties; overflowing transfers are atomic and older snapshots retain the top eight', () => {
  let round = initial(['host', 'guest']);
  const now = opening + 100;
  for (let i = 0; i < 8; i++) {
    round = action(round, { type: 'grill', kind: 'beef', slot: 0 }, now + i * 2);
    round = action(round, { type: 'move', from: 0, to: 'beef' }, now + i * 2 + 1);
  }
  round = action(round, { type: 'grill', kind: 'beef', slot: 0 }, now + 20);
  assert.equal(applyBurgerAction(round, 'host', { type: 'move', from: 0, to: 'beef' }, now + 21), undefined);
  const previous = round.counters.host!.tray;
  assert.equal(previous.length, 8);
  assert(pattyAt(round.counters.host!, 0));
  round.counters.host!.tray = [{ ...previous[0], faces: [0, 0] }, ...previous];
  assert.deepEqual(readBurgerRound(round)?.counters.host?.tray, previous);
});

test('a specific tray patty keeps its cooking grade and two patties fit into a five-layer burger', () => {
  let round = initial();
  const now = opening + 100;
  const board = round.counters.host!;
  board.served = 28;
  board.tray = [70, 130, 100].map((heat, index) => ({ kind: 'beef', faces: [heat, heat], side: 0, heatAt: 0, serial: index + 1 }));
  round = action(round, { type: 'add', item: 'paper', slot: 0 }, now);
  round = action(round, { type: 'add', item: 'bun', slot: 0 }, now);
  assert.equal(applyBurgerAction(round, 'host', { type: 'stack-tray', kind: 'beef', index: 1, serial: 99, slot: 0 }, now), undefined);
  round = action(round, { type: 'stack-tray', kind: 'beef', index: 0, serial: 2, slot: 0 }, now);
  assert.equal(pattyDoneness(round.counters.host!.burgers[0].layers[0].patty!.faces), 'well');
  round = action(round, { type: 'stack-tray', kind: 'beef', index: 0, serial: 1, slot: 0 }, now);
  assert.equal(pattyDoneness(round.counters.host!.burgers[0].layers[1].patty!.faces), 'rare');
  assert.equal(applyBurgerAction(round, 'host', { type: 'stack-tray', kind: 'beef', index: 0, serial: 3, slot: 0 }, now), undefined);
  for (const item of ['lettuce', 'pickle', 'bacon'] as const) round = action(round, { type: 'add', item, slot: 0 }, now);
  assert.equal(round.counters.host!.burgers[0].layers.length, 5);
  assert.equal(applyBurgerAction(round, 'host', { type: 'add', item: 'cheese', slot: 0 }, now), undefined);
  assert.equal(round.counters.host!.tray[0].serial, 3);
});

test('endless awards time by difficulty and similarity; expired kitchens keep their sales', () => {
  for (const minutes of [3, 5, 7, 10, 15] as const) {
    const timed = startBurgerRound(createBurgerRound(minutes, ['host', 'guest'], 3), opening);
    assert.equal(readBurgerRound(timed)?.opensAt, firstGuest);
    assert.equal(readBurgerRound(timed)?.end, firstGuest + minutes * 60_000);
    const { opensAt: _, ...legacy } = timed;
    assert.equal(readBurgerRound({ ...legacy, end: opening + minutes * 60_000 })?.end, opening + minutes * 60_000);
  }
  const base = () => advanceBurger(startBurgerRound(createBurgerRound('endless', ['host', 'guest'], 3), opening), firstGuest)!;
  function deliver(served: number, accurate: boolean) {
    const round = base();
    const counter = round.counters.host!;
    counter.served = served;
    counter.service = { burger: { paper: true, bread: accurate ? 'bun' : 'rice', top: true, packed: true,
      layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], heatAt: 0, side: 0 } }],
    } };
    return action(round, { type: 'serve', order: 1 }, firstGuest + 100);
  }
  const round = deliver(0, true);
  assert.equal(round.counters.host!.feedback?.timeAdded, 25_000);
  assert.equal(deliver(28, true).counters.host!.feedback?.timeAdded, 8000);
  assert(deliver(0, false).counters.host!.feedback!.timeAdded! < 25_000);
  const guestDeadline = firstGuest + burgerEndlessOpeningMs;
  assert.equal(burgerDeadline(round, 'guest'), guestDeadline);
  const hostDeadline = burgerDeadline(round, 'host');
  assert.equal(hostDeadline, guestDeadline + 25_000);
  assert.equal(burgerDeadline(readBurgerRound(shiftBurgerClock(round, 1400))!, 'host'), hostDeadline + 1400);
  round.counters.guest!.money = 999;
  const expired = advanceBurger(round, guestDeadline)!;
  assert.equal(expired.counters.guest!.closed, true);
  assert.equal(expired.winners, undefined);
  assert.deepEqual(advanceBurger(expired, hostDeadline)?.winners, ['guest']);
});

test('the host rolls both shoo outcomes and publishes the customer and reaction for replay', () => {
  let successes = 0;
  for (let seed = 0; seed < 300; seed++) {
    const round = advanceBurger(startBurgerRound(createBurgerRound(5, ['host', 'guest'], seed), opening), firstGuest)!;
    const shooed = action(round, { type: 'shoo', order: 1 }, firstGuest + 100);
    const board = shooed.counters.host!;
    assert.equal(board.shoo?.order, 1);
    assert.equal(board.orders.length, board.shoo?.left ? 0 : 1);
    if (!board.shoo?.left) {
      const deadline = round.counters.host!.orders[0].until;
      assert.equal(board.orders[0].until, firstGuest + 100 + Math.ceil((deadline - firstGuest - 100) * .8));
    }
    assert.equal(shooed.counters.guest!.orders.length, 1);
    assert.deepEqual(readBurgerRound(shooed)?.counters.host?.shoo, board.shoo);
    assert.equal(applyBurgerAction(shooed, 'host', { type: 'shoo', order: 1 }, firstGuest + 150), undefined);
    if (board.shoo?.left) successes++;
  }
  assert(successes > 125 && successes < 175);
});

test('discarding from the picker targets only the requested patty, even when its index has shifted', () => {
  const round = initial();
  round.counters.host!.tray = [5, 6, 7].map(serial => ({ kind: 'beef', side: 0, heatAt: 0, faces: [70, 70], serial }));
  const next = action(round, { type: 'discard-tray', kind: 'beef', index: 0, serial: 6 }, opening + 100);
  assert.deepEqual(next.counters.host!.tray.map(patty => patty.serial), [5, 7]);
  assert.equal(applyBurgerAction(next, 'host', { type: 'discard-tray', kind: 'beef', index: 0, serial: 6 }, opening + 101), undefined);
});

test('conditional dialogue can consume a free meal without filling the order or award a one-point thank-you', () => {
  const ready = { paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', patty: { kind: 'beef', side: 0, heatAt: 0, faces: [100, 100] }, source: 0 }],
  } satisfies Parameters<typeof judgeOrder>[1];
  let free = false, thanked = false;
  for (let seed = 0; seed < 100 && (!free || !thanked); seed++) {
    const round = advanceBurger(startBurgerRound(createBurgerRound(5, ['host', 'guest'], seed), opening), firstGuest)!;
    round.counters.host!.service = { burger: { ...ready, bread: 'rice' } };
    const retry = action(round, { type: 'serve', order: 1 }, firstGuest + 100);
    const board = retry.counters.host!;
    if (board.feedback?.line === 'free') {
      free = true;
      assert.equal(board.money, 0);
      assert.equal(board.service, undefined);
      assert.equal(board.served, 0);
      assert.deepEqual(board.orders, round.counters.host!.orders);
      assert.equal(board.diners, undefined);
      assert.equal(readBurgerRound(retry)?.counters.host?.feedback?.line, 'free');
    }
    round.counters.host!.service = { burger: ready, drink: { kind: 'cola', amount: 100 } };
    const delivered = action(round, { type: 'serve', order: 1 }, firstGuest + 100).counters.host!;
    if (delivered.diners?.[0].line === 'thanks') {
      thanked = true;
      assert.equal(delivered.money, 156);
      assert.equal(delivered.feedback?.tip, 1);
      assert.equal(delivered.served, 1);
    }
  }
  assert(free && thanked);
  const order: Order = { id: 1, guest: 0, at: 0, until: 100, price: 155, bread: 'bun',
    layers: [{ ingredient: 'beef', cooked: 'rare' }] };
  const lines = chooseBurgerDialogue(order, ready, undefined, 1, ['well'], .4, 0);
  assert.deepEqual(lines, { line: 'burnt', thought: 'crispy' });
});

test('four co-op players share one kitchen, and stale inputs cannot flip a patty twice', () => {
  const roster: BurgerRound['players'] = ['host', 'guest', 'guest2', 'guest3'];
  let round = startBurgerRound(createBurgerRound(5, roster, 17, 'coop'), opening);
  assert.deepEqual(Object.keys(round.counters), ['host']);
  function perform(actor: BurgerRound['players'][number], move: BurgerAction, now: number) {
    const next = applyBurgerAction(round, actor, move, now);
    assert(next);
    round = next;
  }
  perform('host', { type: 'grill', slot: 0, kind: 'beef' }, opening + 100);
  const { serial } = burgerCounter(round, 'guest3').grill[0]!;
  const flip = { type: 'flip', slot: 0, side: 0, serial } as const;
  perform('guest', flip, opening + 7100);
  assert.equal(applyBurgerAction(round, 'guest2', flip, opening + 7100), undefined);
  perform('guest2', { type: 'hold', slot: 0, serial }, opening + 14_100);
  perform('guest3', { type: 'add', slot: 0, item: 'paper' }, opening + 14_150);
  perform('host', { type: 'add', slot: 0, item: 'bun' }, opening + 14_180);
  perform('guest', { type: 'stack-tray', slot: 0, kind: 'beef', index: 0, serial }, opening + 14_200);
  perform('guest2', { type: 'add', slot: 0, item: 'bun' }, opening + 14_240);
  perform('guest3', { type: 'wrap', slot: 0 }, opening + 14_280);
  perform('host', { type: 'stage-burger', slot: 0 }, opening + 14_310);
  perform('guest', { type: 'serve', order: 1 }, firstGuest);
  assert(roster.every(role => burgerCounter(round, role).money === 233));
  assert.equal(applyBurgerAction(round, 'guest2', { type: 'serve', order: 1 }, firstGuest + 1), undefined);

  round = resignBurger(round, 'guest2')!;
  assert.equal(round.winners, undefined);
  assert(burgerResigned(round, 'guest2'));
  assert.equal(applyBurgerAction(round, 'guest2', { type: 'grill', slot: 1, kind: 'beef' }, firstGuest + 2), undefined);
  assert.equal(shiftBurgerClock(round, 900).counters.host?.next, round.counters.host!.next + 900);
  const finished = advanceBurger(round, round.end)!;
  const lobby = lobbyMatch('burger', { ...defaultMatchSettings, burgerMode: 'coop' });
  const snapshot = { ...lobby, type: 'snapshot', startedAt: opening, finishedAt: finished.end, burger: finished };
  assert.equal(readMatchSnapshot({ ...snapshot, burgerMode: 'race' }, blankMatch, finished.end), undefined);
  const recovered = readMatchSnapshot(snapshot, blankMatch, finished.end)!;
  assert.deepEqual(recovered.burger?.winners, []);
  assert.equal(matchOutcome(recovered, 'host'), undefined);
  assert.equal(onlineMatchReport(recovered, 'guest2'), undefined);
  const report = onlineMatchReport(recovered, 'guest3');
  assert.deepEqual(report, { id: lobby.id, game: 'burger', mode: 'coop', outcome: 'score', seconds: 300 + burgerPreparationMs / 1000, score: 233 });
  assert.deepEqual(readReport(report), report);
  assert.equal(readReport({ ...report, game: 'omok' }), undefined);
  assert.equal(readReport({ ...report, score: -1 }), undefined);
  assert.equal(readReport({ ...report, outcome: 'win' }), undefined);
});

test('endless co-op extends and closes a shared timer once for the whole kitchen', () => {
  let round = startBurgerRound(createBurgerRound('endless', ['host', 'guest'], 3, 'coop'), opening);
  round = advanceBurger(round, firstGuest)!;
  burgerCounter(round, 'host').service = { burger: { paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', heatAt: 0, side: 0, faces: [100, 100] } }],
  } };
  round = applyBurgerAction(round, 'guest', { type: 'serve', order: 1 }, firstGuest + 5)!;
  const end = firstGuest + burgerEndlessOpeningMs + 25_000;
  assert.equal(burgerDeadline(round, 'host'), end);
  assert.equal(burgerDeadline(round, 'guest'), end);
  assert.deepEqual(readBurgerRound(advanceBurger(round, end))?.winners, []);
});

test('grill heat follows both faces independently and tray and burger moves preserve the patty', () => {
  let round = initial();
  const tap = (input: BurgerAction, age: number) => { round = action(round, input, opening + age); };
  assert.equal(round.counters.host!.grill.length, grillCount);
  assert.equal(grillCount, 8);
  tap({ type: 'grill', kind: 'beef', slot: 0 }, 500);
  const targetHeat = round.counters.host!.grill[0]!.speed! / 10;
  tap({ type: 'flip', slot: 0 }, 7500);
  assert.deepEqual(pattyFaces(round.counters.host!.grill[0]!, opening + 14_500), [targetHeat, targetHeat]);
  assert.equal(applyBurgerAction(round, 'host', { type: 'hold', slot: 0 }, opening + 10_500), undefined);
  tap({ type: 'hold', slot: 0 }, 14_500);
  tap({ type: 'add', item: 'paper', slot: 1 }, 15_200);
  tap({ type: 'add', item: 'bun', slot: 1 }, 15_250);
  tap({ type: 'stack', from: 'tray', slot: 1 }, 15_300);
  assert.equal(round.counters.host!.tray.length, 0);
  tap({ type: 'pop', slot: 1 }, 15_400);
  assert.deepEqual(round.counters.host!.tray[0].faces, [targetHeat, targetHeat]);
  tap({ type: 'stack', from: 'tray', slot: 1 }, 15_500);
  tap({ type: 'add', item: 'bun', slot: 1 }, 15_600);
  tap({ type: 'wrap', slot: 1 }, 15_700);
  assert.equal(applyBurgerAction(round, 'host', { type: 'pop', slot: 1 }, opening + 15_800), undefined);
  tap({ type: 'stage-burger', slot: 1 }, 15_900);
  tap({ type: 'serve', order: 1 }, 21_000);
  assert.equal(round.counters.host!.money, 233);
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
  let round = initial(['host', 'guest']);
  round.counters.host!.served = 20;
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
  let round = initial();
  round.counters.host!.served = 16;
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
  let round = advanceBurger(initial(['host', 'guest']), firstGuest)!;
  const ready = {
    paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }],
  } satisfies NonNullable<BurgerRound['counters']['host']>['burgers'][0];
  for (let index = 0; index < burgerStorageSize; index++) {
    round.counters.host!.burgers[0] = ready;
    round = action(round, { type: 'store-burger', slot: 0, index }, firstGuest + 400);
  }
  assert.equal(round.counters.host!.storage?.length, 8);
  round.counters.host!.burgers[1] = ready;
  assert.equal(applyBurgerAction(round, 'host', { type: 'store-burger', slot: 1, index: 0 }, firstGuest + 500), undefined);
  assert.equal(applyBurgerAction(round, 'host', { type: 'store-burger', slot: 1, index: 8 }, firstGuest + 500), undefined);
  const snapshot = JSON.parse(JSON.stringify(round));
  assert.deepEqual(readBurgerRound(snapshot)?.counters.host?.storage, snapshot.counters.host.storage);
  round = action(round, { type: 'stage-stored', index: 7 }, firstGuest + 500);
  assert.equal(round.counters.host!.storage?.[7], null);
  assert.equal(applyBurgerAction(round, 'host', { type: 'stage-stored', index: 6 }, firstGuest + 500), undefined);
  round = action(round, { type: 'discard-stored', index: 6 }, firstGuest + 500);
  assert.equal(round.counters.host!.storage?.[6], null);
  round = action(round, { type: 'serve', order: 1 }, firstGuest + 600);
  assert.equal(round.counters.host!.money, 233);
  assert.equal(round.counters.host!.storage?.filter(Boolean).length, 6);
});

test('co-op storage moves and swaps atomically and service returns to its reserved origin', () => {
  let round = advanceBurger(startBurgerRound(createBurgerRound(5, ['host', 'guest'], 17, 'coop'), opening), firstGuest)!;
  const now = firstGuest + 300;
  const kitchen = () => round.counters.host!;
  const burger = (serial: number): ReturnType<typeof kitchen>['burgers'][0] => ({
    paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0, serial } }],
  });
  const move = (input: BurgerAction, actor: 'host' | 'guest' = 'guest') => {
    const next = applyBurgerAction(round, actor, input, now);
    assert.ok(next);
    round = next;
  };
  const a = burger(1), b = burger(2);
  kitchen().pattySequence = 2;
  kitchen().burgers = [a, b];
  move({ type: 'store-burger', slot: 0, index: 0 }, 'host');
  move({ type: 'store-burger', slot: 1, index: 1 });
  move({ type: 'shift-stored', from: 0, to: 1, serial: 1 });
  assert.deepEqual(kitchen().storage?.slice(0, 2), [b, a]);
  move({ type: 'shift-stored', from: 1, to: 7, serial: 1 });
  assert.equal(kitchen().storage?.[1], null);
  assert.equal(applyBurgerAction(round, 'host', { type: 'shift-stored', from: 0, to: 7, serial: 1 }, now), undefined);
  move({ type: 'stage-stored', index: 7, serial: 1 });
  assert.deepEqual(kitchen().service?.origin, { area: 'storage', index: 7 });
  assert.equal(applyBurgerAction(round, 'host', { type: 'shift-stored', from: 0, to: 7, serial: 2 }, now), undefined);
  round = readBurgerRound(JSON.parse(JSON.stringify(round)))!;
  assert.ok(round);
  move({ type: 'return-burger', to: 'origin', serial: 1 }, 'host');
  assert.deepEqual(kitchen().storage?.[7], a);
  assert.equal(kitchen().service?.burger, undefined);

  kitchen().burgers[1] = burger(3);
  kitchen().pattySequence = 3;
  move({ type: 'stage-burger', slot: 1 });
  assert.equal(applyBurgerAction(round, 'host', { type: 'add', slot: 1, item: 'paper' }, now), undefined);
  move({ type: 'add', slot: 0, item: 'paper' }, 'host');
  move({ type: 'return-burger', to: 'origin', serial: 3 });
  assert.deepEqual(kitchen().burgers[1], burger(3));
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
  assert.deepEqual(judgeOrder(meal, burger, meal.drink), { money: 305, perfect: true, satisfaction: 'love', tip: 153, similarity: 1 });
  const cookedDifferently = { ...burger, layers: burger.layers.map(layer => layer.patty
    ? { ...layer, patty: { ...layer.patty, faces: [70, 70] as [number, number] } } : layer) };
  const exactRecipe = judgeOrder(meal, cookedDifferently, meal.drink);
  assert.equal(exactRecipe.money, 305);
  assert.equal(exactRecipe.perfect, true);
  assert.equal(exactRecipe.tip, 0);
  const wrong = judgeOrder(meal, { ...burger, layers: [...burger.layers].reverse() }, { kind: 'cola', size: 'small' });
  assert(!wrong.perfect);
  assert(wrong.money > 0 && wrong.money < 110);
  const withoutDrink = judgeOrder(meal, burger);
  assert.equal(withoutDrink.money, 220);
  assert.equal(withoutDrink.perfect, false);
  assert.equal(withoutDrink.satisfaction, 'content');
  assert.equal(withoutDrink.tip, 0);
});

test('dining satisfaction distinguishes five levels using ingredient accuracy', () => {
  const wanted = ['beef', 'cheese', 'lettuce', 'pickle', 'tomato', 'egg', 'bacon'] as const;
  const layers: Order['layers'] = wanted.map(ingredient => ({ ingredient }));
  const order: Order = { id: 1, guest: 0, at: 0, until: 1000, bread: 'bun', layers, price: 240 };
  const ratings = [0, 1, 2, 3, 5].map(missing => judgeOrder(order, {
    bread: 'bun', top: true, packed: true, paper: true,
    layers: wanted.map((ingredient, index) => ({ ingredient: index < missing ? 'onion' : ingredient })),
  }).satisfaction);
  assert.deepEqual(ratings, ['love', 'delighted', 'content', 'puzzled', 'disappointed']);
});

test('each fifth perfect order resets the fever timer to twenty seconds', () => {
  let round = advanceBurger(initial(['host', 'guest']), firstGuest)!;
  const board = round.counters.host!;
  const ready = {
    ...board.burgers[0], paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }],
  } satisfies typeof board.burgers[0];
  const first = board.orders[0];
  Object.assign(board, { combo: 4, served: 4, best: 4, service: { burger: ready } });
  round = action(round, { type: 'serve', order: 1 }, firstGuest + 1000);
  assert.equal(round.counters.host!.feverUntil, firstGuest + 21_000);
  assert.equal(round.counters.host!.feverTrigger, 5);
  assert.equal(round.counters.host!.money, 233);
  Object.assign(round.counters.host!, { combo: 9, served: 9, best: 9, sequence: 2, orders: [{ ...first, id: 2 }], service: { burger: ready } });
  round = action(round, { type: 'serve', order: 2 }, firstGuest + 2500);
  assert.equal(round.counters.host!.money, 621);
  assert.equal(round.counters.host!.feverUntil, firstGuest + 22_500);
  assert.equal(round.counters.host!.feverTrigger, 10);
  const restored = readBurgerRound(JSON.parse(JSON.stringify(round)));
  assert.ok(restored);
  const resumed = shiftBurgerClock(restored, 1500).counters.host!;
  assert.equal(resumed.feverUntil, firstGuest + 24_000);
  assert.equal(resumed.feverTrigger, 10);
});

test('the service tray moves food without paying and only submits to the guest at the front', () => {
  let round = advanceBurger(initial(['host', 'guest']), firstGuest)!;
  round = advanceBurger(round, nextBurgerAt(round)!)!;
  const board = round.counters.host!;
  const now = board.orders[1].at + 1;
  const ready = {
    ...board.burgers[0], paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }],
  } satisfies typeof board.burgers[0];
  board.burgers[0] = ready;
  board.served = 8;
  board.cups[0] = { amount: 70, pourAt: now - 600 };
  assert.equal(applyBurgerAction(round, 'host', { type: 'serve', order: 1 }, now), undefined);
  round = action(round, { type: 'stage-burger', slot: 0 }, now);
  round = action(round, { type: 'stage-drink', drink: 0 }, now);
  assert.equal(round.counters.host!.burgers[0].paper, false);
  assert.equal(round.counters.host!.money, 0);
  assert.deepEqual(round.counters.host!.service, { burger: ready, origin: { area: 'assembly', index: 0 }, drink: { kind: 'cola', amount: 100 } });
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
  assert.equal(round.counters.host!.money, 233);
  assert.equal(round.counters.host!.orders[0].id, 2);
  assert.equal(round.counters.host!.service, undefined);
  assert.equal(round.counters.host!.diners?.[0].id, 1);
  assert.equal(round.counters.host!.diners?.[0].satisfaction, 'love');
  const served = JSON.parse(JSON.stringify(round));
  assert.deepEqual(readBurgerRound(served)?.counters.host?.diners, served.counters.host.diners);
  const exitAt = round.counters.host!.diners![0].exitAt;
  while (nextBurgerAt(round)! <= exitAt) round = advanceBurger(round, nextBurgerAt(round)!)!;
  assert.deepEqual(round.counters.host!.diners, []);
});

test('four counters resume from the same snapshot and rank by sales at closing', () => {
  const seats = ['host', 'guest', 'guest2', 'guest3'] satisfies BurgerRound['players'];
  let round = initial(seats);
  round.counters.host!.served = 8;
  round = action(round, { type: 'grill', kind: 'beef', slot: 0 }, opening + 500);
  round = action(round, { type: 'pour', drink: 0 }, opening + 600);
  const shifted = shiftBurgerClock(round, 5000);
  assert.equal(shifted.counters.host!.next, round.counters.host!.next + 5000);
  assert.deepEqual(pattyFaces(shifted.counters.host!.grill[0]!, opening + 8000),
    pattyFaces(round.counters.host!.grill[0]!, opening + 3000));
  const snapshot = JSON.parse(JSON.stringify(shifted));
  assert.deepEqual(JSON.parse(JSON.stringify(readBurgerRound(snapshot))), snapshot);
  assert.equal(readBurgerRound({ ...shifted, end: shifted.end + 100 }), undefined);
  const firstOrders = advanceBurger(shifted, firstGuest + 5000)!;
  assert.deepEqual(firstOrders.counters.guest!.orders, firstOrders.counters.guest3!.orders);
  round = resignBurger(round, 'guest2')!;
  round.counters.host!.money = 100;
  round.counters.guest!.money = 140;
  round.counters.guest2!.money = 250;
  const finished = advanceBurger(round, round.end)!;
  assert.equal(burgerOutcome(finished, 'guest'), 'win');
  assert.equal(burgerOutcome(finished, 'host'), 'loss');
  assert.equal(burgerOutcome(finished, 'guest2'), 'loss');
});

test('late-game orders contain at least one patty, at most five layers and independent expiry', () => {
  let round = advanceBurger(initial(), firstGuest)!;
  round.counters.host!.served = 28;
  round.counters.host!.combo = 3;
  while (round.counters.host!.orders.length < 4) round = advanceBurger(round, nextBurgerAt(round)!)!;
  const orders = round.counters.host!.orders;
  assert(orders.slice(1).every(order => order.layers.length === 5
    && order.layers.filter(layer => layer.cooked).length <= 2 && order.layers.some(layer => layer.cooked)
    && order.layers.every(layer => order.layers.filter(other => other.ingredient === layer.ingredient).length <= 2)));
  const expires = Math.min(...orders.map(order => order.until));
  while (nextBurgerAt(round)! <= expires) round = advanceBurger(round, nextBurgerAt(round)!)!;
  assert(round.counters.host!.orders.every(order => order.until > expires));
  assert.equal(round.counters.host!.combo, 0);
});

test('card choice freezes a shared kitchen, survives reconnection and only one choice commits', () => {
  let round = startBurgerRound(createCardRound(5, ['host', 'guest'], 7, 'coop'), opening);
  const now = firstGuest + 100;
  const board = () => burgerCounter(round, 'host');
  assert.equal(board().money, 100);
  assert.equal(applyBurgerAction(round, 'guest', { type: 'grill', kind: 'beef', slot: 4 }, opening + 10), undefined);
  assert.equal(applyBurgerAction(round, 'guest', { type: 'add', item: 'paper', slot: 1 }, opening + 10), undefined);
  round = action(round, { type: 'grill', kind: 'beef', slot: 0 }, firstGuest - 1000);
  assert.equal(board().money, 90);
  round = advanceBurger(round, firstGuest)!;
  board().served = 3;
  board().service = { burger: { paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }] } };
  round = action(round, { type: 'serve', order: 1 }, now);
  const draft = board().draft!;
  assert.equal(draft.at, now);
  assert.equal(new Set(draft.offers).size, 3);
  assert.equal(nextBurgerAt(round), undefined);
  assert.equal(applyBurgerAction(round, 'guest', { type: 'flip', slot: 0 }, now + 2000), undefined);
  const oldEnd = round.end;
  const oldSalesStart = board().salesStartedAt!;
  const oldHeat = board().grill[0]!.heatAt;
  round = readBurgerRound(JSON.parse(JSON.stringify(round)))!;
  assert.ok(round);
  assert.equal(applyBurgerAction(round, 'host', { type: 'choose-card', card: draft.offers[0], level: 1 }, now + 5000), undefined);
  round = applyBurgerAction(round, 'guest', { type: 'choose-card', card: draft.offers[0], level: 2 }, now + 5000)!;
  assert.deepEqual(board().cards, [draft.offers[0]]);
  assert.equal(board().draft, undefined);
  assert.equal(round.end, oldEnd + 5000);
  assert.equal(board().salesStartedAt, oldSalesStart + 5000);
  assert.equal(board().grill[0]!.heatAt, oldHeat + 5000);
  assert.ok(readBurgerRound(JSON.parse(JSON.stringify(round))));
  assert.equal(applyBurgerAction(round, 'host', { type: 'choose-card', card: draft.offers[1], level: 2 }, now + 5001), undefined);
});

test('drafting sold-out stock rerolls waiting orders and another kitchen keeps its own clock', () => {
  let round = startBurgerRound(createCardRound(5, ['host', 'guest'], 9), opening);
  round = advanceBurger(round, firstGuest)!;
  const host = round.counters.host!;
  host.served = 8;
  host.cards = ['unlock:cheese'];
  host.draft = { at: firstGuest, offers: ['sold:cheese', 'broom', 'patient'] };
  host.orders[0].layers.push({ ingredient: 'cheese' });
  const until = host.orders[0].until;
  const next = firstGuest + 16_000;
  assert.equal(nextBurgerAt(round), next);
  round = advanceBurger(round, next)!;
  assert.equal(round.counters.guest!.orders.length, 2);
  assert.equal(round.counters.host!.orders.length, 1);
  round = action(round, { type: 'choose-card', card: 'sold:cheese', level: 3 }, next + 1);
  const replacement = round.counters.host!.orders[0];
  assert(!burgerSupplyUnlocked('cheese', round.counters.host!));
  assert(!replacement.layers.some(layer => layer.ingredient === 'cheese'));
  assert.equal(replacement.until, until + next + 1 - firstGuest);
  assert.equal(replacement.reorderedAt, next + 1);
  assert.equal(round.counters.guest!.playUntil, firstGuest + 300_000);
});

function grillUpgradeDraft() {
  let round = startBurgerRound(createCardRound(5, ['host', 'guest'], 11, 'coop'), opening);
  round = action(round, { type: 'grill', kind: 'beef', slot: 0 }, firstGuest - 4900);
  round = advanceBurger(round, firstGuest)!;
  const board = round.counters.host!;
  board.grill[0]!.speed = 1000;
  board.served = 4;
  board.draft = { at: firstGuest, offers: ['highHeat', 'autoGrill', 'griddle'] };
  return round;
}

test('a shared kitchen spends at most three rerolls across drafts and reconnects', () => {
  let round = grillUpgradeDraft();
  const firstDraft = round.counters.host!.draft!;
  const reroll = { type: 'reroll-cards', level: 2, rerollsUsed: 0 } as const;
  round = applyBurgerAction(round, 'guest', reroll, firstGuest + 1200)!;
  let board = round.counters.host!;
  assert.equal(board.rerollsUsed, 1);
  assert.equal(board.draft!.at, firstDraft.at);
  assert.equal(new Set(board.draft!.offers).size, 3);
  assert(board.draft!.offers.every(card => !firstDraft.offers.includes(card)));
  assert.equal(applyBurgerAction(round, 'host', reroll, firstGuest + 1300), undefined);
  const card = board.draft!.offers[0];
  assert.equal(applyBurgerAction(round, 'host', { type: 'choose-card', level: 2, card, rerollsUsed: 0 }, firstGuest + 1300), undefined);
  assert.equal(round.end, firstGuest + 300_000);

  const restored = readBurgerRound(JSON.parse(JSON.stringify(shiftBurgerClock(round, 2000))))!;
  assert.equal(restored.counters.host!.rerollsUsed, 1);
  assert.deepEqual(restored.counters.host!.draft!.offers, board.draft!.offers);
  round = action(restored, { type: 'choose-card', level: 2, card, rerollsUsed: 1 }, firstGuest + 5000);
  assert.equal(round.end, firstGuest + 305_000);
  assert.equal(round.counters.host!.rerollsUsed, 1);
  board = round.counters.host!;
  board.served = 8;
  board.draft = { at: firstGuest + 5100, offers: cardOffers(board.cards!, 3, index => index / 3) };
  assert.equal(applyBurgerAction(round, 'guest', { ...reroll, rerollsUsed: 1 }, firstGuest + 6200), undefined);
  round = action(round, { ...reroll, level: 3, rerollsUsed: 1 }, firstGuest + 6200);
  round = action(round, { ...reroll, level: 3, rerollsUsed: 2 }, firstGuest + 7300);
  assert.equal(round.counters.host!.rerollsUsed, 3);
  assert.equal(applyBurgerAction(round, 'guest', { ...reroll, level: 3, rerollsUsed: 3 }, firstGuest + 8400), undefined);
  assert(readBurgerRound(JSON.parse(JSON.stringify(round))));
  const invalid = structuredClone(round);
  invalid.counters.host!.rerollsUsed = 4;
  assert.equal(readBurgerRound(invalid), undefined);
  assert.equal(createCardRound(5, ['host', 'guest']).counters.host!.rerollsUsed ?? 0, 0);
});

test('high heat applies the 30% increase from selection and preserves earlier cooking', () => {
  let round = grillUpgradeDraft();
  const selectedAt = firstGuest + 5000;
  round = applyBurgerAction(round, 'guest', { type: 'choose-card', card: 'highHeat', level: 2 }, selectedAt)!;
  const board = round.counters.host!;
  assert.deepEqual(board.cards, ['highHeat']);
  assert.deepEqual(pattyFaces(board.grill[0]!, selectedAt, board), [70, 0]);
  const cookAt = selectedAt + 3500;
  assert.deepEqual(pattyFaces(board.grill[0]!, cookAt, board), [135, 0]);
  round = action(round, { type: 'flip', slot: 0, side: 0 }, cookAt);
  round = action(round, { type: 'hold', slot: 0 }, cookAt + 3500);
  assert.deepEqual(round.counters.host!.tray[0].faces, [135, 65]);
  assert(readBurgerRound(JSON.parse(JSON.stringify(round))));

  const invalid = structuredClone(round);
  invalid.counters.host!.served = 8;
  invalid.counters.host!.cards!.push('autoGrill');
  assert.equal(readBurgerRound(invalid), undefined);
});

test('automatic grilling flips a hot side on the shared kitchen clock and does not bounce between hot sides', () => {
  let round = grillUpgradeDraft();
  round = applyBurgerAction(round, 'guest', { type: 'choose-card', card: 'autoGrill', level: 2 }, firstGuest)!;
  const nextGuestAt = round.counters.host!.next;
  const flipAt = firstGuest + 7700;
  assert.equal(nextBurgerAt(round), flipAt);
  assert.equal(advanceBurger(round, flipAt - 1), undefined);
  const shifted = shiftBurgerClock(round, 5000);
  assert.equal(nextBurgerAt(shifted), flipAt + 5000);
  round = advanceBurger(round, flipAt + 1400)!;
  const patty = round.counters.host!.grill[0]!;
  assert.equal(patty.heatAt, flipAt);
  assert.equal(patty.side, 1);
  assert.deepEqual(pattyFaces(patty, flipAt + 1400), [180, 20]);
  assert.equal(nextBurgerAt(round), nextGuestAt);
  round = advanceBurger(round, flipAt + 15_000)!;
  assert.equal(round.counters.host!.grill[0]!.side, 1);
  assert.deepEqual(pattyFaces(round.counters.host!.grill[0]!, flipAt + 15_000), [180, 200]);
  assert(readBurgerRound(JSON.parse(JSON.stringify(round))));
});

test('new kitchens charge for taking and discarding patties and eliminate a bankrupt kitchen', () => {
  let round = startBurgerRound(createCardRound(5, ['host', 'guest'], 11), opening);
  round = action(round, { type: 'grill', kind: 'beef', slot: 0 }, opening + 1);
  round = action(round, { type: 'move', from: 0, to: 'trash' }, opening + 2);
  assert.equal(round.counters.host!.money, 80);
  round = advanceBurger(round, firstGuest)!;
  const board = round.counters.host!;
  board.money = 50;
  const now = board.orders[0].until;
  round = advanceBurger(round, now)!;
  assert.equal(round.counters.host!.money, 0);
  assert.equal(round.counters.host!.bankrupt, true);
  assert.deepEqual(round.winners, ['guest']);
});

test('card effects stack with caps and eligible supplies return after a sellout', () => {
  const cards = ['unlock:cheese', 'sold:cheese', 'picky', 'picky', 'table', 'table', 'advertise', 'rush'] as const;
  assert.deepEqual(cardModifiers(cards), { revenue: 1.9, patience: .9, traffic: 1.3, layers: 2 });
  const offered = new Set(Array.from({ length: 100 }, (_, index) => cardOffers(cards, 3, () => index / 100)).flat());
  assert(offered.has('unlock:cheese'));
  assert(offered.has('sold:cheese'));
  assert(offered.has('highHeat') && offered.has('autoGrill'));
  assert(!offered.has('picky'));
  assert(!offered.has('unlock:chicken'));
  for (const upgrade of ['highHeat', 'autoGrill'] as const) {
    const remaining = new Set(Array.from({ length: 100 }, (_, index) => cardOffers([upgrade], 3, () => index / 100)).flat());
    assert(!remaining.has('highHeat') && !remaining.has('autoGrill'));
    assert(remaining.has('griddle'));
  }
});

test('new games scale guest pressure and retain the selected difficulty through room snapshots', () => {
  const sceneSettings = { ...defaultMatchSettings, burger: 15 as const };
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const round = startBurgerRound(createCardRound(15, ['host', 'guest'], 4, 'race', difficulty), opening);
    const first = advanceBurger(round, firstGuest)!;
    const pressure = { easy: .7, normal: 1, hard: 1.3 }[difficulty];
    assert.equal(nextBurgerAt(first), firstGuest + Math.round(16_000 / pressure));
    const firstOrder = first.counters.host!.orders[0];
    const baselinePatience = (firstOrder.until - firstOrder.at) * pressure;
    assert(baselinePatience >= 128_998 && baselinePatience <= 139_051);
    const lobby = lobbyMatch('burger', { ...sceneSettings, burgerDifficulty: difficulty });
    const snapshot = { ...lobby, type: 'snapshot', startedAt: opening, burger: first };
    assert.equal(readMatchSnapshot(snapshot, blankMatch, firstGuest)?.burger?.difficulty, difficulty);
    assert.equal(readMatchSnapshot({ ...snapshot, burgerDifficulty: 'turbo' }, blankMatch, firstGuest), undefined);
  }
});

test('endless builds pressure over active time and limits the reserve without forcing a cutoff', () => {
  assert.equal(burgerPressure('normal', 9 * 60_000), 1);
  assert(burgerPressure('normal', 30 * 60_000) > 1.7);
  assert.equal(endlessOrderReward(1, 1, 0, endlessReserveMs - 1500, 'normal'), 1500);
  assert(endlessOrderReward(8, .95, 31 * 60_000, 0, 'normal') < endlessOrderReward(8, .95, 20 * 60_000, 0, 'normal'));
  assert(endlessOrderReward(8, .95, 31 * 60_000, 0, 'normal') > 0);
});
