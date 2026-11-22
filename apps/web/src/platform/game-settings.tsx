import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameId } from '../../../../packages/protocol/games.ts';
import type { MatchSettings } from '../games/match-settings.ts';
import { isTurnLimit, maxTurnLimit, turnLimits } from '../games/turn-clock.ts';
import { omokOverlineRules } from '../games/omok/rules.ts';
import { defaultHints, defaultObstacleDensity, maxSichuanObstacleDensity, sichuanThemes, sichuanTimeLimits } from '../games/sichuan/options.ts';
import { memoryPreviewMs, memorySizes, memoryTimeLimits } from '../games/memory/rules.ts';
import { orbitHeight, orbitMatchSize, orbitWidth } from '../games/slime/rules.ts';
import { FlickSettingsFields } from './flick-settings.tsx';
import { SichuanModePicker, SichuanSettingsFields } from './sichuan-settings.tsx';
import { games } from './game-catalog.ts';
import { formatPlayTime } from './game-time.tsx';
import { SettingsSection, SettingsSelect } from './settings-fields.tsx';
import { maxHintInterval, sketchCycles, sketchMaps, sketchTimes } from '../games/sketch/rules.ts';
import type { SketchSettings } from '../games/sketch/rules.ts';
import { liarGuessSeconds, liarHintTimes, liarVoteSeconds } from '../games/liar/rules.ts';
import { moleModes, moleSizes, moleTimes } from '../games/mole/rules.ts';

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

