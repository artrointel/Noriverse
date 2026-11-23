import { useState } from 'react';
import { burgerDifficulties, burgerXpToReach, defaultBurgerDifficulty, endlessProgression, endlessReserveMs, pressureByDifficulty, readBurgerDifficulty } from '../games/burger/balance.ts';
import { burgerEndlessOpeningMs, burgerGuestPatience, burgerLevelSettings } from '../games/burger/rules.ts';

const names = { easy: '쉬움', normal: '보통', hard: '어려움' } as const;
const format = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const seconds = (ms: number) => format.format(ms / 1000);
const percent = (value: number) => `${format.format(value * 100)}%`;

export function BurgerDifficultyTable({ levels }: { levels: readonly number[] }) {
  const [difficulty, setDifficulty] = useState(defaultBurgerDifficulty);
  const { pressureStartsAt, pressurePerMinute } = endlessProgression;

  return <>
    <p className="balance-note">표에는 1~20단계를 표시합니다. 게임에서는 상한 없이 <a href="?view=growth">매장 경험치</a>와 함께 오릅니다. 단계마다 방문 간격과 대기시간 범위가 5% 줄어듭니다.</p>
    <div className="filters">
      <label>선택 난이도<select value={difficulty} onChange={event => setDifficulty(readBurgerDifficulty(event.target.value) ?? defaultBurgerDifficulty)}>
        {burgerDifficulties.map(value => <option key={value} value={value}>{names[value]} · {pressureByDifficulty[value]}배</option>)}
      </select></label>
      <p className="balance-note">카드 보정 및 무한 모드 시간 보정 적용 전</p>
    </div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="단계별 난이도">
      <table aria-label="햄버거 타이쿤 내부 난이도">
        <thead><tr>{['난이도 단계', '도달 누적 XP', '방문 간격', '대기시간 범위', '속재료 목표', '음료 확률', '무한 추가 시간'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{levels.map(level => {
          const { interval, patience, pressure, jitter, min, max, drinks, endlessBonusSeconds } = burgerLevelSettings(level, difficulty);
          return <tr key={level}>
            <th scope="row">{level}단계</th>
            <td>{format.format(burgerXpToReach(level))} XP</td>
            <td>{seconds(interval)}초</td>
            <td>{seconds(burgerGuestPatience(patience, pressure, 0, jitter))}~{seconds(burgerGuestPatience(patience, pressure, 1 - Number.EPSILON, jitter))}초</td>
            <td>{min === max ? min : `${min}~${max}`}개</td>
            <td>{percent(drinks)}</td>
            <td>{endlessBonusSeconds}초</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="balance-note">음료 확률은 해금된 음료가 있을 때 적용합니다. 속재료 목표는 카드 보정 전입니다.</p>
    <section className="progression" aria-labelledby="endless-balance-title">
      <h2 id="endless-balance-title">무한 모드 시간 보정</h2>
      <ul>
        <li>영업 시작 시 {seconds(burgerEndlessOpeningMs)}초를 받고, 남은 시간은 최대 {seconds(endlessReserveMs)}초까지 비축합니다.</li>
        <li>영업 {pressureStartsAt}분 이후 분당 {percent(pressurePerMinute)}p씩 시간 압박 계수가 올라갑니다. 방문 간격과 대기시간이 줄고, 큰 주문과 음료 주문이 늘어납니다.</li>
        <li>주문 정산으로 얻는 추가 시간은 정산 직전 난이도 1단계에서 20초로 시작합니다. 단계마다 1초씩 줄며 19단계부터는 2초입니다.</li>
      </ul>
    </section>
  </>;
}
