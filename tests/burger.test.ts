import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitBurgerPixels, orderBubbleSize } from '../apps/web/src/games/burger/layout.ts';
import { seatDiner, shiftDiner } from '../apps/web/src/games/burger/dining.ts';
import { chooseBurgerDialogue } from '../apps/web/src/games/burger/dialogue.ts';
import { cardModifiers, cardOffers, unlockLevels } from '../apps/web/src/games/burger/cards.ts';
import { burgerStoreRows } from '../apps/web/src/games/burger/store-status.ts';
import type { BurgerCard } from '../apps/web/src/games/burger/cards.ts';
import { burgerDifficultyAtLevel, burgerPressure, burgerRankFromXp, burgerXpToReach, endlessBonusAtLevel, endlessOrderReward, endlessReserveMs } from '../apps/web/src/games/burger/balance.ts';
import {
  advanceBurger, applyBurgerAction, burgerCounter, burgerDeadline, burgerEndlessOpeningMs, burgerLevel, burgerOutcome, burgerPreparationMs, burgerResigned, burgerSupplyUnlocked,
  burgerGrowthProgress, burgerLevelSettings, burgerOrderXp, burgerRank, createBurgerRound as createXpRound, cupAmount, cupSize, grillCount,
  burgerStorageSize, grillScrapeMs, grillSlotAvailable, isPattyNearBurn, judgeOrder, nextBurgerAt, pattyAt, pattyDoneness, pattyFaces, pattyFrame, readBurgerRound, resignBurger, shiftBurgerClock, startBurgerRound,
} from '../apps/web/src/games/burger/rules.ts';
import type { BurgerAction, BurgerRound, BurgerStack, Order } from '../apps/web/src/games/burger/rules.ts';
import { defaultMatchSettings } from '../apps/web/src/games/match-settings.ts';
import { blankMatch, inRound, lobbyMatch, matchOutcome, onlineMatchReport, readMatchSnapshot, reconcileLobbySeats, roundSeats, sharesTouchSurface } from '../apps/web/src/network/room-match.ts';
import { roomRoles } from '../packages/protocol/rooms.ts';
import { addRoomTeam, fillRoomTeams, moveRoomTeamMember, readRoomTeams, removeRoomTeam, teamFor, validTeamLineup } from '../packages/protocol/room-teams.ts';
import { readRoomResult } from '../packages/protocol/room-history.ts';
import { awardRoomPoints } from '../apps/web/src/network/room-scoring.ts';
import { readReport } from '../packages/protocol/profile.ts';

const opening = 100_000;
const firstGuest = opening + burgerPreparationMs;

test('team lobbies balance two to eight seats and let a member move to an open team', () => {
  let teams = fillRoomTeams([], ['host']);
  for (let count = 2; count <= roomRoles.length; count++) {
    const seats = roomRoles.slice(0, count);
    teams = fillRoomTeams(teams, ['host', ...seats]);
    assert.equal(teams.length, Math.max(2, Math.ceil(count / 2)));
    assert(teams.every(team => team.members.length <= 2));
    assert(validTeamLineup(teams, seats));
    assert.deepEqual(roundSeats('burger', seats.slice(1), [], 'teams'), seats);
  }
  assert.equal(roundSeats('burger', roomRoles.slice(1), [], 'coop'), undefined);
  assert.equal(addRoomTeam(teams), teams);
  assert.equal(moveRoomTeamMember(teams, 'host', 4), teams);
  assert.equal(removeRoomTeam(teams, 4), teams);
  assert.equal(readRoomTeams([{ id: 1, members: ['host'] }, { id: 2, members: ['host'] }]), undefined);

  teams = addRoomTeam(fillRoomTeams([], ['host', 'guest']));
  teams = moveRoomTeamMember(teams, 'guest', 3);
  assert.equal(teamFor(teams, 'guest')?.id, 3);
  teams = removeRoomTeam(teams, 2);
  assert.deepEqual(teams.map(team => team.id), [1, 3]);
  teams = moveRoomTeamMember(teams, 'host', 3);
  assert.equal(validTeamLineup(teams, ['host', 'guest']), false);
});

test('test lobbies sync mock identities and team counts, keeping space for real arrivals', () => {
  const host = { role: 'host' } as const;
  const guest = { role: 'guest' } as const;
  const settings = { ...defaultMatchSettings, burgerMode: 'teams' } as const;
  const initial = lobbyMatch('burger', settings);
  const full = reconcileLobbySeats(initial, [host], 7);
  assert.equal(full.burgerTeams?.length, 4);
  assert.deepEqual(full.mockSeats, roomRoles.slice(1));
  const packet = (match: typeof initial) => JSON.parse(JSON.stringify({ ...match, type: 'snapshot' }));
  const received = readMatchSnapshot(packet(full), initial, opening)!;
  assert.deepEqual(received.burgerTeams, full.burgerTeams);
  assert.deepEqual(received.mockSeats, full.mockSeats);

  const joined = reconcileLobbySeats(full, [host, guest], 7);
  assert.deepEqual(joined.mockSeats, roomRoles.slice(2));
  assert.deepEqual(joined.burgerTeams, full.burgerTeams);
  assert.equal(readMatchSnapshot(packet({ ...joined, burgerTeams: initial.burgerTeams }), received, opening), undefined);
  const reduced = reconcileLobbySeats(joined, [host, guest], 0);
  assert.equal(reduced.mockSeats, undefined);
  assert.deepEqual(reduced.burgerTeams?.map(team => team.members), [['host'], ['guest']]);

  const manual = addRoomTeam(reduced.burgerTeams!);
  assert.equal(reconcileLobbySeats({ ...reduced, burgerTeams: manual }, [host, guest], 0).burgerTeams?.[2].manual, true);
  const started = { ...full, startedAt: opening };
  assert.equal(reconcileLobbySeats(started, [host, guest], 0), started);
  assert.equal(inRound(started, 'guest'), false);
});

test('four team kitchens restore without a host-named kitchen and rank eight players by their team score', () => {
  const seats = [...roomRoles];
  const teams = [
    { id: 1, members: ['guest', 'host'] }, { id: 2, members: ['guest2', 'guest3'] },
    { id: 3, members: ['guest4', 'guest5'] }, { id: 4, members: ['guest6', 'guest7'] },
  ] satisfies NonNullable<BurgerRound['teams']>;
  const lobby = lobbyMatch('burger', { ...defaultMatchSettings, burgerMode: 'teams' });
  assert(readMatchSnapshot({ ...lobby, burgerTeams: teams, type: 'snapshot' }, blankMatch, opening));
  const started = startBurgerRound(createXpRound(5, seats, 17, 'teams', 'normal', teams), opening);
  const snapshot = (burger: BurgerRound, finishedAt = 0) => JSON.parse(JSON.stringify({
    ...lobby, burgerTeams: undefined, burger, startedAt: opening - 5000, beginsAt: burger.start, finishedAt, type: 'snapshot',
  }));
  let round = readMatchSnapshot(snapshot(started), blankMatch, opening)!.burger!;
  assert.equal(Object.keys(round.counters).length, 4);
  assert.equal(round.counters.host, undefined);
  assert.equal(burgerCounter(round, 'host'), burgerCounter(round, 'guest'));
  assert.deepEqual(burgerCounter(round, 'host').cards, ['assembly']);
  const paper = { type: 'add', item: 'paper', slot: 1 } as const;
  round = applyBurgerAction(round, 'guest', paper, opening + 1)!;
  assert.equal(burgerCounter(round, 'host').burgers[1].paper, true);
  assert.equal(burgerCounter(round, 'guest7').burgers[1].paper, false);
  const live = readMatchSnapshot(snapshot(round), blankMatch, opening + 1)!;
  assert(sharesTouchSurface(live, 'guest6', 'guest7'));
  assert.equal(sharesTouchSurface(live, 'guest6', 'guest'), false);
  assert.equal(readBurgerRound({ ...round, teams: [{ id: 1, members: ['host'] }, { id: 2, members: ['guest'] }] }), undefined);

  burgerCounter(round, 'guest7').money = 400;
  burgerCounter(round, 'guest2').money = 200;
  const tie = structuredClone(round);
  burgerCounter(tie, 'guest5').money = 400;
  const tied = advanceBurger(tie, tie.end)!;
  assert.equal(burgerOutcome(tied, 'guest7'), 'draw');
  assert.equal(burgerOutcome(tied, 'guest4'), 'draw');
  round = advanceBurger(round, round.end)!;
  const final = readMatchSnapshot(snapshot(round, round.end), live, round.end)!;
  assert.deepEqual(final.burger?.winners, ['guest6', 'guest7']);
  assert.equal(onlineMatchReport(final, 'guest7')?.outcome, 'win');
  assert.equal(onlineMatchReport(final, 'host')?.outcome, 'loss');
  assert.equal(awardRoomPoints(final, 'guest3', 'loss').points, 25);
  const entry = readRoomResult({ id: lobby.id, game: 'burger', endedAt: round.end, seconds: 320,
    players: seats.map(role => ({ role, outcome: matchOutcome(final, role) })) });
  assert.equal(entry?.players.length, 8);
});

