import { baseOrderXp, burgerXpToReach, firstLevelXp, levelXpGrowth, roundBurgerXp } from '../games/burger/balance.ts';

const format = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
export function BurgerGrowthTable({ levels }: { levels: readonly number[] }) {
  return <section className="growth-section" aria-labelledby="shop-growth-title">
    <h2 id="shop-growth-title">매장 성장 레벨</h2>
    <p className="balance-note">완전히 일치하는 주문의 기본 보상은 {baseOrderXp} XP입니다. 일치 비율과 <a href="?">카드의 경험치 배율</a>을 곱해 실제 획득량을 정합니다. Lv. 1에서 {firstLevelXp} XP가 필요하고, 이후에는 직전 레벨 요구치의 {Math.round((levelXpGrowth - 1) * 100)}%씩 더 필요합니다.</p>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="매장 레벨 기준">
      <table className="growth-table" aria-labelledby="shop-growth-title">
        <thead><tr>{['매장 레벨', '도달 누적 XP', '이번 레벨 요구 XP', '다음 레벨 누적 XP', '내부 난이도', '도달 시 카드'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{levels.map(level => {
          const start = burgerXpToReach(level);
          const next = burgerXpToReach(level + 1);
          return <tr key={level}>
            <th scope="row">Lv. {format.format(level)}</th>
            <td>{format.format(start)} XP</td>
            <td>{format.format(roundBurgerXp(next - start))} XP</td>
            <td>{format.format(next)} XP</td>
            <td>{format.format(level)}단계</td>
            <td>{level === 1 ? '경기 시작' : '카드 1장 선택'}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="balance-note">버거번과 위치별 속재료, 주문 또는 제출에 음료가 있을 때의 음료 한 칸을 비교합니다. 빠졌거나 추가된 재료는 불일치로 세며, 굽기는 팁 판정에 사용합니다. 음료는 종류와 양이 모두 맞아야 일치합니다.</p>
    <p className="balance-note">레벨업 때 초과한 XP는 다음 구간에 이어집니다. 대전은 주방별, 협동은 공동 주방 단위로 계산하며 새 경기는 Lv. 1부터 시작합니다.</p>
  </section>;
}
