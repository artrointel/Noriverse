import { useTranslation } from 'react-i18next';
import { sichuanSizes, sichuanThemes, sichuanTimeLimits } from '../games/sichuan/options.ts';
import type { SichuanMode, SichuanSettings, SichuanSize } from '../games/sichuan/options.ts';
import { formatPlayTime } from './profiles.tsx';

export function SichuanModePicker({ value, change }: { value: SichuanMode; change: (value: SichuanMode) => void }) {
  const { t } = useTranslation();
  return <fieldset className="sichuan-settings"><legend>{t('sichuanOnlineMode')}</legend>
    {(['race', 'coop'] as const).map(mode => <label className="choice" key={mode}>
      <input type="radio" name="sichuan-online-mode" checked={value === mode} onChange={() => change(mode)} />
      <span><strong>{t('sichuanMode_' + mode)}</strong><small>{t('sichuanModeHelp_' + mode)}</small></span>
    </label>)}
  </fieldset>;
}

export function SichuanSettingsFields({ value, change }: { value: SichuanSettings; change: (value: SichuanSettings) => void }) {
  const { t } = useTranslation();
  return <fieldset className="sichuan-settings">
    <legend>{t('sichuanBoard')}</legend>
    <label>{t('sichuanArt')}
      <select value={value.theme} onChange={event => change({ ...value, theme: sichuanThemes.find(theme => theme === event.target.value) ?? 'random' })}>
        <option value="random">{t('sichuanRandom')}</option>
        {sichuanThemes.map(theme => <option key={theme} value={theme}>{t('sichuanTheme_' + theme)}</option>)}
      </select>
    </label>
    <label>{t('sichuanGrid')}
      <select value={value.size} onChange={event => change({ ...value, size: Number(event.target.value) as SichuanSize })}>
        {sichuanSizes.map(size => <option key={size} value={size}>{size} × {size} · {formatPlayTime(sichuanTimeLimits[size])}</option>)}
      </select>
    </label>
    <label>{t('sichuanDensity')} <small>{value.density === 'random' ? t('sichuanRandom') : value.density + '%'}</small>
      <input type="range" min={50} max={100} value={value.density === 'random' ? 80 : value.density}
        disabled={value.density === 'random'} onChange={event => change({ ...value, density: event.target.valueAsNumber })} />
    </label>
    <label className="choice"><input type="checkbox" checked={value.density === 'random'}
      onChange={event => change({ ...value, density: event.target.checked ? 'random' : 80 })} />
      <span>{t('sichuanRandomDensity')}</span></label>
    <label className="choice"><input type="checkbox" checked={value.obstacles}
      onChange={event => change({ ...value, obstacles: event.target.checked })} /><span>{t('sichuanObstacles')}</span></label>
    <label>{t('sichuanShuffleLimit')}
      <select value={value.shuffles} onChange={event => change({ ...value, shuffles: Number(event.target.value) })}>
        {[0, 1, 2, 3, 4, 5].map(count => <option key={count}>{count}</option>)}
      </select>
    </label>
    <label>{t('sichuanTimeLimit')}
      <input type="number" min={1} max={3600} step={1} placeholder={String(sichuanTimeLimits[value.size])} value={value.timeLimit ?? ''}
        onChange={event => {
          const seconds = event.target.valueAsNumber;
          change({ ...value, timeLimit: Number.isFinite(seconds) ? Math.min(3600, Math.max(1, Math.round(seconds))) : undefined });
        }} />
      <small>{t('sichuanRecommendedTime', { time: formatPlayTime(sichuanTimeLimits[value.size]) })}</small>
    </label>
  </fieldset>;
}
