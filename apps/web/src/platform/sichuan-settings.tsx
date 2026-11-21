import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultHints, defaultObstacleDensity, defaultSichuanTileDensity, maxSichuanObstacleDensity, maxSichuanTileDensity, minSichuanTileDensity, sichuanObstacleCount, sichuanSizes, sichuanThemes, sichuanTileCount, sichuanTimeLimits } from '../games/sichuan/options.ts';
import type { SichuanMode, SichuanSettings, SichuanSize } from '../games/sichuan/options.ts';
import { formatPlayTime } from './game-time.tsx';
import { SettingsSection, SettingsSelect } from './settings-fields.tsx';

export function SichuanModePicker({ value, change }: { value: SichuanMode; change: (value: SichuanMode) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return <SettingsSection title={t('sichuanOnlineMode')}>
    <fieldset className="setup-options" aria-label={t('sichuanOnlineMode')} aria-describedby={id + '-help'}>
      {(['race', 'coop'] as const).map(mode => <label className="setup-option" key={mode}>
        <input type="radio" name={id} checked={value === mode} onChange={() => change(mode)} />
        <span>{t('sichuanMode_' + mode)}</span>
      </label>)}
    </fieldset>
    <p className="setup-help" id={id + '-help'}>{t('sichuanModeHelp_' + value)}</p>
  </SettingsSection>;
}

function CellAllocation({ size, density, obstacles }: { size: SichuanSize; density: number; obstacles: number }) {
  const { t } = useTranslation();
  const total = size ** 2;
  const tiles = sichuanTileCount(size, density);
  const blocks = sichuanObstacleCount(size, density, obstacles);
  const segments = [
    { kind: 'tiles', count: tiles, label: t('sichuanTileCells', { count: tiles }) },
    { kind: 'blocks', count: blocks, label: t('sichuanBlockCells', { count: blocks }) },
    { kind: 'empty', count: total - tiles - blocks, label: t('sichuanEmptyCells', { count: total - tiles - blocks }) },
  ];
  return <div className="setup-allocation">
    <div className="setup-allocation-bar" aria-hidden="true">{segments.filter(({ count }) => count > 0).map(({ kind, count }) =>
      <span key={kind} data-kind={kind} style={{ flex: count }} />)}</div>
    <ul>{segments.map(({ kind, label }) => <li key={kind} data-kind={kind}>{label}</li>)}</ul>
  </div>;
}

export function SichuanSettingsFields({ value, change, onValidity }: {
  value: SichuanSettings; change: (value: SichuanSettings) => void; onValidity: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const manualDensity = useRef(value.density === 'random' ? defaultSichuanTileDensity : value.density);
  const [time, setTime] = useState(() => value.timeLimit?.toString() ?? '');
  const [timeValid, setTimeValid] = useState(true);
  const obstacleMax = maxSichuanObstacleDensity(value.size, value.density);
  const obstacleDensity = value.obstacles ? Math.min(value.obstacleDensity ?? defaultObstacleDensity, obstacleMax) : 0;
  const random = value.density === 'random';
  const recommended = sichuanTimeLimits[value.size];
  const obstacleLabel = obstacleDensity === 0 ? t('none') : random ? t('sichuanObstacleUpTo', { percent: obstacleDensity }) : `${obstacleDensity}%`;

  return <>
    <SettingsSection title={t('setupBoard')}>
      <SettingsSelect label={t('sichuanGrid')} value={value.size} change={size => change({ ...value, size: Number(size) as SichuanSize })}>
        {sichuanSizes.map(size => <option key={size} value={size}>{size} × {size}</option>)}
      </SettingsSelect>
      <SettingsSelect label={t('sichuanArt')} value={value.theme}
        change={key => change({ ...value, theme: sichuanThemes.find(theme => theme === key) ?? 'random' })}>
        <option value="random">{t('sichuanRandom')}</option>
        {sichuanThemes.map(theme => <option key={theme} value={theme}>{t('sichuanTheme_' + theme)}</option>)}
      </SettingsSelect>
    </SettingsSection>
    <SettingsSection title={t('sichuanLayout')}>
      <div className="setup-density">
        <div className="setup-density-heading">
          {random ? <span>{t('sichuanDensity')}</span> : <label htmlFor={id + '-density'}>{t('sichuanDensity')}</label>}
          {!random && <output htmlFor={id + '-density'} aria-hidden="true">{value.density}%</output>}
          <label className="setup-inline-toggle"><input type="checkbox" id={id + '-random'} checked={random} aria-label={t('sichuanRandomDensity')}
            onChange={event => change({ ...value, density: event.target.checked ? 'random' : manualDensity.current })} />{t('sichuanRandom')}</label>
        </div>
        {random ? <p className="setup-help">{t('sichuanRandomDensityHelp', { min: minSichuanTileDensity, max: maxSichuanTileDensity })}</p>
          : <input type="range" id={id + '-density'} min={minSichuanTileDensity} max={maxSichuanTileDensity} value={value.density} aria-valuetext={`${value.density}%`}
            onChange={event => {
              manualDensity.current = event.target.valueAsNumber;
              change({ ...value, density: manualDensity.current });
            }} />}
      </div>
      <div className="setup-density">
        <div className="setup-density-heading">
          <label htmlFor={id + '-obstacles'}>{t('sichuanObstacleDensity')}</label>
          <output htmlFor={id + '-obstacles'} aria-hidden="true">{obstacleLabel}</output>
        </div>
        <input type="range" id={id + '-obstacles'} min={0} max={obstacleMax} value={obstacleDensity} disabled={!obstacleMax}
          aria-describedby={id + '-obstacle-help'} aria-valuetext={obstacleLabel} onChange={event => {
            const density = event.target.valueAsNumber;
            change({ ...value, obstacles: density > 0, obstacleDensity: density });
          }} />
        <p className="setup-help" id={id + '-obstacle-help'}>{t(obstacleMax ? 'sichuanObstacleMax' : 'sichuanObstaclesNoSpace', { max: obstacleMax })}</p>
      </div>
      {typeof value.density === 'number' && <CellAllocation size={value.size} density={value.density} obstacles={obstacleDensity} />}
    </SettingsSection>
    <SettingsSection title={t('sichuanTimeAndTools')}>
      <div className="setup-row">
        <div className="setup-field-label"><label htmlFor={id + '-time'}>{t('sichuanTimeLimit')}</label>
          <small id={id + '-time-help'} className={timeValid ? undefined : 'setup-error'}>
            {timeValid ? t('sichuanRecommendedTime', { time: formatPlayTime(recommended) }) : t('setupTimeInvalid')}
          </small>
        </div>
        <input type="number" id={id + '-time'} min={1} max={3600} step={1} inputMode="numeric" placeholder={String(recommended)}
          value={time} aria-invalid={!timeValid} aria-describedby={id + '-time-help'}
          onChange={event => {
            const field = event.target;
            const valid = !field.validity.badInput && (field.value === '' || field.validity.valid);
            setTime(field.value);
            setTimeValid(valid);
            onValidity(valid);
            if (valid) change({ ...value, timeLimit: field.value === '' ? undefined : field.valueAsNumber });
          }} />
      </div>
      <SettingsSelect label={t('sichuanHintLimit')} value={value.hints ?? defaultHints}
        change={hints => change({ ...value, hints: Number(hints) })}>
        {[0, 1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count === 0 ? t('none') : count}</option>)}
      </SettingsSelect>
      <SettingsSelect label={t('sichuanShuffleLimit')} value={value.shuffles} change={shuffles => change({ ...value, shuffles: Number(shuffles) })}>
        {[0, 1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count === 0 ? t('none') : count}</option>)}
      </SettingsSelect>
    </SettingsSection>
  </>;
}