test('a resignation leaves the shared kitchen open until the last teammate resigns', () => {
  const seats = roomRoles.slice(0, 4);
  let round = startBurgerRound(createXpRound('endless', seats, 17, 'teams'), opening);
  const hostMate = teamFor(round.teams, 'host')!.members.find(role => role !== 'host')!;
  round = resignBurger(round, 'host')!;
  assert(burgerResigned(round, 'host'));
  assert.equal(burgerCounter(round, hostMate).closed, undefined);
  assert(applyBurgerAction(round, hostMate, { type: 'add', item: 'paper', slot: 0 }, opening + 10));
  round = resignBurger(round, hostMate)!;
  assert.equal(burgerCounter(round, hostMate).retired, true);
  assert.equal(burgerOutcome(round, hostMate), 'loss');
  assert.equal(round.winners?.length, 2);
  assert(round.winners?.every(role => burgerOutcome(round, role) === 'win'));
});
function createCardRound(...args: Parameters<typeof createXpRound>) {
  const round = createXpRound(...args);
  for (const counter of Object.values(round.counters)) {
    delete counter!.xp;
    counter!.cards = [];
  }
  return round;
}
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

test('the grill warning starts at 180 percent on the cooking face and ends when burnt', () => {
  const patty = { kind: 'beef', side: 0, faces: [0, 100], heatAt: opening } as const;
  const heat = (elapsed: number) => pattyFaces({ ...patty, faces: [...patty.faces] }, opening + elapsed);
  assert.equal(isPattyNearBurn(heat(12_599), 0), false);
  assert.equal(isPattyNearBurn(heat(12_600), 0), true);
  assert.equal(isPattyNearBurn(heat(13_999), 0), true);
  assert.equal(isPattyNearBurn(heat(14_000), 0), false);
  assert.equal(isPattyNearBurn([180, 110], 1), false);
  assert.equal(isPattyNearBurn([200, 190], 1), false);
});

test('discarding a burnt patty blocks just that grill slot until the shared scrape finishes', () => {
  let round = startBurgerRound(createXpRound(5, ['host', 'guest'], 17, 'coop'), opening);
  const cook = { type: 'grill', kind: 'beef', slot: 0 } as const;
  const scrape = { type: 'scrape-grill', slot: 0 } as const;
  const discard = { type: 'move', from: 0, to: 'trash' } as const;
  round = action(round, cook, opening + 100);
  const burnt = opening + 16_000;
  assert.equal(applyBurgerAction(round, 'guest', { ...discard, to: 1 }, burnt), undefined);
  assert.equal(applyBurgerAction(round, 'guest', { ...discard, to: 'beef' }, burnt), undefined);
  round = applyBurgerAction(round, 'guest', discard, burnt)!;
  assert.equal(round.counters.host!.grill[0], null);
  assert.equal(round.counters.host!.grillResidue?.[0], 0);
  assert.equal(grillSlotAvailable(round.counters.host!, 0), false);
  assert.equal(applyBurgerAction(round, 'host', cook, burnt + 200), undefined);
  round = action(round, { ...cook, slot: 1 }, burnt + 200);
  const scrapeAt = burnt + 500;
  round = applyBurgerAction(round, 'guest', scrape, scrapeAt)!;
  assert.equal(nextBurgerAt(round), scrapeAt + grillScrapeMs);
  assert.equal(applyBurgerAction(round, 'host', { type: 'move', from: 1, to: 0 }, scrapeAt + grillScrapeMs - 1), undefined);
  assert.equal(advanceBurger(round, scrapeAt + grillScrapeMs - 1), undefined);
  assert.equal(grillSlotAvailable(advanceBurger(round, scrapeAt + grillScrapeMs)!.counters.host!, 0), true);

  const accelerated = applyBurgerAction(round, 'host', scrape, scrapeAt + 250)!;
  const cleanAt = scrapeAt + grillScrapeMs - 300;
  assert.equal(nextBurgerAt(accelerated), cleanAt);
  const restored = readBurgerRound(JSON.parse(JSON.stringify(shiftBurgerClock(accelerated, 3000))))!;
  assert.equal(nextBurgerAt(restored), cleanAt + 3000);
  assert.equal(applyBurgerAction(restored, 'host', cook, cleanAt + 2999), undefined);

  let shared = accelerated;
  for (let i = 1; i <= 5; i++) {
    shared = applyBurgerAction(shared, i % 2 ? 'guest' : 'host', scrape, scrapeAt + 250 + i * 20)!;
  }
  assert.equal(shared.counters.host!.grillResidue, undefined);
  assert.equal(applyBurgerAction(shared, 'guest', scrape, scrapeAt + 360), undefined);
  const ready = applyBurgerAction(shared, 'guest', cook, scrapeAt + 360)!;
  assert.equal(ready.counters.host!.grill[0]?.kind, 'beef');
  assert.equal(ready.counters.host!.grill[1]?.kind, 'beef');
});

test('co-op starts with the assembly card and can restore the first earned card', () => {
  const players = ['host', 'guest'] as const;
  const round = createXpRound(5, [...players], 17, 'coop');
  const board = round.counters.host!;
  assert.deepEqual(board.cards, ['assembly']);
  assert.equal(burgerRank(board), 1);
  const restore = (snapshot: BurgerRound) => readBurgerRound(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restore(round)?.counters.host?.cards, ['assembly']);

  const solo = startBurgerRound(createXpRound(5, ['host'], 17), opening);
  const race = startBurgerRound(createXpRound(5, [...players], 17), opening);
  const right = { type: 'add', item: 'paper', slot: 1 } as const;
  assert.equal(applyBurgerAction(solo, 'host', right, opening + 1), undefined);
  assert.equal(applyBurgerAction(race, 'host', right, opening + 1), undefined);
  race.counters.host!.cards = ['assembly'];
  assert.equal(restore(race), undefined);

  const old = structuredClone(round);
  old.counters.host!.cards = [];
  assert.deepEqual(restore(old)?.counters.host?.cards, []);

  let started = startBurgerRound(round, opening);
  started = applyBurgerAction(started, 'host', { ...right, slot: 0 }, opening + 1)!;
  started = applyBurgerAction(started, 'guest', right, opening + 2)!;
  started = advanceBurger(started, firstGuest)!;
  const shared = started.counters.host!;
  assert.deepEqual(shared.burgers.map(burger => burger.paper), [true, true]);
  shared.xp = 300;
  shared.served = 3;
  shared.service = { burger: { paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }] } };
  const drafted = applyBurgerAction(started, 'guest', { type: 'serve', order: 1 }, firstGuest + 10)!;
  assert.equal(burgerRank(drafted.counters.host!), 2);
  const draft = restore(drafted)?.counters.host?.draft;
  assert.ok(draft);
  assert.equal(draft.offers.includes('assembly'), false);
  const card = draft.offers[0];
  const chosen = applyBurgerAction(drafted, 'host', { type: 'choose-card', level: 2, card }, firstGuest + 2000)!;
  assert.deepEqual(restore(chosen)?.counters.host?.cards, ['assembly', card]);
});

