import { Popup } from './popup.tsx';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { promotions } from '../games/chess/rules.ts';
import type { Promotion } from '../games/chess/rules.ts';

export function ChessPromotion({ canChoose, choose, cancel }: { canChoose: boolean; choose: (piece: Promotion) => void; cancel: () => void }) {
  const { t } = useTranslation();
  const queen = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { (canChoose ? queen.current : heading.current)?.focus({ preventScroll: true }); }, [canChoose]);
  return <Popup mode="board" className="result-card chess-promotion" aria-labelledby="chess-promotion-title" onDismiss={cancel}>
    <h2 id="chess-promotion-title" ref={heading} tabIndex={-1}>{t('chessPromotion')}</h2>
    <div className="panel-actions">{promotions.map(piece => <button type="button" key={piece}
      ref={piece === 'q' ? queen : undefined} className={'button ' + (piece === 'q' ? 'button-primary' : 'button-secondary')}
      disabled={!canChoose} onClick={() => choose(piece)}>{t('chessPiece_' + piece)}</button>)}</div>
    <button type="button" className="button button-secondary" onClick={cancel}>{t('cancel')}</button>
  </Popup>;
}
