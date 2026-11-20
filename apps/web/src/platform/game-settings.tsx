import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameId } from '../games/scenes.ts';
import type { MatchSettings } from '../games/match-settings.ts';
import { isTurnLimit, maxTurnLimit, turnLimits } from '../games/turn-clock.ts';
import { omokOverlineRules } from '../games/omok/rules.ts';
import { defaultHints, defaultObstacleDensity, maxSichuanObstacleDensity, sichuanTimeLimits } from '../games/sichuan/options.ts';
import { FlickSettingsFields } from './flick-settings.tsx';
import { SichuanModePicker, SichuanSettingsFields } from './sichuan-settings.tsx';
import { games } from './game-catalog.ts';
import { formatPlayTime } from './profiles.tsx';
import { SettingsSection, SettingsSelect } from './settings-fields.tsx';

export function GameFeature({ game, heading, children, overlay }: { game: GameId; heading: string; children?: ReactNode; overlay?: ReactNode }) {
  const { t } = useTranslation();
  const entry = games[game];
  return <section className="match-feature" aria-label={heading}>
    <div className="match-feature-cover" key={game}>
      <img src={entry.art} alt="" width="880" height="587" decoding="async" />
      <div className="match-feature-copy">
        <div className="game-tags"><span>{t(entry.category)}</span><span>{t(entry.players)}</span></div>
        <h2>{t(game)}</h2>
        <p>{t(entry.description)}</p>
      </div>
      {overlay}
    </div>
    {children}
  </section>;
}

function TurnLimitSettings({ limit, change, onValidity }: {
  limit: number; change: (limit: number) => void; onValidity: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [custom, setCustom] = useState(!turnLimits.some(value => value === limit));
  const [seconds, setSeconds] = useState(custom ? String(limit) : '');
  const validSeconds = Number(seconds) > 0 && isTurnLimit(Number(seconds));
  return <SettingsSection title={t('setupClock')}>
    <SettingsSelect label={t('turnLimit')} description={limit > 0 || custom ? t('turnLimitHelp') : undefined}
      value={custom ? 'custom' : limit} change={value => {
        setCustom(value === 'custom');
        onValidity(value !== 'custom' || validSeconds);
        if (value !== 'custom') change(Number(value));
        else if (validSeconds) change(Number(seconds));
      }}>
      {turnLimits.map(value => <option key={value} value={value}>{t(value ? 'turnSeconds' : 'unlimitedTurns', { count: value })}</option>)}
      <option value="custom">{t('customTurnLimit')}</option>
    </SettingsSelect>
    {custom && <div className="setup-row">
      <div className="setup-field-label"><label htmlFor={id}>{t('customTurnSeconds')}</label>
        {!validSeconds && <small className="setup-error" id={id + '-help'}>{t('setupTimeInvalid')}</small>}</div>
      <input id={id} type="number" min={1} max={maxTurnLimit} step={1} inputMode="numeric" value={seconds}
        aria-invalid={!validSeconds} aria-describedby={!validSeconds ? id + '-help' : undefined}
        onChange={event => {
          const value = event.target.valueAsNumber;
          const valid = value > 0 && isTurnLimit(value);
          setSeconds(event.target.value);
          onValidity(valid);
          if (valid) change(value);
        }} />
    </div>}
  </SettingsSection>;
}

export function GameRulesEditor({ game, settings, change, online, onValidity }: {
  game: GameId; settings: MatchSettings; change: (settings: MatchSettings) => void;
  online: boolean; onValidity: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  if (game === 'sichuan') return <>
    {online && <SichuanModePicker value={settings.puzzle.mode} change={mode => change({ ...settings, puzzle: { ...settings.puzzle, mode } })} />}
    <SichuanSettingsFields value={settings.puzzle.settings} onValidity={onValidity}
      change={value => change({ ...settings, puzzle: { ...settings.puzzle, settings: value } })} />
  </>;

  return <>
    <TurnLimitSettings limit={settings.turnLimit} onValidity={onValidity} change={turnLimit => change({ ...settings, turnLimit })} />
    {game === 'omok' && <SettingsSection title={t('setupBoardRules')}>
      <SettingsSelect label={t('rule33')} description={t('rule33Help')} value={settings.allowDoubleThree ? 'allow' : 'ban'}
        change={value => change({ ...settings, allowDoubleThree: value === 'allow' })}>
        <option value="allow">{t('allow33')}</option><option value="ban">{t('ban33')}</option>
      </SettingsSelect>
      <SettingsSelect label={t('overlineRule')} value={settings.overline}
        change={value => change({ ...settings, overline: omokOverlineRules.find(rule => rule === value) ?? settings.overline })}>
        {omokOverlineRules.map(rule => <option value={rule} key={rule}>{t(rule)}</option>)}
      </SettingsSelect>
    </SettingsSection>}
    {game === 'physics' && <FlickSettingsFields value={settings.flick} change={flick => change({ ...settings, flick })}
      power={settings.power} changePower={power => change({ ...settings, power })} />}
  </>;
}

export function GameRulesSummary({ game, settings }: { game: GameId; settings: MatchSettings }) {
  const { t } = useTranslation();
  const entries: [string, string][] = [];
  if (game === 'sichuan') {
    const { mode, settings: puzzle } = settings.puzzle;
    const obstacleDensity = Math.min(puzzle.obstacleDensity ?? defaultObstacleDensity, maxSichuanObstacleDensity(puzzle.size, puzzle.density));
    entries.push([t('gameMode'), t('sichuanMode_' + mode)], [t('sichuanArt'), t(puzzle.theme === 'random' ? 'sichuanRandom' : 'sichuanTheme_' + puzzle.theme)],
      [t('sichuanGrid'), `${puzzle.size} × ${puzzle.size}`], [t('sichuanDensity'), puzzle.density === 'random' ? t('sichuanRandom') : puzzle.density + '%'],
      [t('sichuanObstacleDensity'), !puzzle.obstacles || obstacleDensity === 0 ? t('none')
        : puzzle.density === 'random' ? t('sichuanObstacleUpTo', { percent: obstacleDensity }) : `${obstacleDensity}%`],
      [t('matchTimeLimit'), formatPlayTime(puzzle.timeLimit ?? sichuanTimeLimits[puzzle.size])],
      [t('sichuanHintLimit'), String(puzzle.hints ?? defaultHints)], [t('sichuanShuffleLimit'), String(puzzle.shuffles)]);
  } else {
    entries.push([t('turnLimit'), t(settings.turnLimit ? 'turnSeconds' : 'unlimitedTurns', { count: settings.turnLimit })]);
    if (game === 'omok') entries.push([t('rule33'), t(settings.allowDoubleThree ? 'allow33' : 'ban33')], [t('overlineRule'), t(settings.overline)]);
    if (game === 'physics') entries.push([t('flickStoneCount'), String(settings.flick.stones)], [t('flickBoardSize'), t('flickSize_' + settings.flick.board)],
      [t('flickRandom'), t(settings.flick.random ? 'enabled' : 'disabled')], [t('force'), t(settings.power === 1 ? 'standard' : 'fast')]);
  }
  return <dl className="match-rule-list" aria-label={t('rulesSummary')}>
    {entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}
