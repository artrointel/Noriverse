import { useTranslation } from 'react-i18next';
import { flickBoardSizes } from '../games/alkkagi/rules.ts';
import type { FlickPower, FlickSettings } from '../games/alkkagi/rules.ts';
import { SettingsSection, SettingsSelect } from './settings-fields.tsx';

export function FlickSettingsFields({ value, change, power, changePower }: {
  value: FlickSettings; change: (settings: FlickSettings) => void; power: FlickPower; changePower: (power: FlickPower) => void;
}) {
  const { t } = useTranslation();
  return <SettingsSection title={t('setupBoardAndStones')}>
    <SettingsSelect label={t('flickBoardSize')} value={value.board}
      change={board => change({ ...value, board: flickBoardSizes.find(size => size === board) ?? 'standard' })}>
      {flickBoardSizes.map(size => <option key={size} value={size}>{t('flickSize_' + size)}</option>)}
    </SettingsSelect>
    <SettingsSelect label={t('flickStoneCount')} value={value.stones} change={stones => change({ ...value, stones: Number(stones) })}>
      {[3, 4, 5, 6, 7].map(count => <option key={count} value={count}>{count}</option>)}
    </SettingsSelect>
    <label className="setup-row"><span className="setup-field-label">{t('flickRandom')}</span>
      <input className="setup-switch" type="checkbox" role="switch" checked={value.random}
        onChange={event => change({ ...value, random: event.target.checked })} />
    </label>
    <SettingsSelect label={t('force')} value={power} change={value => changePower(value === '1.35' ? 1.35 : 1)}>
      <option value="1">{t('standard')}</option><option value="1.35">{t('fast')}</option>
    </SettingsSelect>
  </SettingsSection>;
}
