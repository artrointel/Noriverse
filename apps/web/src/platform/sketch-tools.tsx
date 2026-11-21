import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { brushStyles, inkColors, integer, maxEraserWidth, maxInkWidth } from '../games/sketch/ink.ts';
import type { BoardEdit } from '../games/sketch/ink.ts';

const recentKey = 'noriverse.sketch.recentInk';
const hex = (color: number) => '#' + color.toString(16).padStart(6, '0');
const recentLimit = 7;

export function useRecentInk() {
  const [colors, setColors] = useState<number[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(recentKey) ?? '[]');
      return Array.isArray(saved) ? [...new Set(saved.filter(value => integer(value, 0, 0xffffff)))].slice(0, recentLimit) : [];
    } catch { return []; }
  });
  return {
    colors,
    remember(color: number) {
      if (colors[0] === color) return;
      const next = [color, ...colors.filter(item => item !== color)].slice(0, recentLimit);
      setColors(next);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* Storage is optional. */ }
    },
  };
}

export function SketchTools({ color, setColor, recent, brush, setBrush, width, setWidth, erasing, toggleEraser, canUndo, canRedo, edit, next }: {
  color: number; setColor: (value: number) => void; recent: number[];
  brush: number; setBrush: (value: number) => void; width: number; setWidth: (value: number) => void;
  erasing: boolean; toggleEraser: () => void;
  canUndo: boolean; canRedo: boolean; edit: (action: BoardEdit) => void; next?: () => void;
}) {
  const { t } = useTranslation();
  const swatches = (values: number[]) => values.map(tone => <button type="button" key={tone} className="sketch-swatch"
    aria-pressed={color === tone} aria-label={t('sketchInkColor', { value: hex(tone) })} title={hex(tone)} onClick={() => setColor(tone)}>
    <i style={{ background: hex(tone) }} /></button>);
  return <div className="sketch-toolbar">
    <div className="sketch-ink-row">
      <details className="sketch-palette">
        <summary className="button button-secondary"><i style={{ background: hex(color) }} />{t('sketchPalette')}</summary>
        <div className="surface sketch-palette-panel">
          <div className="sketch-colors" role="group" aria-label={t('sketchPalette')}>{swatches(inkColors)}</div>
          <label>{t('sketchCustomColor')} <input type="color" value={hex(color)} onChange={event =>
            setColor(Number.parseInt(event.currentTarget.value.slice(1), 16))} /></label>
        </div>
      </details>
      <div className="sketch-recent"><span>{t('sketchRecentColors')}</span>
        <div className="sketch-colors" role="group" aria-label={t('sketchRecentColors')}>
          {recent.length ? swatches(recent) : <small>{t('none')}</small>}
        </div>
      </div>
    </div>
    <div className="sketch-tools">
      <select aria-label={t('sketchBrushStyle')} value={erasing ? '' : brush} onChange={event => setBrush(Number(event.currentTarget.value))}>
        {erasing && <option value="" disabled>{t('sketchEraser')}</option>}
        {brushStyles.map((style, index) => <option key={style} value={index}>{t('sketchBrush_' + style)}</option>)}
      </select>
      <button type="button" className="button button-secondary sketch-eraser" aria-pressed={erasing} onClick={toggleEraser}>{t('sketchEraser')}</button>
      <label className="sketch-width-control"><span className="visually-hidden">{t(erasing ? 'sketchEraserWidth' : 'sketchWidth')}</span>
        <input type="range" min={1} max={erasing ? maxEraserWidth : maxInkWidth} value={width} onChange={event => setWidth(event.currentTarget.valueAsNumber)} />
        <output className="sketch-width-preview" aria-label={t('sketchWidthValue', { width })}>
          <i aria-hidden="true" data-eraser={erasing} style={{ width: width * (erasing ? .5 : 1), height: width * (erasing ? .5 : 1), background: erasing ? undefined : hex(color) }} />
          <span>{width}</span>
        </output>
      </label>
    </div>
    <div className="sketch-tools">
      <button type="button" className="button button-secondary" disabled={!canUndo} onClick={() => edit('undo')}>{t('sketchUndo')}</button>
      <button type="button" className="button button-secondary" disabled={!canRedo} onClick={() => edit('redo')}>{t('sketchRedo')}</button>
      <button type="button" className="button button-secondary" disabled={!canUndo} onClick={() => edit('clear')}>{t('sketchClear')}</button>
      {next && <button type="button" className="button button-secondary" onClick={next}>{t('sketchNext')}</button>}
    </div>
  </div>;
}
