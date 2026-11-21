import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PresenceControl } from './presence-control.tsx';
import type { PresenceSetting } from './presence-control.tsx';
import { getMusicTrack, playSound, shuffleMusicTrack, subscribeMusicTrack } from './audio.ts';
import { musicMoods } from './music-arrangements.ts';
import type { AudioLevels } from './audio.ts';
import type { usePreferences } from './preferences.ts';
import { GearIcon } from './gear-icon.tsx';

export function SettingsMenu({ preferences, levels, onVolume, path, presence }: {
  preferences: ReturnType<typeof usePreferences>;
  levels: AudioLevels;
  onVolume: (channel: keyof AudioLevels, value: number) => void;
  path: string;
  presence?: PresenceSetting;
}) {
  const { t, i18n } = useTranslation();
  const track = useSyncExternalStore(subscribeMusicTrack, getMusicTrack);
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  function close(restoreFocus = false) {
    if (menu.current) {
      menu.current.open = false;
      for (const section of menu.current.querySelectorAll<HTMLDetailsElement>('.settings-section')) section.open = false;
    }
    if (restoreFocus) trigger.current?.focus();
  }

  useEffect(() => { close(); }, [path]);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) close();
    }
    function escape(event: KeyboardEvent) {
      if (menu.current?.open && event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return (
    <details className="preferences" ref={menu} onToggle={event => {
      if (event.target === event.currentTarget && !event.currentTarget.open) close();
    }}>
      <summary ref={trigger} aria-label={t('openSettings')} title={t('openSettings')} aria-controls="settings-popover">
        <GearIcon />
      </summary>
      <div className="preferences-panel" id="settings-popover">
        <div className="settings-heading">
          <h2>{t('openSettings')}</h2>
          <button type="button" className="settings-close" aria-label={t('closeSettings')} onClick={() => close(true)}>
            <span aria-hidden="true" />
          </button>
        </div>
        <details className="settings-section">
          <summary>{t('language')} <small>{preferences.language === 'system' ? t('system') + ' · ' : ''}{i18n.resolvedLanguage === 'ko' ? '한국어' : 'English'}</small></summary>
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
        </details>
        {presence && <details className="settings-section">
          <summary>{t('presenceSettings')} <small>{t(presence.mode === 'offline' ? 'appearOffline' : 'appearOnline')}</small></summary>
          <PresenceControl {...presence} />
        </details>}
        <details className="settings-section">
          <summary>{t('theme')} <small>{preferences.theme === 'system' ? t('system') + ' · ' : ''}{t(preferences.dark ? 'dark' : 'light')}</small></summary>
          <div className="setting-segments">
            {(['system', 'light', 'dark'] as const).map(value => (
              <label key={value}>
                <input className="visually-hidden" type="radio" name="site-theme"
                  checked={preferences.theme === value} onChange={() => preferences.changeTheme(value)} />
                <span>{t(value)}</span>
              </label>
            ))}
          </div>
        </details>
        <details className="settings-section">
          <summary>{t('graphics')}</summary>
          <label className="choice">
            <input type="checkbox" checked={preferences.antialias} onChange={event => preferences.changeAntialias(event.target.checked)} />
            <span><strong>{t('antialias')}</strong><small>{t('graphicsHelp')}</small></span>
          </label>
        </details>
        <div className="sound-setting">
        <details className="settings-section settings-sound">
          <summary>{t('sound')}</summary>
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
        </details>
        <button className="sound-switch" type="button" role="switch" aria-label={t('sound')} aria-checked={!preferences.muted}
          onClick={() => preferences.changeMuted(!preferences.muted)}>
          <span aria-hidden="true">{t(preferences.muted ? 'disabled' : 'enabled')}</span><i aria-hidden="true" />
        </button>
        </div>
      </div>
    </details>
  );
}
