import { burgerCashPayout, burgerMenuPrice, burgerPrices, burgerRewardRates } from '../games/burger/balance.ts';
import { cardModifiers } from '../games/burger/cards.ts';
import { judgeOrder } from '../games/burger/rules.ts';
import type { BurgerStack, Order } from '../games/burger/rules.ts';

const rates = burgerRewardRates;
const { base, layer, patty, drinks } = burgerPrices;
const percent = (rate: number) => `${Math.round(100 * rate)}%`;
const order: Order = {
  id: 1, guest: 0, at: 0, until: 1, bread: 'bun',
  layers: [{ ingredient: 'beef', cooked: 'medium' }, { ingredient: 'cheese' }],
  drink: { kind: 'cola', size: 'medium' }, price: burgerMenuPrice(2, 1),
};
const burger: BurgerStack = {
  paper: true, bread: 'bun', top: true, packed: true,
  layers: [{ ingredient: 'beef', patty: { kind: 'beef', faces: [100, 100], side: 0, heatAt: 0 } }, { ingredient: 'cheese' }],
};
const slightlyDarker: BurgerStack = { ...burger, layers: [
  { ingredient: 'beef', patty: { kind: 'beef', faces: [130, 130], side: 0, heatAt: 0 } }, { ingredient: 'cheese' },
] };
const perfect = judgeOrder(order, burger, order.drink);
const cheeseRevenue = cardModifiers(['unlock:cheese']).revenue;
const examples = [
  { label: '버거·음료·굽기 모두 일치', result: perfect },
  { label: '패티 굽기만 다름', result: judgeOrder(order, slightlyDarker, order.drink) },
  { label: '치즈 누락', result: judgeOrder(order, { ...burger, layers: burger.layers.slice(0, 1) }, order.drink) },
  { label: '콜라 사이즈만 다름', result: judgeOrder(order, burger, { kind: 'cola', size: 'small' }) },
  { label: '음료 누락', result: judgeOrder(order, burger) },
  { label: `모두 일치 · 정산액 +${percent(cheeseRevenue - 1)} · 피버`, result: perfect, revenue: cheeseRevenue, fever: true },
];

export function BurgerRewards() {
  return <>
    <section className="progression" aria-labelledby="menu-price-title">
      <h2 id="menu-price-title">메뉴 정가</h2>
      <ul>
        <li>버거 정가는 {base} + 속재료 개수 × {layer} + 패티 장수 × {patty}입니다. 패티는 속재료 개수에도 포함되므로 한 장당 {layer + patty}가 붙습니다.</li>
        <li>음료 정가는 스몰 {drinks.small}, 미디움 {drinks.medium}, 라지 {drinks.large}입니다. 콜라와 사이다는 같은 가격입니다.</li>
      </ul>
    </section>
    <section className="progression" aria-labelledby="payout-title">
      <h2 id="payout-title">기본 정산액과 팁</h2>
      <ol>
        <li>버거와 음료를 각각 채점합니다. 해당 항목이 정확하면 정가를 지급합니다. 일부만 맞으면 정가 × {rates.partial} × 유사도<sup>{rates.partialPower}</sup>를 반올림합니다. 빠진 음료나 주문에 없던 음료의 판매액은 0입니다.</li>
        <li>버거 유사도는 같은 위치의 속재료와 위·아래 빵이 일치한 수를 주문과 제출 각각의 전체 층수의 기하평균으로 나눈 값입니다. 음료 유사도는 종류 일치 {percent(rates.drinkKind)}와 사이즈 일치 {percent(rates.drinkSize)}를 더합니다.</li>
        <li>버거와 음료 정산액을 합쳐 카드의 정산액 배율을 곱하고 반올림한 뒤, 이미 피버 중이면 {rates.fever}배로 지급합니다. 주문이 피버를 발동시켰다면 다음 주문부터 적용합니다.</li>
        <li>빵·속재료 순서·음료·모든 패티의 굽기가 일치하면 주문 정가의 {percent(rates.perfectTip)}를 반올림해 팁으로 더합니다. 굽기만 다르면 정가와 콤보는 유지되고 이 팁이 빠집니다. 팁에는 카드와 피버 배율을 적용하지 않습니다.</li>
      </ol>
    </section>
    <section className="progression" aria-labelledby="payout-example-title">
      <h2 id="payout-example-title">치즈버거와 미디움 콜라 주문 예시</h2>
      <p className="balance-note">버거 {order.price} + 음료 {drinks.medium} = 정가 {order.price + drinks.medium}. 일반 정산을 기준으로 계산합니다.</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="payout-example-title">
        <table className="reward-table" aria-labelledby="payout-example-title">
          <thead><tr><th scope="col">제출 상황</th><th scope="col">기본 정산액</th><th scope="col">팁</th><th scope="col">최종 입금</th></tr></thead>
          <tbody>{examples.map(({ label, result, revenue = 1, fever = false }) => <tr key={label}>
            <th scope="row">{label}</th>
            <td>{result.money}</td>
            <td>{result.tip}</td>
            <td>{burgerCashPayout(result.money, revenue, fever, result.tip)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="progression" aria-labelledby="payout-exception-title">
      <h2 id="payout-exception-title">특수 정산</h2>
      <ul>
        <li>다른 빵이나 종류가 다른 음료를 주면 손님이 무료 제공 대사를 할 수 있습니다. 이때 음식은 전달되며 매출과 경험치는 0이고 손님은 같은 주문을 기다립니다.</li>
        <li>주문하지 않은 음료를 받은 손님이 감사 대사를 하면 팁 {rates.extraDrinkTip}점을 더합니다.</li>
        <li>빗자루로 손님이 퇴장하면 {percent(rates.shooPayment)} 확률로 정가를 지불합니다. 팁과 대기 만료 차감은 적용되지 않습니다.</li>
        <li>대기시간이 만료되면 주문 정가의 {percent(rates.expirationPenalty)}를 올림해 차감합니다.</li>
      </ul>
    </section>
  </>;
}
