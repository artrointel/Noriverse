import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cardModifiers, cardXpPercent, minimumXpMultiplier, readBurgerCard, soldOutCardWeight } from '../games/burger/cards.ts';
import handbook from '../../../../docs/burger-tycoon.md?raw';
import { BurgerDifficultyTable } from './burger-difficulty.tsx';
import { BurgerGrowthTable } from './burger-growth.tsx';
import { BurgerRewards } from './burger-rewards.tsx';
import './burger-cards.css';

const section = handbook.split('## 전체 카드 설명')[1]?.split('\n## ')[0] ?? '';
const cards = section.split('\n').flatMap(line => {
  const [, category, name, code, condition, effect, , , limit] = line.split('|').map(cell => cell.trim());
  const id = code?.replace(/^`|`$/g, '');
  if (!readBurgerCard(id) || !category || !name || !condition || !effect || !limit) return [];
  const revenue = Math.round((cardModifiers([id]).revenue - 1) * 100);
  return [{ category, name, id, condition, effect, limit, revenue, xp: cardXpPercent(id) }];
});
const categories = [...new Set(cards.map(card => card.category))];
const view = new URLSearchParams(location.search).get('view');
const balanceLevels = Array.from({ length: 20 }, (_, index) => index + 1);
const sources = [
  { name: '등장 조건·수익·경험치 보정', path: 'apps/web/src/games/burger/cards.ts' },
  { name: '조리·설비 효과', path: 'apps/web/src/games/burger/rules.ts' },
  { name: '카드 설명 표', path: 'docs/burger-tycoon.md' },
];
const difficultySources = [
  { name: '난이도 단계·주문 생성', path: 'apps/web/src/games/burger/rules.ts' },
  { name: '무한 모드·난이도 배율', path: 'apps/web/src/games/burger/balance.ts' },
  { name: '난이도 기획 문서', path: 'docs/burger-tycoon.md' },
];
const growthSources = [
  { name: '매장 레벨업·난이도 곡선', path: 'apps/web/src/games/burger/balance.ts' },
  { name: '주문 유사도·경험치 집계', path: 'apps/web/src/games/burger/rules.ts' },
  { name: '성장 기획 문서', path: 'docs/burger-tycoon.md' },
];
const rewardSources = [
  { name: '메뉴 정가·보상 수치', path: 'apps/web/src/games/burger/balance.ts' },
  { name: '주문 판정·정산 흐름', path: 'apps/web/src/games/burger/rules.ts' },
  { name: '손님 대사 조건', path: 'apps/web/src/games/burger/dialogue.ts' },
];
const modifierText = (value: number) => value > 0 ? `+${value}%` : value < 0 ? `−${Math.abs(value)}%` : '0%';

function CardBalanceTable() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [order, setOrder] = useState('document');
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = cards.filter(card => {
    const search = [card.name, card.id, card.condition, card.effect].join(' ').toLowerCase();
    return (!category || card.category === category) && terms.every(term => search.includes(term));
  });
  if (order !== 'document') visible.sort((a, b) => order === 'highest' ? b.revenue - a.revenue : a.revenue - b.revenue);

  return <section aria-label="카드 밸런스">
    <p className="balance-note">정산액과 경험치 보정은 게임 코드에서 불러옵니다. 선택한 카드의 경험치 보정률을 합산하며 최종 배율은 기본의 {minimumXpMultiplier * 100}% 이상입니다.</p>
    <p className="balance-note">매진 카드의 추첨 가중치는 일반 카드 한 장의 {soldOutCardWeight * 100}%입니다. 다시 뽑기에도 같은 가중치를 적용합니다.</p>
    <div className="filters">
      <label>카드 검색<input type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="카드 이름, ID, 효과" /></label>
      <label>분류<select value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">전체</option>
        {categories.map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>정렬<select value={order} onChange={event => setOrder(event.target.value)}>
        <option value="document">문서 순서</option>
        <option value="highest">정산액 보정 높은 순</option>
        <option value="lowest">정산액 보정 낮은 순</option>
      </select></label>
      <output aria-live="polite">{visible.length} / {cards.length}장</output>
    </div>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="카드 목록">
      <table className="card-table" aria-label="햄버거 타이쿤 카드 속성">
        <thead><tr>{['카드', '분류', '등장 조건', '효과', '정산액 보정', 'XP 보정', '선택 한도'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{visible.map(card => <tr key={card.id}>
          <th scope="row">{card.name}<code>{card.id}</code></th>
          <td>{card.category}</td>
          <td>{card.condition}</td>
          <td>{card.effect}</td>
          <td className="modifier" data-change={Math.sign(card.revenue)}>{modifierText(card.revenue)}</td>
          <td className="modifier" data-change={Math.sign(card.xp)}>{modifierText(card.xp)}</td>
          <td>{card.limit}</td>
        </tr>)}</tbody>
      </table>
      {!visible.length && <p className="empty" role="status">{cards.length ? '검색 조건에 맞는 카드가 없습니다.' : '기획 문서에서 카드 표를 찾지 못했습니다.'}</p>}
    </div>
  </section>;
}

function CardBalancePage() {
  const [copyFeedback, setCopyFeedback] = useState('');
  const showDifficulty = view === 'difficulty';
  const showGrowth = view === 'growth';
  const showRewards = view === 'rewards';
  const currentSources = showGrowth ? growthSources : showDifficulty ? difficultySources : showRewards ? rewardSources : sources;

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setCopyFeedback(`${path} 복사됨`);
    } catch {
      setCopyFeedback('복사할 경로를 직접 선택해 주세요.');
    }
  }

  return <main className="balance">
    <nav><a href={import.meta.env.BASE_URL}>← 놀이버스</a></nav>
    <header className="balance-header">
      <h1>햄버거 타이쿤 밸런스</h1>
      <nav className="balance-tabs" aria-label="밸런스 항목">
        <a href="?" aria-current={currentSources === sources ? 'page' : undefined}>카드</a>
        <a href="?view=difficulty" aria-current={showDifficulty ? 'page' : undefined}>내부 난이도</a>
        <a href="?view=growth" aria-current={showGrowth ? 'page' : undefined}>성장·경험치</a>
        <a href="?view=rewards" aria-current={showRewards ? 'page' : undefined}>손님 보상</a>
      </nav>
    </header>
    {showGrowth ? <BurgerGrowthTable levels={balanceLevels} /> : showDifficulty ? <BurgerDifficultyTable levels={balanceLevels} />
      : showRewards ? <BurgerRewards /> : <CardBalanceTable />}
    <section className="sources" aria-labelledby="sources-title">
      <h2 id="sources-title">편집할 파일</h2>
      <ul>{currentSources.map(({ name, path }) => <li key={path}>
        <div><strong>{name}</strong><code>{path}</code></div>
        <button type="button" aria-label={`${name} 경로 복사`} onClick={() => void copyPath(path)}>경로 복사</button>
      </li>)}</ul>
      <output aria-live="polite">{copyFeedback}</output>
    </section>
  </main>;
}

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<CardBalancePage />);