test('shop status lists only current card effects, including the latest supply change', () => {
  const round = advanceBurger(startBurgerRound(createXpRound(5, ['host'], 17), opening), firstGuest)!;
  const board = round.counters.host!;
  board.xp = 840;
  board.feverUntil = firstGuest + 5000;
  board.orders[0].drink = { kind: 'cola', size: 'medium' };
  const rows = () => burgerStoreRows(board, 'en-US', key => key);
  assert.deepEqual(rows(), []);

  board.cards = ['unlock:cola', 'unlock:cheese', 'sold:cheese', 'rush', 'table', 'tray', 'autoGrill', 'autoGrill2'];
  assert.deepEqual(rows(), [
    ['burgerStore_rewards'], ['burgerStore_xp', '+14%'], ['burgerStore_revenue', '+60%'],
    ['burgerStore_guests'], ['burgerStore_traffic', '+10%'], ['burgerStore_waitBonus', '-10%'],
    ['burgerStore_equipment'], ['burgerStore_grillMode', 'burgerStore_autoFlipUnload'], ['burgerStore_tray', '8'], ['burgerStore_tables', '1'],
    ['burgerStore_supplies'], ['burgerLabel_cheese', 'burgerStore_sold'], ['burgerLabel_cola', 'burgerStore_unlocked'],
  ]);
  board.cards.push('patient', 'unlock:cheese');
  const changed = new Map(rows());
  assert(!changed.has('burgerStore_waitBonus'));
  assert.equal(changed.get('burgerLabel_cheese'), 'burgerStore_unlocked');
});

test('the service bell advances the shared queue by a second per ring only when it is empty', () => {
  const ring = { type: 'ring-bell' } as const;
  let round = startBurgerRound(createXpRound(5, ['host', 'guest'], 17, 'coop'), opening);
  round = applyBurgerAction(round, 'guest', ring, opening + 1000)!;
  assert.equal(nextBurgerAt(round), firstGuest);
  round = advanceBurger(round, firstGuest)!;
  assert.equal(applyBurgerAction(round, 'guest', ring, firstGuest + 1), undefined);

  const board = round.counters.host!;
  board.service = { burger: { paper: true, bread: 'bun', top: true, packed: true, layers: [
    { ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } },
  ] } };
  round = action(round, { type: 'serve', order: 1 }, firstGuest + 500);
  const scheduled = round.counters.host!.next;
  round = action(round, ring, firstGuest + 800);
  round = applyBurgerAction(round, 'guest', ring, firstGuest + 850)!;
  assert.equal(burgerCounter(round, 'guest').next, scheduled - 2000);
  assert.equal(readBurgerRound(JSON.parse(JSON.stringify(round)))?.counters.host?.next, scheduled - 2000);

  const arrival = scheduled - 2400;
  round = action(round, ring, arrival);
  assert.equal(round.counters.host!.next, arrival);
  assert.equal(nextBurgerAt(round), arrival);
  assert.equal(advanceBurger(round, arrival)?.counters.host?.orders[0]?.id, 2);
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
      assert.deepEqual(board.submission, { id: 1, at: firstGuest + 100 });
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
  assert(roster.every(role => burgerCounter(round, role).money === 186));
  assert.equal(applyBurgerAction(round, 'guest2', { type: 'serve', order: 1 }, firstGuest + 1), undefined);
  const submitted = { id: 1, at: firstGuest };
  const snapshotAfterSpill = structuredClone(round);
  snapshotAfterSpill.counters.host!.cups[0] = { amount: 195, pourAt: firstGuest + 10 };
  const spilled = advanceBurger(snapshotAfterSpill, firstGuest + 150)!;
  assert.equal(spilled.counters.host!.feedback?.kind, 'spill');
  const restored = readBurgerRound(JSON.parse(JSON.stringify(spilled)))!;
  for (const role of roster) assert.deepEqual(burgerCounter(restored, role).submission, submitted);

  round = resignBurger(round, 'guest2')!;
  assert.equal(round.winners, undefined);
  assert(burgerResigned(round, 'guest2'));
  assert.equal(applyBurgerAction(round, 'guest2', { type: 'grill', slot: 1, kind: 'beef' }, firstGuest + 2), undefined);
  assert.equal(shiftBurgerClock(round, 900).counters.host?.next, round.counters.host!.next + 900);
  assert.deepEqual(shiftBurgerClock(round, 900).counters.host?.submission, { ...submitted, at: firstGuest + 900 });
  const finished = advanceBurger(round, round.end)!;
  const lobby = lobbyMatch('burger', { ...defaultMatchSettings, burgerMode: 'coop' });
  const snapshot = { ...lobby, type: 'snapshot', startedAt: opening, finishedAt: finished.end, burger: finished };
  assert.equal(readMatchSnapshot({ ...snapshot, burgerMode: 'race' }, blankMatch, finished.end), undefined);
  const recovered = readMatchSnapshot(snapshot, blankMatch, finished.end)!;
  assert.deepEqual(recovered.burger?.winners, []);
  assert.equal(matchOutcome(recovered, 'host'), undefined);
  assert.equal(onlineMatchReport(recovered, 'guest2'), undefined);
  const report = onlineMatchReport(recovered, 'guest3');
  assert.deepEqual(report, { id: lobby.id, game: 'burger', mode: 'coop', outcome: 'score', seconds: 300 + burgerPreparationMs / 1000, score: 186 });
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
  assert.equal(round.counters.host!.money, 186);
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
  assert.equal(round.counters.host!.money, 186);
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
  move({ type: 'add', slot: 0, item: 'paper' }, 'host');
  move({ type: 'return-burger', to: 'origin', serial: 3 });
  assert.deepEqual(kitchen().burgers[1], burger(3));
});

test('a staged burger can move to any free rack slot and a stored burger can return to a free manual station', () => {
  let round = startBurgerRound(createXpRound(5, ['host', 'guest'], 17, 'coop'), opening);
  const now = opening + 1500;
  const kitchen = () => round.counters.host!;
  const move = (input: BurgerAction, actor: 'host' | 'guest' = 'guest') => {
    const next = applyBurgerAction(round, actor, input, now);
    assert(next);
    round = next;
  };
  const burger: BurgerStack = { paper: true, bread: 'bun', top: true, packed: true, layers: [
    { ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0, serial: 1 } },
  ] };
  const cola = { kind: 'cola', amount: 100 } as const;
  kitchen().cards = ['storage', 'unlock:cola', 'orderStorage'];
  kitchen().xp = burgerXpToReach(4);
  kitchen().served = 14;
  kitchen().pattySequence = 1;
  kitchen().burgers[0] = burger;
  kitchen().cups[0] = { amount: cola.amount, pourAt: 0 };
  move({ type: 'store-drink', drink: 0, index: 3 });
  move({ type: 'stage-burger', slot: 0 });
  move({ type: 'add', slot: 0, item: 'paper' });
  const stash = { type: 'store-burger', slot: 'service', index: 3, serial: 1 } as const;
  assert.equal(applyBurgerAction(round, 'host', { ...stash, serial: 2 }, now), undefined);
  move(stash, 'host');
  assert.equal(kitchen().service?.burger, undefined);
  assert.equal(kitchen().service?.origin, undefined);
  assert.deepEqual(kitchen().storage?.[3], burger);
  assert.deepEqual(kitchen().storedDrinks?.[3], cola);
  assert.equal(kitchen().burgers[0].paper, true);
  round = readBurgerRound(JSON.parse(JSON.stringify(round)))!;
  assert.ok(round);
  const retrieve = { type: 'retrieve-burger', index: 3, slot: 0, serial: 1 } as const;
  assert.equal(applyBurgerAction(round, 'host', retrieve, now), undefined);
  assert.equal(applyBurgerAction(round, 'host', { ...retrieve, slot: 1 }, now), undefined);
  assert.deepEqual(kitchen().storage?.[3], burger);
  move({ type: 'discard', slot: 0 });
  assert.equal(applyBurgerAction(round, 'host', { ...retrieve, serial: 2 }, now), undefined);
  move(retrieve);
  assert.equal(kitchen().storage?.[3], null);
  assert.deepEqual(kitchen().storedDrinks?.[3], cola);
  assert.deepEqual(kitchen().burgers[0], burger);
  move({ type: 'store-burger', slot: 0, index: 4 });
  move({ type: 'stage-stored', index: 4 });
  move({ ...stash, index: 7 });
  assert.equal(kitchen().storage?.[4], null);
  assert.deepEqual(kitchen().storage?.[7], burger);
  assert.equal(kitchen().money, 100);
  assert.ok(readBurgerRound(JSON.parse(JSON.stringify(round))));
});

