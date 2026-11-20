import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import chessPieces from '../assets/chess-staunton.png';
import { capturablePieces, chessLosses, chessPieceFrames } from '../games/chess/rules.ts';

export function ChessLosses({ history }: { history: number[] }) {
  const { t } = useTranslation();
  const losses = useMemo(() => chessLosses(history), [history]);
  return <section className="chess-losses" aria-label={t('chessLosses')}>
    <h2>{t('chessLosses')}</h2>
    {(['w', 'b'] as const).map(side => {
      const kinds = capturablePieces.filter(piece => losses[side][piece]);
      const total = kinds.reduce((sum, piece) => sum + losses[side][piece], 0);
      return <div className="chess-loss-row" key={side}>
        <strong>{t(side === 'w' ? 'white' : 'black')} <small>{t('chessLostCount', { count: total })}</small></strong>
        {kinds.length ? <ul>{kinds.map(piece => <li key={piece} aria-label={t('chessLostPiece', { piece: t('chessPiece_' + piece), count: losses[side][piece] })}>
          <span aria-hidden="true" style={{ backgroundImage: `url(${chessPieces})`,
            backgroundPosition: `${chessPieceFrames[piece] * 20}% ${side === 'w' ? 0 : 100}%` }} />
          <b aria-hidden="true">×{losses[side][piece]}</b>
        </li>)}</ul> : <small className="muted">{t('chessNoneLost')}</small>}
      </div>;
    })}
  </section>;
}
