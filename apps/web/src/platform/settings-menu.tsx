import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PresenceControl } from './presence-control.tsx';
import type { PresenceSetting } from './presence-control.tsx';
import { getMusicTrack, playSound, shuffleMusicTrack, subscribeMusicTrack } from './audio.ts';
import { musicMoods } from './music-arrangements.ts';
import type { AudioLevels } from './audio.ts';
import type { usePreferences } from './preferences.ts';
import { GearIcon } from './gear-icon.tsx';
import { Popup } from './popup.tsx';
import { Grouper } from './grouper.tsx';

export function SettingsMenu({ preferences, levels, onVolume, path, presence }: {
  preferences: ReturnType<typeof usePreferences>;
  levels: AudioLevels;
  onVolume: (channel: keyof AudioLevels, value: number) => void;
  path: string;
  presence?: PresenceSetting;
}) {
  const { t, i18n } = useTranslation();
  const track = useSyncExternalStore(subscribeMusicTrack, getMusicTrack);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);

  const languageSummary = (preferences.language === 'system' ? t('system') + ' · ' : '') + (i18n.resolvedLanguage === 'ko' ? '한국어' : 'English');
  const themeSummary = (preferences.theme === 'system' ? t('system') + ' · ' : '') + t(preferences.dark ? 'dark' : 'light');

  return (
    <div className="preferences">
      <button type="button" className="preferences-trigger" aria-label={t('openSettings')} title={t('openSettings')}
        aria-haspopup="dialog" aria-controls={open ? 'settings-popover' : undefined} aria-expanded={open} onClick={() => setOpen(true)}>
        <GearIcon />
      </button>
      {open && <Popup id="settings-popover" className="preferences-dialog" aria-labelledby="preferences-title" onDismiss={() => setOpen(false)}>
        <h2 id="preferences-title">{t('openSettings')}</h2>
        <div className="preferences-content">
        <Grouper title={t('language')} summaryValue={languageSummary} variant="panel">
          <div className="setting-segments">
            {([{ value: 'system', label: t('system') }, { value: 'ko', label: '한국어' },
              { value: 'en', label: 'English' }] as const).map(({ value, label }) => (
                <label key={value}>
                  <input className="visually-hidden" type="radio" name="site-language"
                    checked={preferences.language === value} onChange={() => preferences.changeLanguage(value)} />
                  <span lang={value === 'system' ? undefined : value}>{label}</span>
                </label>
            ))}
          </div>
        </Grouper>
        {presence && <Grouper title={t('presenceSettings')} summaryValue={t(presence.mode === 'offline' ? 'appearOffline' : 'appearOnline')} variant="panel">
          <PresenceControl {...presence} />
        </Grouper>}
        <Grouper title={t('theme')} summaryValue={themeSummary} variant="panel">
          <div className="setting-segments">
            {(['system', 'light', 'dark'] as const).map(value => (
              <label key={value}>
                <input className="visually-hidden" type="radio" name="site-theme"
                  checked={preferences.theme === value} onChange={() => preferences.changeTheme(value)} />
                <span>{t(value)}</span>
              </label>
            ))}
          </div>
        </Grouper>
        <Grouper title={t('graphics')} variant="panel">
          <label className="choice">
            <input type="checkbox" checked={preferences.antialias} onChange={event => preferences.changeAntialias(event.target.checked)} />
            <span><strong>{t('antialias')}</strong><small>{t('graphicsHelp')}</small></span>
          </label>
        </Grouper>
        <div className="sound-setting">
        <Grouper title={t('sound')} variant="panel">
          {(['music', 'effects'] as const).map(channel => (
            <div className="volume-field" key={channel} style={{ '--level': levels[channel] + '%' } as CSSProperties}>
              <div>
                <label htmlFor={'site-' + channel}>{t(channel === 'music' ? 'musicVolume' : 'effectsVolume')}</label>
                <output htmlFor={'site-' + channel} aria-hidden="true">{levels[channel]}%</output>
              </div>
              <input id={'site-' + channel} type="range" min={0} max={100} step={1}
                aria-valuetext={levels[channel] + '%'} value={levels[channel]}
                onChange={event => onVolume(channel, event.target.valueAsNumber)}
                onPointerUp={() => { if (channel === 'effects') playSound('click'); }}
                onKeyUp={event => {
                  if (channel === 'effects' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) playSound('click');
                }} />
              {channel === 'music' && <button type="button" className="track-choice" onClick={shuffleMusicTrack}
                title={t('shuffleTrack')} aria-label={t('shuffleNamedTrack', { track: t('track_' + track) })}>
                <span className="track-symbol" aria-hidden="true">♫</span>
                <span className="track-caption"><strong>{t('track_' + track)}</strong>
                  <span className="track-moods">{musicMoods[track].map(mood => <span key={mood}>{t('mood_' + mood)}</span>)}</span>
                </span>
                <span className="track-shuffle">{t('shuffleTrack')}</span>
              </button>}
            </div>
          ))}
        </Grouper>
        <button className="sound-switch" type="button" role="switch" aria-label={t('sound')} aria-checked={!preferences.muted}
          onClick={() => preferences.changeMuted(!preferences.muted)}>
          <span aria-hidden="true">{t(preferences.muted ? 'disabled' : 'enabled')}</span><i aria-hidden="true" />
        </button>
        </div>
        </div>
      </Popup>}
    </div>
  );
}