test('the order rack stores a burger and drink or a drink on its own and restores both through the shared kitchen', () => {
  let round = advanceBurger(startBurgerRound(createCardRound(5, ['host', 'guest'], 17, 'coop'), opening), firstGuest)!;
  const at = firstGuest + 400;
  const kitchen = () => round.counters.host!;
  const move = (input: BurgerAction, actor: 'host' | 'guest' = 'guest') => {
    const next = applyBurgerAction(round, actor, input, at);
    assert(next);
    round = next;
  };
  const cola = { kind: 'cola', amount: 103.5 } as const;
  const soda = { kind: 'soda', amount: 123 } as const;
  kitchen().cards = ['storage', 'unlock:cola', 'unlock:soda'];
  kitchen().served = 12;
  kitchen().cups = [{ amount: cola.amount, pourAt: 0 }, { amount: soda.amount, pourAt: 0 }];
  assert.equal(applyBurgerAction(round, 'guest', { type: 'store-drink', drink: 0, index: 0 }, at), undefined);
  setUpgradeDraft(round, 7, at, ['orderStorage', 'rush', 'griddle']);
  move({ type: 'choose-card', card: 'orderStorage', level: 7 });
  const burger: BurgerStack = { paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0, serial: 7 } }] };
  kitchen().burgers[0] = burger;
  move({ type: 'store-burger', slot: 0, index: 0 });
  move({ type: 'store-drink', drink: 0, index: 0 }, 'host');
  move({ type: 'stage-drink', drink: 1 });
  assert.equal(applyBurgerAction(round, 'host', { type: 'stage-stored', index: 0 }, at), undefined);
  assert.deepEqual(kitchen().storage?.[0], burger);
  assert.deepEqual(kitchen().storedDrinks?.[0], cola);
  move({ type: 'store-drink', drink: 'service', index: 1 });
  move({ type: 'shift-stored', from: 0, to: 1, serial: 7, expectedDrink: cola });
  assert.deepEqual(kitchen().storedDrinks?.slice(0, 2), [soda, cola]);
  assert.deepEqual(kitchen().storage?.slice(0, 2), [null, burger]);
  assert.equal(applyBurgerAction(round, 'guest', { type: 'stage-stored', index: 0, expectedDrink: cola }, at), undefined);
  move({ type: 'stage-stored', index: 1, serial: 7, expectedDrink: cola });
  assert.deepEqual(kitchen().service, { burger, origin: { area: 'storage', index: 1 }, drink: cola, drinkOrigin: 1 });
  assert.equal(applyBurgerAction(round, 'host', { type: 'shift-stored', from: 0, to: 1 }, at), undefined);
  round = readBurgerRound(JSON.parse(JSON.stringify(round)))!;
  assert(round);
  move({ type: 'return-burger', to: 'origin', serial: 7 });
  assert.equal(kitchen().service?.drinkOrigin, 1);
  move({ type: 'return-drink', to: 'origin' });
  assert.deepEqual(kitchen().storedDrinks?.slice(0, 2), [soda, cola]);
  assert.deepEqual(kitchen().storage?.[1], burger);

  move({ type: 'stage-stored', index: 0, expectedDrink: soda });
  assert.equal(kitchen().service?.burger, undefined);
  move({ type: 'return-drink', to: 'machine' });
  assert.deepEqual(kitchen().cups[1], { amount: soda.amount, pourAt: 0 });
  const money = kitchen().money;
  move({ type: 'store-drink', drink: 1, index: 0 });
  move({ type: 'discard-stored', index: 0 });
  assert.equal(kitchen().money, money);
  move({ type: 'stage-stored', index: 1, serial: 7 });
  move({ type: 'serve', order: 1 }, 'host');
  assert.equal(kitchen().service, undefined);
  kitchen().cups[0] = { amount: cola.amount, pourAt: 0 };
  move({ type: 'store-drink', drink: 0, index: 1 });
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
  assert.deepEqual(judgeOrder(meal, burger, meal.drink), { money: 305, perfect: true, satisfaction: 'love', tip: 61, similarity: 1 });
  assert.equal(burgerOrderXp(meal, burger, meal.drink), 120);
  assert.equal(burgerOrderXp(meal, burger, meal.drink, 1.07), 128.4);
  const cookedDifferently = { ...burger, layers: burger.layers.map(layer => layer.patty
    ? { ...layer, patty: { ...layer.patty, faces: [70, 70] as [number, number] } } : layer) };
  const exactRecipe = judgeOrder(meal, cookedDifferently, meal.drink);
  assert.equal(exactRecipe.money, 305);
  assert.equal(exactRecipe.perfect, true);
  assert.equal(exactRecipe.tip, 0);
  assert.equal(burgerOrderXp(meal, cookedDifferently, meal.drink), 100);
  const wrong = judgeOrder(meal, { ...burger, layers: [...burger.layers].reverse() }, { kind: 'cola', size: 'small' });
  assert(!wrong.perfect);
  assert(wrong.money > 0 && wrong.money < 110);
  const withoutDrink = judgeOrder(meal, burger);
  assert.equal(withoutDrink.money, 220);
  assert.equal(withoutDrink.perfect, false);
  assert.equal(withoutDrink.satisfaction, 'content');
  assert.equal(withoutDrink.tip, 0);
  assert.equal(burgerOrderXp(meal, burger), 80);
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
  assert.equal(round.counters.host!.money, 186);
  Object.assign(round.counters.host!, { combo: 9, served: 9, best: 9, sequence: 2, orders: [{ ...first, id: 2 }], service: { burger: ready } });
  round = action(round, { type: 'serve', order: 2 }, firstGuest + 2500);
  assert.equal(round.counters.host!.money, 527);
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
  assert.equal(round.counters.host!.money, 186);
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

