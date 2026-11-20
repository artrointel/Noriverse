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

export function GameFeature({ game, heading, children }: { game: GameId; heading: string; children?: ReactNode }) {
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
    </div>
    {children}
  </section>;
}

export function GameRulesEditor({ game, settings, change, online, onValidity }: {
  game: GameId; settings: MatchSettings; change: (settings: MatchSettings) => void;
  online: boolean; onValidity: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const group = useId();
  const [custom, setCustom] = useState(!turnLimits.some(limit => limit === settings.turnLimit));
  const [seconds, setSeconds] = useState(custom ? String(settings.turnLimit) : '');
  const validSeconds = Number(seconds) > 0 && isTurnLimit(Number(seconds));
  if (game === 'sichuan') return <div className="rules-editor">
    {online && <SichuanModePicker value={settings.puzzle.mode} change={mode => change({ ...settings, puzzle: { ...settings.puzzle, mode } })} />}
    <SichuanSettingsFields value={settings.puzzle.settings} change={value => change({ ...settings, puzzle: { ...settings.puzzle, settings: value } })} />
  </div>;

  return <div className="rules-editor">
    <fieldset>
      <legend>{t('turnLimit')}</legend>
      <select aria-label={t('turnLimit')} value={custom ? 'custom' : settings.turnLimit} onChange={event => {
        const value = event.target.value;
        setCustom(value === 'custom');
        onValidity(value !== 'custom' || validSeconds);
        if (value !== 'custom') change({ ...settings, turnLimit: Number(value) });
        else if (validSeconds) change({ ...settings, turnLimit: Number(seconds) });
      }}>
        {turnLimits.map(limit => <option key={limit} value={limit}>{t(limit ? 'turnSeconds' : 'unlimitedTurns', { count: limit })}</option>)}
        <option value="custom">{t('customTurnLimit')}</option>
      </select>
      {custom && <label className="custom-turn-limit">
        <span>{t('customTurnSeconds')}</span><input type="number" min={1} max={maxTurnLimit} step={1} value={seconds} aria-invalid={!validSeconds}
          onChange={event => {
            const value = event.target.valueAsNumber;
            const valid = value > 0 && isTurnLimit(value);
            setSeconds(event.target.value);
            onValidity(valid);
            if (valid) change({ ...settings, turnLimit: value });
          }} />
      </label>}
      <p className="muted">{t('turnLimitHelp')}</p>
    </fieldset>
    {game === 'omok' && <>
      <fieldset>
        <legend>{t('rule33')}</legend>
        <div className="rules-options">{[true, false].map(allow => <label className="choice" key={String(allow)}>
          <input type="radio" name={group + '-double'} checked={settings.allowDoubleThree === allow}
            onChange={() => change({ ...settings, allowDoubleThree: allow })} />
          <span>{t(allow ? 'allow33' : 'ban33')}</span>
        </label>)}</div>
        <p className="muted">{t('rule33Help')}</p>
      </fieldset>
      <fieldset>
        <legend>{t('overlineRule')}</legend>
        <div className="rules-options">{omokOverlineRules.map(rule => <label className="choice" key={rule}>
          <input type="radio" name={group + '-overline'} checked={settings.overline === rule} onChange={() => change({ ...settings, overline: rule })} />
          <span>{t(rule)}</span>
        </label>)}</div>
        <p className="muted">{t('overlineHelp')}</p>
      </fieldset>
    </>}
    {game === 'physics' && <>
      <FlickSettingsFields value={settings.flick} change={flick => change({ ...settings, flick })} />
      <fieldset><legend>{t('force')}</legend><div className="rules-options">
        {([1, 1.35] as const).map(power => <label className="choice" key={power}>
          <input type="radio" name={group + '-power'} checked={settings.power === power} onChange={() => change({ ...settings, power })} />
          <span>{t(power === 1 ? 'standard' : 'fast')}</span>
        </label>)}
      </div></fieldset>
    </>}
  </div>;
}

export function GameRulesSummary({ game, settings, online = true }: { game: GameId; settings: MatchSettings; online?: boolean }) {
  const { t } = useTranslation();
  const entries: [string, string][] = [];
  if (game === 'sichuan') {
    const { mode, settings: puzzle } = settings.puzzle;
    const obstacleDensity = Math.min(puzzle.obstacleDensity ?? defaultObstacleDensity, maxSichuanObstacleDensity(puzzle.size, puzzle.density));
    entries.push([t('gameMode'), t(online ? 'sichuanMode_' + mode : 'local')], [t('sichuanArt'), t(puzzle.theme === 'random' ? 'sichuanRandom' : 'sichuanTheme_' + puzzle.theme)],
      [t('sichuanGrid'), `${puzzle.size} × ${puzzle.size}`], [t('sichuanDensity'), puzzle.density === 'random' ? t('sichuanRandom') : puzzle.density + '%'],
      [t('sichuanObstacles'), puzzle.obstacles ? `${obstacleDensity}%` : t('disabled')], [t('matchTimeLimit'), formatPlayTime(puzzle.timeLimit ?? sichuanTimeLimits[puzzle.size])],
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
