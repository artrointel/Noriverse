export function cardsPerPage(columns: number, cardHeight: number, gap: number, viewportHeight: number) {
  const available = viewportHeight - 220;
  const rows = Math.max(1, Math.floor((available + gap) / (cardHeight + gap)));
  return Math.max(1, columns) * rows;
}

export function pageNumbers(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'gap', total];
  if (current >= total - 3) return [1, 'gap', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'gap', current - 1, current, current + 1, 'gap', total];
}