test('a co-op kitchen can reuse the assembly slot while a staged burger is waiting', () => {
  const initialRound = advanceBurger(startBurgerRound(createXpRound(5, ['host', 'guest'], 17, 'coop'), opening), firstGuest)!;
  const board = initialRound.counters.host!;
  board.cards = ['assembly'];
  board.xp = 400;
  board.served = 4;
  const stagedBurger: BurgerStack = { paper: true, bread: 'bun', top: true, packed: true, layers: [
    { ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0, serial: 1 } },
  ] };
  board.burgers[0] = stagedBurger;
  const staged = action(initialRound, { type: 'stage-burger', slot: 0 }, firstGuest + 100);
  const restoredStaged = readBurgerRound(JSON.parse(JSON.stringify(staged)))!;
  const returnBurger = { type: 'return-burger', to: 'origin', serial: 1 } as const;
  assert.deepEqual(applyBurgerAction(restoredStaged, 'guest', returnBurger, firstGuest + 200)?.counters.host?.burgers[0], stagedBurger);

  const paper = applyBurgerAction(staged, 'guest', { type: 'add', slot: 0, item: 'paper' }, firstGuest + 200)!;
  const preparing = action(paper, { type: 'add', slot: 0, item: 'bun' }, firstGuest + 300);
  const restored = readBurgerRound(JSON.parse(JSON.stringify(preparing)))!;
  const kitchen = restored.counters.host!;
  assert.deepEqual(kitchen.service?.burger, stagedBurger);
  assert.equal(kitchen.burgers[0].bread, 'bun');
  assert.equal(kitchen.burgers[1].paper, false);
  for (const to of ['origin', 0, 1] as const) {
    assert.equal(applyBurgerAction(restored, 'guest', { ...returnBurger, to }, firstGuest + 400), undefined);
  }

  const sold = action(restored, { type: 'serve', order: 1 }, firstGuest + 500).counters.host!;
  const discarded = action(restored, { ...returnBurger, to: 'trash' }, firstGuest + 500).counters.host!;
  for (const result of [sold, discarded]) {
    assert.equal(result.service?.burger, undefined);
    assert.deepEqual(result.burgers[0], kitchen.burgers[0]);
  }
  assert.equal(discarded.money, kitchen.money - 30);
  const freed = action(restored, { type: 'discard', slot: 0 }, firstGuest + 500);
  assert.deepEqual(action(freed, returnBurger, firstGuest + 600).counters.host?.burgers[0], stagedBurger);
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

function setUpgradeDraft(round: BurgerRound, level: number, at: number, offers: BurgerCard[]) {
  const board = round.counters.host!;
  const cards = board.cards ?? [];
  board.cards = [...cards, ...Array<BurgerCard>(level - 2 - cards.length).fill('patient')];
  board.served = (level - 1) * 4;
  if (board.xp !== undefined) {
    board.xp = burgerXpToReach(level);
    board.served = Math.ceil(board.xp / 100);
  }
  board.draft = { at, offers };
  return round;
}

const firstGrillDraft = () => setUpgradeDraft(grillUpgradeDraft(), 7, firstGuest, ['highHeat', 'autoGrill', 'griddle']);

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
  let round = firstGrillDraft();
  const selectedAt = firstGuest + 5000;
  round = applyBurgerAction(round, 'guest', { type: 'choose-card', card: 'highHeat', level: 7 }, selectedAt)!;
  const board = round.counters.host!;
  assert.equal(board.cards?.at(-1), 'highHeat');
  assert.deepEqual(pattyFaces(board.grill[0]!, selectedAt, board), [70, 0]);
  const cookAt = selectedAt + 3500;
  assert.deepEqual(pattyFaces(board.grill[0]!, cookAt, board), [135, 0]);
  round = action(round, { type: 'flip', slot: 0, side: 0 }, cookAt);
  round = action(round, { type: 'hold', slot: 0 }, cookAt + 3500);
  assert.deepEqual(round.counters.host!.tray[0].faces, [135, 65]);
  assert(readBurgerRound(JSON.parse(JSON.stringify(round))));

  const invalid = structuredClone(round);
  invalid.counters.host!.served += 4;
  invalid.counters.host!.cards!.push('autoGrill');
  assert.equal(readBurgerRound(invalid), undefined);
});

