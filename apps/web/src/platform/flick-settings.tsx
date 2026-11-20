import { useTranslation } from 'react-i18next';
import { flickBoardSizes } from '../games/alkkagi/rules.ts';
import type { FlickSettings } from '../games/alkkagi/rules.ts';

export function FlickSettingsFields({ value, change }: { value: FlickSettings; change: (settings: FlickSettings) => void }) {
  const { t } = useTranslation();
  return <fieldset className="sichuan-settings">
    <legend>{t('physicsBoard')}</legend>
    <label>{t('flickStoneCount')}
      <select value={value.stones} onChange={event => change({ ...value, stones: Number(event.target.value) })}>
        {[3, 4, 5, 6, 7].map(count => <option key={count} value={count}>{count}</option>)}
      </select>
    </label>
    <label>{t('flickBoardSize')}
      <select value={value.board} onChange={event => change({ ...value, board: flickBoardSizes.find(size => size === event.target.value) ?? 'standard' })}>
        {flickBoardSizes.map(size => <option key={size} value={size}>{t('flickSize_' + size)}</option>)}
      </select>
    </label>
    <label className="choice">
      <input type="checkbox" checked={value.random} onChange={event => change({ ...value, random: event.target.checked })} />
      <span>{t('flickRandom')}</span>
    </label>
  </fieldset>;
}
