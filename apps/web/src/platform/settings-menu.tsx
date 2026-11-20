import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { playSound } from './audio.ts';
import type { AudioLevels } from './audio.ts';
import type { usePreferences } from './preferences.ts';

export function SettingsMenu({ preferences, levels, onVolume, path }: {
  preferences: ReturnType<typeof usePreferences>;
  levels: AudioLevels;
  onVolume: (channel: keyof AudioLevels, value: number) => void;
  path: string;
}) {
  const { t } = useTranslation();
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
        <svg className="settings-gear" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
          <path d="m10.4 2.8-.6 2.3a7.3 7.3 0 0 0-1.7 1l-2.3-.7-1.7 2.9 1.7 1.7a7.5 7.5 0 0 0 0 2l-1.7 1.7 1.7 2.9 2.3-.7a7.3 7.3 0 0 0 1.7 1l.6 2.3h3.2l.6-2.3a7.3 7.3 0 0 0 1.7-1l2.3.7 1.7-2.9-1.7-1.7a7.5 7.5 0 0 0 0-2l1.7-1.7-1.7-2.9-2.3.7a7.3 7.3 0 0 0-1.7-1l-.6-2.3z" transform="translate(0 1)" />
          <circle cx="12" cy="12" r="2.7" />
        </svg>
      </summary>
      <div className="preferences-panel" id="settings-popover">
        <div className="settings-heading">
          <h2>{t('openSettings')}</h2>
          <button type="button" className="settings-close" aria-label={t('closeSettings')} onClick={() => close(true)}>
            <span aria-hidden="true" />
          </button>
        </div>
        <details className="settings-section">
          <summary>{t('language')}</summary>
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
        <details className="settings-section">
          <summary>{t('theme')}</summary>
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
            </div>
          ))}
        </details>
      </div>
    </details>
  );
}