test('automatic grilling flips a hot side on the shared kitchen clock and does not bounce between hot sides', () => {
  let round = applyBurgerAction(firstGrillDraft(), 'guest', { type: 'choose-card', card: 'autoGrill', level: 7 }, firstGuest)!;
  round.counters.host!.next = firstGuest + 14_000;
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

test('high heat level two preserves paused cooking progress and replaces the first speed bonus', () => {
  const selectedAt = firstGuest + 5000;
  let round = action(firstGrillDraft(), { type: 'choose-card', card: 'highHeat', level: 7 }, firstGuest);
  const draftAt = firstGuest + 3500;
  setUpgradeDraft(round, 14, draftAt, ['highHeat2', 'griddle', 'table']);
  round = action(round, { type: 'choose-card', card: 'highHeat2', level: 14 }, selectedAt);
  const board = round.counters.host!;
  assert.deepEqual(board.cards?.filter(card => card.startsWith('highHeat')), ['highHeat', 'highHeat2']);
  assert.deepEqual(pattyFaces(board.grill[0]!, selectedAt, board), [135, 0]);
  assert.deepEqual(pattyFaces(board.grill[0]!, selectedAt + 2800, board), [195, 0]);
  assert(readBurgerRound(JSON.parse(JSON.stringify(round))));

  const invalid = structuredClone(round);
  invalid.counters.host!.cards!.reverse();
  assert.equal(readBurgerRound(invalid), undefined);
  invalid.counters.host!.cards = board.cards!.map(card => card === 'highHeat' ? 'autoGrill' : card);
  assert.equal(readBurgerRound(invalid), undefined);
});

function fullyAutomaticDraft() {
  const round = action(firstGrillDraft(), { type: 'choose-card', card: 'autoGrill', level: 7 }, firstGuest);
  round.counters.host!.xp = 0;
  return setUpgradeDraft(round, 14, firstGuest, ['autoGrill2', 'griddle', 'tray']);
}

test('fully automatic grilling cooks both sides to well-done and transfers the patty on the shared clock', () => {
  const selectedAt = firstGuest + 5000;
  const round = applyBurgerAction(fullyAutomaticDraft(), 'guest', { type: 'choose-card', card: 'autoGrill2', level: 14 }, selectedAt)!;
  round.counters.host!.next = selectedAt + 40_000;
  assert.equal(applyBurgerAction(round, 'guest', { type: 'hold', slot: 0 }, selectedAt + 1000), undefined);
  const restored = readBurgerRound(JSON.parse(JSON.stringify(shiftBurgerClock(round, 3000))))!;
  const flipAt = selectedAt + 7700 + 3000;
  assert.equal(nextBurgerAt(restored), flipAt);
  const flipped = advanceBurger(restored, flipAt)!;
  assert.equal(flipped.counters.host!.grill[0]!.side, 1);
  assert.deepEqual(flipped.counters.host!.grill[0]!.faces, [180, 0]);
  const readyAt = flipAt + 12_600;
  const beforeReady = advanceBurger(flipped, readyAt - 1) ?? flipped;
  assert.equal(beforeReady.counters.host!.tray.length, 0);
  const finished = advanceBurger(restored, readyAt + 5000)!;
  assert.equal(restored.counters.host!.tray.length, 0);
  const board = readBurgerRound(JSON.parse(JSON.stringify(finished)))!.counters.host!;
  assert.equal(board.grill[0], null);
  assert.deepEqual(board.tray[0].faces, [180, 180]);
  assert.equal(board.tray[0].serial, 1);
  assert.equal(pattyDoneness(board.tray[0].faces), 'well');
});

test('co-op players can override automatic grill two to save a medium patty', () => {
  const selectedAt = firstGuest + 5000;
  let round = applyBurgerAction(fullyAutomaticDraft(), 'guest', { type: 'choose-card', card: 'autoGrill2', level: 14 }, selectedAt)!;
  round.counters.host!.next = selectedAt + 40_000;
  round = action(round, { type: 'add', item: 'paper', slot: 0 }, selectedAt + 50);
  round = action(round, { type: 'add', item: 'bun', slot: 0 }, selectedAt + 100);

  const flip = { type: 'flip', slot: 0, serial: 1, side: 0 } as const;
  const flipAt = selectedAt + 2100;
  round = applyBurgerAction(round, 'guest', flip, flipAt)!;
  assert.deepEqual(pattyFaces(round.counters.host!.grill[0]!, flipAt), [100, 0]);
  assert.equal(applyBurgerAction(round, 'host', flip, flipAt + 1), undefined);
  round = applyBurgerAction(round, 'guest', { type: 'move', from: 0, to: 1, serial: 1 }, flipAt + 1400)!;
  const readyAt = flipAt + 7000;
  assert.deepEqual(pattyFaces(round.counters.host!.grill[1]!, readyAt), [100, 100]);

  const held = applyBurgerAction(round, 'guest', { type: 'hold', slot: 1, serial: 1 }, readyAt)!;
  const dragged = applyBurgerAction(round, 'guest', { type: 'move', from: 1, to: 'beef', serial: 1 }, readyAt)!;
  assert.equal(held.counters.host!.grill[1], null);
  assert.deepEqual(held.counters.host!.tray, dragged.counters.host!.tray);
  assert.deepEqual(held.counters.host!.tray[0].faces, [100, 100]);

  const stacked = applyBurgerAction(round, 'guest', { type: 'stack', slot: 0, from: 1, serial: 1 }, readyAt)!;
  const kitchen = readBurgerRound(JSON.parse(JSON.stringify(stacked)))!.counters.host!;
  assert.equal(kitchen.grill[1], null);
  assert.deepEqual(kitchen.burgers[0].layers[0].patty?.faces, [100, 100]);
  assert.equal(kitchen.tray.length, 0);
});

test('a full tray keeps heating, and opening a spot only transfers patties that are not burnt', () => {
  const round = action(fullyAutomaticDraft(), { type: 'choose-card', card: 'autoGrill2', level: 14 }, firstGuest);
  const board = round.counters.host!;
  board.tray = Array.from({ length: 4 }, (_, index) => ({ kind: 'beef', faces: [100, 100], side: 0, heatAt: 0, serial: 10 + index }));
  const ready = firstGuest + 20_300;
  const waiting = advanceBurger(round, ready)!;
  const restored = readBurgerRound(JSON.parse(JSON.stringify(waiting)))!;
  const before = restored.counters.host!;
  assert.equal(before.grill[0]!.heatAt, firstGuest + 7700);
  assert.deepEqual(pattyFaces(before.grill[0]!, ready, before), [180, 180]);
  assert.equal(before.tray.length, 4);
  assert(nextBurgerAt(restored)! > ready);
  const discard = { type: 'discard-tray', kind: 'beef', index: 0, serial: 10 } as const;
  const moved = applyBurgerAction(restored, 'guest', discard, ready + 700)!;
  assert.equal(moved.counters.host!.grill[0], null);
  assert.deepEqual(moved.counters.host!.tray.map(patty => patty.serial), [11, 12, 13, 1]);
  const burnt = applyBurgerAction(restored, 'guest', discard, ready + 1400)!;
  assert.equal(burnt.counters.host!.tray.length, 3);
  assert.deepEqual(pattyFaces(burnt.counters.host!.grill[0]!, ready + 1400, burnt.counters.host), [180, 200]);
  assert.equal(before.grill[0]!.serial, 1);
  assert.deepEqual(before.tray.map(patty => patty.serial), [10, 11, 12, 13]);
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
  assert.deepEqual(cardModifiers(cards), { revenue: 1.9, xp: 1.02, patience: .9, traffic: 1.3, layers: 2 });
  const offered = new Set(Array.from({ length: 100 }, (_, index) => cardOffers(cards, 3, () => index / 100)).flat());
  assert(offered.has('unlock:cheese'));
  assert(offered.has('sold:cheese'));
  assert(!offered.has('highHeat') && !offered.has('autoGrill'));
  assert(!offered.has('highHeat2') && !offered.has('autoGrill2'));
  assert(!offered.has('picky'));
  assert(!offered.has('unlock:chicken'));
});

test('a sellout has half of each other card’s draw weight, including on rerolls', () => {
  const previous = ['rush', 'patient', 'advertise'] as const;
  for (const excluded of [[], previous]) {
    const counts = new Map<BurgerCard, number>();
    const draws = 190 - excluded.length * 20;
    for (let i = 0; i < draws; i++) {
      const offers = cardOffers(['unlock:cheese'], 2, index => index === 0 ? (i + .5) / draws : .5, excluded);
      assert.equal(new Set(offers).size, 3);
      assert(offers.every(card => !excluded.some(candidate => candidate === card)));
      counts.set(offers[0], (counts.get(offers[0]) ?? 0) + 1);
    }
    assert.equal(counts.size, 10 - excluded.length);
    for (const [card, count] of counts) assert.equal(count, card === 'sold:cheese' ? 10 : 20);
  }
});

const offersAt = (cards: BurgerCard[], level: number) => new Set(
  Array.from({ length: 100 }, (_, index) => cardOffers(cards, level, () => index / 100)).flat());

test('ingredient limit cards start at level ten and can each be picked twice', () => {
  for (const card of ['picky', 'simple'] as const) {
    assert(!offersAt([], 9).has(card));
    assert(offersAt([], 10).has(card));
    assert(offersAt([card], 10).has(card));
    assert(!offersAt([card, card], 12).has(card));
  }
});

test('upgrade drafts enforce grill milestones and the second assembly station prerequisite', () => {
  assert(!offersAt([], 6).has('highHeat') && !offersAt([], 6).has('autoGrill'));
  assert(offersAt([], 7).has('highHeat') && offersAt([], 7).has('autoGrill'));
  assert(!offersAt(['assembly'], 9).has('autoAssembly'));
  assert(!offersAt([], 10).has('autoAssembly'));
  assert(offersAt(['assembly'], 10).has('autoAssembly'));
  assert(!offersAt(['assembly', 'autoAssembly'], 11).has('autoAssembly'));
  assert(!offersAt([], 3).has('orderStorage'));
  assert(offersAt(['storage'], 3).has('orderStorage'));
  assert(!offersAt(['storage', 'orderStorage'], 4).has('orderStorage'));
  for (const upgrade of ['highHeat', 'autoGrill'] as const) {
    const followUp = upgrade === 'highHeat' ? 'highHeat2' : 'autoGrill2';
    const opposite = upgrade === 'highHeat' ? 'autoGrill2' : 'highHeat2';
    assert(!offersAt([upgrade], 13).has(followUp));
    const remaining = offersAt([upgrade], 14);
    assert(!remaining.has('highHeat') && !remaining.has('autoGrill'));
    assert(remaining.has(followUp) && !remaining.has(opposite));
    assert(remaining.has('griddle'));
    assert(!offersAt([upgrade, followUp], 15).has(followUp));
  }
  const draft = setUpgradeDraft(grillUpgradeDraft(), 6, firstGuest, ['highHeat', 'autoGrill', 'griddle']);
  const restored = readBurgerRound(JSON.parse(JSON.stringify(draft)))!;
  assert.equal(applyBurgerAction(restored, 'guest', { type: 'choose-card', card: 'autoGrill', level: 6 }, firstGuest), undefined);
});

function automaticAssemblyRound() {
  const started = startBurgerRound(createXpRound(5, ['host', 'guest'], 19, 'coop'), opening);
  const round = advanceBurger(started, firstGuest)!;
  const board = round.counters.host!;
  board.cards = ['assembly', 'unlock:cheese', 'unlock:chicken'];
  board.money = 1000;
  board.orders[0] = {
    ...board.orders[0], layers: [{ ingredient: 'cheese' }, { ingredient: 'beef', cooked: 'well' }],
    drink: { kind: 'cola', size: 'medium' }, price: 183,
  };
  setUpgradeDraft(round, 10, firstGuest, ['autoAssembly', 'griddle', 'table']);
  const selected = applyBurgerAction(round, 'guest', { type: 'choose-card', card: 'autoAssembly', level: 10 }, firstGuest)!;
  selected.counters.host!.next = firstGuest + 100_000;
  return selected;
}

test('an installed assembler rejects manual loading, while leftover ingredients can be removed', () => {
  let round = automaticAssemblyRound();
  const at = firstGuest + 100;
  const paper = { type: 'add', slot: 1, item: 'paper' } as const;
  assert.equal(applyBurgerAction(round, 'host', paper, at), undefined);
  assert.equal(applyBurgerAction(round, 'guest', paper, at), undefined);
  round = action(round, { ...paper, slot: 0 }, at);
  assert.equal(round.counters.host!.burgers[0].paper, true);

  const counter = round.counters.host!;
  const patty = { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0, serial: 1 } as const;
  counter.grill[0] = { ...patty, faces: [...patty.faces] };
  counter.tray.push({ ...patty, faces: [...patty.faces], serial: 2 });
  counter.burgers[1] = { paper: true, bread: 'bun', top: false, packed: false, layers: [] };
  assert.equal(applyBurgerAction(round, 'guest', { type: 'add', slot: 1, item: 'cheese' }, at), undefined);
  assert.equal(applyBurgerAction(round, 'guest', { type: 'stack', slot: 1, from: 0, serial: 1 }, at), undefined);
  assert.equal(applyBurgerAction(round, 'guest', { type: 'stack-tray', slot: 1, kind: 'beef', index: 0, serial: 2 }, at), undefined);
  assert.equal(counter.grill[0].serial, 1);
  assert.equal(counter.tray[0].serial, 2);

  counter.burgers[1].layers.push({ ingredient: 'beef', patty: counter.tray.pop()!, source: 'beef' });
  counter.burgers[1].top = true;
  assert.equal(applyBurgerAction(round, 'guest', { type: 'wrap', slot: 1 }, at), undefined);
  const pop = { type: 'pop', slot: 1 } as const;
  round = action(round, pop, at);
  round = applyBurgerAction(round, 'guest', pop, at)!;
  assert.equal(round.counters.host!.tray[0].serial, 2);
  assert.deepEqual(round.counters.host!.burgers[1].layers, []);
  assert.equal(round.counters.host!.burgers[0].paper, true);
  round = action(action(round, pop, at), pop, at);
  assert.equal(round.counters.host!.burgers[1].paper, false);
});

test('the shared assembler waits for cooked matching stock, resumes after restore, wraps, and starts cooldown at completion', () => {
  const round = automaticAssemblyRound();
  const board = round.counters.host!;
  board.tray = [
    { kind: 'chicken', faces: [130, 130], side: 0, heatAt: 0, serial: 1 },
    { kind: 'beef', faces: [35, 0], side: 0, heatAt: 0, serial: 2 },
  ];
  const start = { type: 'start-assembly', order: 1 } as const;
  let working = applyBurgerAction(round, 'guest', start, firstGuest)!;
  assert.equal(nextBurgerAt(working), firstGuest + 500);
  assert.equal(applyBurgerAction(working, 'host', start, firstGuest + 1), undefined);
  assert.equal(applyBurgerAction(working, 'guest', { type: 'add', slot: 1, item: 'paper' }, firstGuest + 2), undefined);
  for (let step = 1; step <= 4; step++) working = advanceBurger(working, firstGuest + step * 500)!;
  assert.deepEqual(working.counters.host!.burgers[1].layers, [{ ingredient: 'cheese' }]);
  assert.equal(working.counters.host!.assemblyJob?.next, 0);
  assert.equal(working.counters.host!.tray.length, 2);

  const restored = readBurgerRound(JSON.parse(JSON.stringify(shiftBurgerClock(working, 3000))))!;
  const counter = restored.counters.host!;
  assert.equal(counter.assemblyJob?.next, 0);
  counter.grill[0] = { kind: 'beef', faces: [70, 70], side: 0, heatAt: 0, serial: 3 };
  const restockedAt = firstGuest + 5100;
  working = applyBurgerAction(restored, 'guest', { type: 'hold', slot: 0, serial: 3 }, restockedAt)!;
  assert.equal(working.counters.host!.assemblyJob?.next, restockedAt + 500);
  assert.equal(working.counters.host!.burgers[1].layers.length, 1);
  for (let step = 1; step <= 3; step++) working = advanceBurger(working, restockedAt + step * 500)!;
  const done = readBurgerRound(JSON.parse(JSON.stringify(working)))!.counters.host!;
  assert.equal(done.assemblyJob, undefined);
  assert.equal(done.assemblyReadyAt, restockedAt + 11_500);
  assert.equal(done.burgers[1].packed, true);
  assert.equal(done.burgers[1].layers[1].patty?.serial, 3);
  assert.deepEqual(done.tray.map(patty => patty.serial), [1, 2]);
  assert.equal(done.service?.drink, undefined);
  assert.equal(done.orders[0].id, 1);
  assert.equal(done.money, 1000);
  const served = action(working, { type: 'stage-burger', slot: 1 }, restockedAt + 1600);
  const returned = action(served, { type: 'return-burger', to: 'origin' }, restockedAt + 1650);
  assert.deepEqual(returned.counters.host!.burgers[1], done.burgers[1]);
  const stagedFromLeft = structuredClone(served);
  stagedFromLeft.counters.host!.service!.origin = { area: 'assembly', index: 0 };
  assert.equal(applyBurgerAction(stagedFromLeft, 'guest', { type: 'return-burger', to: 1 }, restockedAt + 1650), undefined);
  assert.equal(applyBurgerAction(served, 'guest', start, restockedAt + 11_499), undefined);
  const nextJob = applyBurgerAction(served, 'guest', start, restockedAt + 11_500)!;
  const savedJob = readBurgerRound(JSON.parse(JSON.stringify(nextJob)))!;
  assert(savedJob.counters.host!.assemblyJob);
  assert.equal(savedJob.counters.host!.burgers[1].paper, false);
  assert.equal(applyBurgerAction(savedJob, 'guest', { type: 'return-burger', to: 'origin' }, restockedAt + 11_600), undefined);
  assert.equal(applyBurgerAction(savedJob, 'guest', { type: 'return-burger', to: 0 }, restockedAt + 11_600), undefined);
  const cleared = action(savedJob, { type: 'return-burger', to: 'trash' }, restockedAt + 11_600);
  assert(cleared.counters.host!.assemblyJob);
});

test('a cancelled or replaced front order leaves the partial burger on the automated station', () => {
  let round = automaticAssemblyRound();
  const start = { type: 'start-assembly', order: 1 } as const;
  const initial = round.counters.host!;
  initial.orders[0].until = firstGuest + 1750;
  round = action(round, start, firstGuest);
  for (let step = 1; step <= 3; step++) round = advanceBurger(round, firstGuest + step * 500)!;
  const expired = advanceBurger(round, firstGuest + 1750)!;
  assert.equal(expired.counters.host!.assemblyJob, undefined);
  assert.equal(expired.counters.host!.assemblyReadyAt, undefined);
  assert.deepEqual(expired.counters.host!.burgers[1].layers, [{ ingredient: 'cheese' }]);
  assert.equal(action(expired, { type: 'discard', slot: 1 }, firstGuest + 1800).counters.host!.burgers[1].paper, false);

  round.counters.host!.orders[0].until = firstGuest + 45_000;
  const drafted = setUpgradeDraft(round, 11, firstGuest + 1550, ['sold:cheese', 'griddle', 'table']);
  const replaced = action(drafted, { type: 'choose-card', card: 'sold:cheese', level: 11 }, firstGuest + 2000);
  assert.equal(replaced.counters.host!.orders[0].id, 1);
  assert.equal(replaced.counters.host!.orders[0].reorderedAt, firstGuest + 2000);
  assert.equal(replaced.counters.host!.assemblyJob, undefined);
  assert.deepEqual(replaced.counters.host!.burgers[1].layers, [{ ingredient: 'cheese' }]);
  assert(readBurgerRound(JSON.parse(JSON.stringify(replaced))));
});

test('new games scale guest pressure and retain the selected difficulty through room snapshots', () => {
  const sceneSettings = { ...defaultMatchSettings, burger: 15 as const };
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const round = startBurgerRound(createXpRound(15, ['host', 'guest'], 4, 'race', difficulty), opening);
    const first = advanceBurger(round, firstGuest)!;
    const pressure = { easy: .7, normal: 1, hard: 1.3 }[difficulty];
    assert.equal(nextBurgerAt(first), firstGuest + Math.round(14_000 / pressure));
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
  assert.equal(endlessReserveMs, 3 * 60_000);
  assert.equal(endlessOrderReward(1, 1, 0, 105_000, 'normal'), 25_000);
  assert.equal(endlessOrderReward(1, 1, 0, 178_500, 'normal'), 1500);
  assert.equal(endlessOrderReward(1, 1, 0, 180_000, 'normal'), 0);
  assert(endlessOrderReward(8, .95, 31 * 60_000, 0, 'normal') < endlessOrderReward(8, .95, 20 * 60_000, 0, 'normal'));
  assert(endlessOrderReward(8, .95, 31 * 60_000, 0, 'normal') > 0);
});

test('an endless race syncs separate kitchen clocks and ranks sales after the last kitchen closes', () => {
  const lobby = lobbyMatch('burger', { ...defaultMatchSettings, burger: 'endless', burgerMode: 'race' });
  const snapshot = { ...lobby, type: 'snapshot', startedAt: opening - 5000, beginsAt: opening };
  const makeSnapshot = (burger: BurgerRound, finishedAt = 0) => ({ ...snapshot, burger, finishedAt });
  let round = startBurgerRound(createXpRound('endless', ['host', 'guest'], 3, 'race'), opening);
  const start = readMatchSnapshot(makeSnapshot(round), blankMatch, opening)!;
  const deadline = firstGuest + burgerEndlessOpeningMs;
  assert.equal(start.burgerMinutes, 'endless');
  assert.equal(start.burgerMode, 'race');
  assert.equal(burgerDeadline(start.burger!, 'host'), deadline);
  assert.equal(burgerDeadline(start.burger!, 'guest'), deadline);

  round = advanceBurger(round, firstGuest)!;
  const serveAt = firstGuest + 100;
  round.counters.host!.playUntil = serveAt + 178_500;
  round.end = round.counters.host!.playUntil;
  round.counters.host!.service = { burger: { paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], heatAt: 0, side: 0 } }] } };
  round = action(round, { type: 'serve', order: 1 }, serveAt);
  const hostDeadline = burgerDeadline(round, 'host');
  assert.equal(hostDeadline, serveAt + 180_000);
  assert.equal(round.counters.host!.feedback?.timeAdded, 1500);
  assert.equal(burgerDeadline(round, 'guest'), deadline);
  round = advanceBurger(round, deadline)!;
  const waiting = readMatchSnapshot(makeSnapshot(round), start, deadline)!;
  assert.equal(waiting.burger?.counters.guest?.closed, true);
  assert.equal(waiting.burger?.counters.host?.closed, undefined);
  assert.equal(waiting.finishedAt, 0);
  const finished = readMatchSnapshot(makeSnapshot(advanceBurger(round, hostDeadline)!, hostDeadline), waiting, hostDeadline)!;
  assert.equal(onlineMatchReport(finished, 'host')?.outcome, 'win');
  assert.equal(onlineMatchReport(finished, 'guest')?.outcome, 'loss');
});

