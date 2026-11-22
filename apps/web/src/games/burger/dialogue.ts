import type { BurgerStack, Doneness, Ingredient, Order } from './rules.ts';

const replies = {
  refuse: ['먹기 싫어.. 아잉!!', 'I don’t wanna eat it. Aww!'],
  lotteria: ['(롯데리아 갈걸..)', '(Should’ve gone to Lotteria…)'],
  silence: ['......', '……'],
  kidding: ['지금 나랑 장난해 ?', 'Are you kidding me right now?'],
  neverAgain: ['(내가 다시는 안온다..)', '(I’m never coming back…)'],
  burnt: ['다 탄거 아니에요?', 'Isn’t this burned?'],
  crispy: ['바삭한 햄버거는 처음이야..', 'Never had a crunchy burger before…'],
  stomach: ['먹으면 배아플 것 같아..', 'This looks like a stomachache waiting to happen…'],
  raw: ['..덜 익은 것 아니에요?', '…Isn’t it undercooked?'],
  mold: ['뱃속에 곰팡이가 필 것 같아요..', 'I feel like this’ll grow mold in my stomach…'],
  manager: ['야! 사장 나오라 그래!', 'Hey! Get me the manager!'],
  stars: ['별점 5점은 못주겠다..', 'This isn’t getting five stars…'],
  free: ['이건 서비스로 주신거죠?', 'This one’s on the house, right?'],
  uneven: ['패티가 이~븐하게 익지 않았어요!', 'This patty isn’t cooked eee-venly!'],
  restroom: ['아.. 오줌 마려울 것 같은데..', 'Oh… now I think I need the restroom…'],
  allergy: ['나 탄산 알레르기 있는거 몰라?', 'Didn’t you know I’m allergic to fizzy drinks?'],
  warmCola: ['차라리 따듯한 콜라를 주지 그래?', 'Why not just serve me warm cola?'],
  thanks: ['서비스야? 땡큐!', 'On the house? Thanks!'],
  vegetables: ['채소가 하나도 없잖아!', 'There isn’t a single vegetable in here!'],
  hefty: ['묵직~하구만 기래', 'Now that’s a hefty burger.'],
  full: ['다 먹으면 배부를 것 같아..', 'I’ll be full after this…'],
  dry: ['먹다가 목 막힐 것 같아..', 'This is going to be hard to swallow…'],
  greasy: ['느끼한 햄버거 집이군..', 'This burger place sure likes its grease…'],
  shooHit: ['한 대만 더 때려줘!', 'Give it one more swing!'],
  shooPolice: ['경찰 불러줘요!', 'Somebody call the police!'],
  shooGlass: ['이거 방탄유리야 이 **아!', 'This glass is bulletproof, you **!'],
} as const;

export type BurgerLine = keyof typeof replies;
export const shooLines = ['shooHit', 'shooPolice', 'shooGlass'] as const;
export const isBurgerLine = (line: unknown): line is BurgerLine => typeof line === 'string' && Object.hasOwn(replies, line);
export const burgerLine = (line: BurgerLine, language: string) => replies[line][language.startsWith('ko') ? 0 : 1];
const questions = new Set<BurgerLine>(['kidding', 'burnt', 'raw', 'free', 'allergy', 'warmCola', 'thanks']);
const vegetables = new Set(['lettuce', 'onion', 'pickle', 'tomato']);

export function chooseBurgerDialogue(order: Order, burger: BurgerStack, drink: Order['drink'] | undefined,
  similarity: number, grades: readonly (Doneness | undefined)[], roll: number, thoughtRoll: number) {
  // An empty entry leaves the usual satisfaction reaction available at the counter.
  const candidates: (BurgerLine | undefined)[] = [undefined];
  const servedPatties = new Map<Ingredient, (Doneness | undefined)[]>();
  burger.layers.forEach((layer, i) => {
    if (layer.patty) servedPatties.set(layer.ingredient, [...(servedPatties.get(layer.ingredient) ?? []), grades[i]]);
  });
  const pairs = order.layers.flatMap(({ ingredient, cooked }) => cooked
    ? [{ wanted: cooked, actual: servedPatties.get(ingredient)?.shift() }] : []);
  if (similarity < .55) candidates.push('refuse', 'lotteria', 'silence', 'kidding', 'neverAgain');
  if (pairs.some(pair => pair.wanted === 'rare' && pair.actual === 'well')) candidates.push('burnt', 'crispy');
  if (pairs.some(pair => pair.wanted === 'well' && pair.actual === 'rare')) candidates.push('stomach', 'raw', 'mold');
  if (burger.bread !== order.bread || order.drink && drink && order.drink.kind !== drink.kind) candidates.push('manager', 'stars', 'free');
  if (pairs.some(pair => pair.wanted === 'well' && (pair.actual === 'medium' || pair.actual === 'rare'))) candidates.push('uneven');
  if (!order.drink && drink) candidates.push('restroom', 'allergy', 'warmCola', 'thanks');
  if (order.layers.some(layer => vegetables.has(layer.ingredient)) && !burger.layers.some(layer => vegetables.has(layer.ingredient))) candidates.push('vegetables');
  if (burger.layers.length > order.layers.length ||
    (order.layers.filter(layer => layer.cooked).length === 1 && burger.layers.filter(layer => layer.patty).length === 2)) candidates.push('hefty', 'full');
  if (order.drink && !drink) candidates.push('dry', 'greasy');
  const line = candidates[Math.floor(roll * candidates.length)];
  const thoughts = candidates.filter((item): item is BurgerLine => item !== undefined && item !== line && !questions.has(item));
  const thought = thoughts[Math.floor(thoughtRoll * (thoughts.length + 2))];
  return { line, thought };
}