function SketchSettingsFields({ value, change, online, onValidity }: {
  value: SketchSettings; change: (settings: SketchSettings) => void; online: boolean; onValidity: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const [interval, setInterval] = useState(String(value.hintSeconds));
  const valid = Number.isInteger(Number(interval)) && Number(interval) >= 1 && Number(interval) <= maxHintInterval;
  return <SettingsSection title={t('setupBoardRules')}>
    <SettingsSelect label={t('sketchLanguage')} value={value.language} change={language =>
      change({ ...value, language: language === 'en' ? 'en' : 'ko' })}>
      <option value="ko">한국어</option><option value="en">English</option>
    </SettingsSelect>
    <SettingsSelect label={t('sketchMap')} value={value.map} change={selected =>
      change({ ...value, map: sketchMaps.find(map => map === selected) ?? 'random' })}>
      {(['random', ...sketchMaps] as const).map(map => <option key={map} value={map}>{t('sketchMap_' + map)}</option>)}
    </SettingsSelect>
    {online && <>
      <SettingsSelect label={t('sketchTime')} value={value.seconds} change={selected =>
        change({ ...value, seconds: sketchTimes.find(seconds => seconds === Number(selected)) ?? value.seconds })}>
        {sketchTimes.map(seconds => <option key={seconds} value={seconds}>{formatPlayTime(seconds)}</option>)}
      </SettingsSelect>
      <SettingsSelect label={t('sketchCycles')} value={value.cycles} change={selected =>
        change({ ...value, cycles: sketchCycles.find(cycles => cycles === Number(selected)) ?? value.cycles })}>
        {sketchCycles.map(cycles => <option key={cycles} value={cycles}>{cycles}</option>)}
      </SettingsSelect>
      <div className="setup-row">
        <div className="setup-field-label"><label htmlFor={hintId}>{t('sketchHintInterval')}</label>
          <small id={hintId + '-help'} className={!valid ? 'setup-error' : undefined}>{t('sketchHintIntervalHelp', { max: maxHintInterval })}</small>
        </div>
        <input id={hintId} type="number" min={1} max={maxHintInterval} step={1} inputMode="numeric" value={interval}
          aria-invalid={!valid} aria-describedby={hintId + '-help'} onChange={event => {
            const seconds = event.currentTarget.valueAsNumber;
            const valid = Number.isInteger(seconds) && seconds >= 1 && seconds <= maxHintInterval;
            setInterval(event.currentTarget.value);
            onValidity(valid);
            if (valid) change({ ...value, hintSeconds: seconds });
          }} />
      </div>
    </>}
  </SettingsSection>;
}

export function GameRulesEditor({ game, settings, change, online, onValidity }: {
  game: GameId; settings: MatchSettings; change: (settings: MatchSettings) => void;
  online: boolean; onValidity: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  if (game === 'mole') {
    const mole = settings.mole;
    return <SettingsSection title={t('setupBoardRules')}>
      <SettingsSelect label={t('sichuanGrid')} value={mole.size} change={value => {
        const size = moleSizes.find(option => option === Number(value));
        if (size) change({ ...settings, mole: { ...mole, size } });
      }}>
        {moleSizes.map(size => <option key={size} value={size}>{size} × {size}</option>)}
      </SettingsSelect>
      <SettingsSelect label={t('moleFormat')} value={mole.mode} change={value => {
        const mode = moleModes.find(option => option === value);
        if (mode) change({ ...settings, mole: { ...mole, mode } });
      }}>
        {moleModes.map(mode => <option key={mode} value={mode}>{t('mole_' + mode)}</option>)}
      </SettingsSelect>
      {mole.mode === 'timed' ? <SettingsSelect label={t('matchTimeLimit')} value={mole.seconds} change={value => {
        const seconds = moleTimes.find(option => option === Number(value));
        if (seconds) change({ ...settings, mole: { ...mole, seconds } });
      }}>
        {moleTimes.map(seconds => <option key={seconds} value={seconds}>{formatPlayTime(seconds)}</option>)}
      </SettingsSelect> : <p className="setup-help">{t('moleEndlessHelp')}</p>}
    </SettingsSection>;
  }
  if (game === 'slime') return <SettingsSection title={t('setupBoardRules')}>
    <p className="setup-help">{t('slimeRules')}</p>
  </SettingsSection>;
  if (game === 'liar') {
    const liar = settings.liar;
    return <SettingsSection title={t('setupBoardRules')}>
      <SettingsSelect label={t('sketchLanguage')} value={liar.language} change={language =>
        change({ ...settings, liar: { ...liar, language: language === 'en' ? 'en' : 'ko' } })}>
        <option value="ko">한국어</option><option value="en">English</option>
      </SettingsSelect>
      <SettingsSelect label={t('liarHintTime')} value={liar.seconds} change={value =>
        change({ ...settings, liar: { ...liar, seconds: liarHintTimes.find(seconds => seconds === Number(value)) ?? liar.seconds } })}>
        {liarHintTimes.map(seconds => <option key={seconds} value={seconds}>{formatPlayTime(seconds)}</option>)}
      </SettingsSelect>
    </SettingsSection>;
  }
  if (game === 'sketch') return <SketchSettingsFields value={settings.sketch} online={online} onValidity={onValidity}
    change={sketch => change({ ...settings, sketch })} />;
  if (game === 'memory') {
    const options = settings.memory.settings;
    return <SettingsSection title={t('setupBoard')}>
      <SettingsSelect label={t('sichuanGrid')} value={options.size} change={value => {
        const size = memorySizes.find(size => size === Number(value));
        if (size) change({ ...settings, memory: { ...settings.memory, settings: { ...options, size, timeLimit: memoryTimeLimits[size] } } });
      }}>
        {memorySizes.map(size => <option key={size} value={size}>{size} × {size}</option>)}
      </SettingsSelect>
      <SettingsSelect label={t('sichuanArt')} value={options.theme} change={value => {
        const theme = value === 'random' ? 'random' : sichuanThemes.find(theme => theme === value);
        if (theme) change({ ...settings, memory: { ...settings.memory, settings: { ...options, theme } } });
      }}>
        <option value="random">{t('sichuanRandom')}</option>
        {sichuanThemes.map(theme => <option key={theme} value={theme}>{t('sichuanTheme_' + theme)}</option>)}
      </SettingsSelect>
    </SettingsSection>;
  }
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
  if (game === 'mole') {
    const { size, mode, seconds } = settings.mole;
    entries.push([t('sichuanGrid'), `${size} × ${size}`], [t('moleFormat'), t('mole_' + mode)],
      [t('matchTimeLimit'), mode === 'timed' ? formatPlayTime(seconds) : t('moleEndlessDuration')]);
  } else if (game === 'slime') {
    entries.push([t('gameMode'), t('slimeVersus')], [t('sichuanGrid'), `${orbitWidth} × ${orbitHeight}`],
      [t('slimeBoardLimit'), t('slimeMatchSize', { count: orbitMatchSize })]);
  } else if (game === 'liar') {
    entries.push([t('sketchLanguage'), settings.liar.language === 'ko' ? '한국어' : 'English'],
      [t('liarHintTime'), formatPlayTime(settings.liar.seconds)], [t('liarVoteTime'), formatPlayTime(liarVoteSeconds)],
      [t('liarGuessTime'), formatPlayTime(liarGuessSeconds)]);
  } else if (game === 'sketch') {
    entries.push([t('sketchLanguage'), settings.sketch.language === 'ko' ? '한국어' : 'English'],
      [t('sketchTime'), formatPlayTime(settings.sketch.seconds)], [t('sketchCycles'), String(settings.sketch.cycles)],
      [t('sketchMap'), t('sketchMap_' + settings.sketch.map)], [t('sketchHintInterval'), formatPlayTime(settings.sketch.hintSeconds)]);
  } else if (game === 'memory') {
    const { settings: memory } = settings.memory;
    entries.push([t('gameMode'), t('sichuanMode_race')], [t('sichuanGrid'), `${memory.size} × ${memory.size}`],
      [t('sichuanArt'), t(memory.theme === 'random' ? 'sichuanRandom' : 'sichuanTheme_' + memory.theme)],
      [t('memoryPreview'), t('turnSeconds', { count: memoryPreviewMs / 1000 })],
      [t('matchTimeLimit'), formatPlayTime(memory.timeLimit ?? 90)]);
  } else if (game === 'sichuan') {
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