test('order XP counts matching positions linearly and carries surplus into an authoritative card draft', () => {
  let round = startBurgerRound(createXpRound(5, ['host', 'guest'], 8), opening);
  round = advanceBurger(round, firstGuest)!;
  const patty = { ingredient: 'beef', source: 0, patty: { kind: 'beef', faces: [100, 100], heatAt: 0, side: 0 } } as const;
  const perfect: BurgerStack = { paper: true, bread: 'bun', top: true, packed: true,
    layers: [{ ...patty, patty: { ...patty.patty, faces: [100, 100] } }] };
  const partial: BurgerStack = { ...perfect, layers: [...perfect.layers, { ingredient: 'cheese' }] };
  const wrong: BurgerStack = { ...perfect, bread: 'rice', layers: [{ ingredient: 'cheese' }] };
  const first = round.counters.host!.orders[0];
  assert.equal(burgerOrderXp(first, perfect), 120);
  assert.equal(burgerOrderXp(first, { ...perfect, bread: 'rice' }), 50);
  assert.equal(burgerOrderXp(first, partial), 66.67);
  assert.equal(burgerOrderXp(first, wrong), 0);
  assert.equal(burgerOrderXp(first, perfect, { kind: 'cola', size: 'small' }), 66.67);
  assert.equal(burgerOrderXp({ ...first, drink: { kind: 'cola', size: 'small' } }, perfect, { kind: 'cola', size: 'small' }), 120);

  for (let i = 0; i < 4; i++) {
    const at = firstGuest + i * 14_000 + 100;
    round = advanceBurger(round, at) ?? round;
    const board = round.counters.host!;
    const order = board.orders[0];
    const heat = { rare: 70, medium: 100, well: 130 }[order.layers[0].cooked!];
    board.service = { burger: i ? { ...perfect, layers: [{ ...patty, patty: { ...patty.patty, faces: [heat, heat] } }] } : partial };
    round = action(round, { type: 'serve', order: order.id }, at);
    if (i === 2) {
      assert.equal(round.counters.host!.xp, 306.67);
      assert.equal(round.counters.host!.draft, undefined);
    }
  }
  const board = round.counters.host!;
  assert.equal(board.xp, 426.67);
  assert.equal(round.counters.guest!.xp, 0);
  assert.equal(burgerRank(board), 2);
  assert.equal(burgerLevel(board), 2);
  assert.equal(board.draft?.offers.length, 3);
  const restored = readBurgerRound(JSON.parse(JSON.stringify(round)))!;
  round = action(restored, { type: 'choose-card', card: board.draft!.offers[0], level: 2 }, firstGuest + 65_500);
  assert.equal(round.counters.host!.xp, 426.67);
  assert(Math.abs(burgerGrowthProgress(round.counters.host!) - 26.67 / 440) < 1e-10);
});

test('XP levels and pressure keep rising past eight while food and bonus caps remain', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(burgerXpToReach), [0, 400, 840, 1324, 1856.4]);
  for (const level of [2, 3, 8, 21, 50]) {
    const xp = burgerXpToReach(level);
    assert.equal(burgerRankFromXp(xp), level);
    assert.equal(burgerRankFromXp(xp - .01), level - 1);
    assert.equal(burgerLevel({ served: Math.ceil(xp / 100), xp }), level);
  }
  assert.equal(burgerDifficultyAtLevel(2).interval, 13_300);
  assert.equal(burgerDifficultyAtLevel(3).interval, 12_635);
  assert.deepEqual([1, 3, 5, 7, 9, 11, 200].map(level => {
    const { min, max } = burgerDifficultyAtLevel(level);
    return [min, max];
  }), [[1, 2], [1, 3], [1, 4], [1, 5], [2, 5], [3, 5], [3, 5]]);
  assert.deepEqual([2, 3, 5, 23, 100].map(level => burgerDifficultyAtLevel(level).drinks), [0, .2, .25, .7, .7]);
  assert.equal(burgerLevelSettings(50, 'hard').drinks, .7);
  assert.deepEqual([1, 2, 18, 19, 100].map(endlessBonusAtLevel), [20, 19, 3, 2, 2]);
  assert.equal(cardModifiers(['unlock:cola', 'unlock:soda', 'unlock:cheese', 'sold:soda']).revenue, 1.5);
});

test('unlock and sellout cards modify order XP and boosted snapshots remain valid', () => {
  for (const item of Object.keys(unlockLevels)) {
    assert.equal(cardModifiers([`unlock:${item}` as BurgerCard]).xp, item === 'cola' || item === 'soda' ? 1.12 : 1.07);
    assert.equal(cardModifiers([`sold:${item}` as BurgerCard]).xp, .95);
  }
  assert.equal(cardModifiers(['unlock:cola', 'unlock:soda', 'unlock:cheese', 'sold:soda']).xp, 1.26);
  assert.equal(cardModifiers(['unlock:cheese', ...Array<BurgerCard>(30).fill('sold:cheese')]).xp, .1);

  const round = startBurgerRound(createXpRound(5, ['host', 'guest'], 8), opening);
  const host = round.counters.host!;
  host.xp = 400;
  host.served = 4;
  host.cards = ['unlock:cheese'];
  const serveFirstGuest = (round: BurgerRound) => {
    const next = advanceBurger(round, firstGuest)!;
    const counter = next.counters.host!;
    const order = counter.orders[0];
    const layers: BurgerStack['layers'] = order.layers.map(({ ingredient }) => ingredient === 'beef'
      ? { ingredient, patty: { kind: ingredient, faces: [100, 100], side: 0, heatAt: 0 } }
      : { ingredient });
    counter.service = { burger: { paper: true, bread: order.bread, top: true, packed: true, layers } };
    return action(next, { type: 'serve', order: order.id }, firstGuest + 100);
  };
  const boosted = serveFirstGuest(round);
  assert.equal(boosted.counters.host!.xp, 528.4);
  assert.equal(boosted.counters.guest!.xp, 0);
  assert.equal(readBurgerRound(JSON.parse(JSON.stringify(boosted)))?.counters.host?.xp, 528.4);
  boosted.counters.host!.xp = 643;
  assert.equal(readBurgerRound(boosted), undefined);

  host.xp = 850;
  host.served = 9;
  host.cards.push('sold:cheese');
  const afterSellout = serveFirstGuest(round);
  assert.equal(afterSellout.counters.host!.xp, 972.4);
  assert.equal(readBurgerRound(JSON.parse(JSON.stringify(afterSellout)))?.counters.host?.xp, 972.4);
});
