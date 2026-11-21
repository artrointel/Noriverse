import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiAvailable } from '../network/api.ts';
import type { GameId } from '../../../../packages/protocol/games.ts';
import { isOnlineOnlyGame } from '../../../../packages/protocol/games.ts';
import { readRoomTitle, roomTitleMaxLength, roomTitleOptions } from '../../../../packages/protocol/room-titles.ts';
import type { MatchSettings } from '../games/match-settings.ts';
import { BackLink, gamePath } from './navigation.tsx';
import type { GameMode, Navigate } from './navigation.tsx';
import { GameRulesEditor } from './game-settings.tsx';
import { games } from './game-catalog.ts';
import { SettingsSection } from './settings-fields.tsx';
import { DiceIcon } from './dice-icon.tsx';

export function GameSetup({ id, online, settings, change, onStart, navigate, activeGame, profileName, profileLoading }: {
  id: GameId; online: boolean; settings: MatchSettings; change: (settings: MatchSettings) => void;
  onStart: (mode: GameMode, title?: string) => Promise<boolean>; navigate: Navigate; activeGame?: GameId; profileName?: string; profileLoading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const onlineOnly = isOnlineOnlyGame(id);
  const [mode, setMode] = useState<GameMode>(onlineOnly || (online && apiAvailable) ? 'online' : 'local');
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [valid, setValid] = useState(true);
  const useLobby = mode === 'online' && Boolean(activeGame);
  const blocked = mode === 'online' && !apiAvailable;
  const creatingRoom = mode === 'online' && !blocked && !useLobby;
  const suggestions = roomTitleOptions(profileName, i18n.resolvedLanguage);
  const [suggestion, setSuggestion] = useState(() => Math.floor(Math.random() * suggestions.length));
  const [typedTitle, setTypedTitle] = useState<string>();
  const title = typedTitle ?? suggestions[suggestion];
  const roomTitle = creatingRoom ? readRoomTitle(title) : undefined;
  const canSubmit = !starting && !blocked && (useLobby || valid) && (!creatingRoom || (!profileLoading && Boolean(roomTitle)));

  return <div className="site-width subpage game-setup">
    <BackLink fallback={gamePath(id)} fallbackLabel={id} navigate={navigate} />
    <header className="setup-heading">
      <img src={games[id].art} alt="" width="80" height="60" />
      <h1 tabIndex={-1}>{t('setupTitle', { game: t(id) })}</h1>
    </header>
    <form className="setup-form-layout" onSubmit={async event => {
      event.preventDefault();
      if (!canSubmit) return;
      setStarting(true);
      setFailed(false);
      try { setFailed(!await onStart(mode, roomTitle)); }
      catch { setFailed(true); }
      finally { setStarting(false); }
    }}>
      <div className="surface setup-panel">
        <SettingsSection title={t('gameMode')}>
          <fieldset className="setup-options" aria-label={t('gameMode')} aria-describedby="setup-mode-help">
            {(['online', 'local'] as const).filter(value => !onlineOnly || value === 'online').map(value => <label className="setup-option" key={value}>
              <input type="radio" name="mode" value={value} checked={mode === value} disabled={value === 'online' && !apiAvailable}
                onChange={() => { setMode(value); setFailed(false); setValid(true); }} />
              <span>{t(value === 'online' ? 'newRoom' : 'local')}</span>
            </label>)}
          </fieldset>
          <p className="setup-help" id="setup-mode-help">{useLobby
            ? t(activeGame === id ? 'editRulesInLobby' : 'otherGameRoom', { game: t(activeGame!) })
            : t(blocked ? 'roomUnavailable' : onlineOnly ? 'liarOnlineOnly'
              : mode === 'online' ? 'onlineCopy' : id === 'sketch' ? 'sketchPractice' : !apiAvailable ? 'roomUnavailable' : id === 'sichuan' ? 'sichuanSolo' : 'localCopy')}</p>
        </SettingsSection>
        {creatingRoom && <SettingsSection title={t('roomTitle')}>
          <label className="visually-hidden" htmlFor="setup-room-title">{t('roomTitle')}</label>
          <div className="name-input setup-room-title">
            <input id="setup-room-title" type="text" required maxLength={roomTitleMaxLength} value={profileLoading ? '' : title} disabled={starting || profileLoading}
              aria-invalid={!roomTitle} aria-describedby={!roomTitle ? 'setup-room-title-error' : undefined}
              onChange={event => setTypedTitle(event.target.value)} />
            <button className="dice-button" type="button" aria-label={t('rollRoomTitle')} title={t('rollRoomTitle')} disabled={starting || profileLoading}
              onClick={() => {
                const alternatives = suggestions.map((value, index) => ({ value, index })).filter(item => item.value !== title);
                setSuggestion(alternatives[Math.floor(Math.random() * alternatives.length)].index);
                setTypedTitle(undefined);
              }}><DiceIcon /></button>
          </div>
          {!roomTitle && <small className="setup-error" id="setup-room-title-error">{t('roomTitleInvalid', { max: roomTitleMaxLength })}</small>}
        </SettingsSection>}
        {!useLobby && <GameRulesEditor key={mode} game={id} settings={settings} change={change} online={mode === 'online'} onValidity={setValid} />}
      </div>
      <div className="setup-actions">
        {mode === 'online' && failed && <p role="alert" className="setup-error">{t('createRoomError')}</p>}
        <button type="submit" className="button button-primary" disabled={!canSubmit}>
          {t(starting ? 'loading' : mode === 'online' ? useLobby ? 'goToRoom' : 'newRoom' : 'start')}
        </button>
      </div>
    </form>
  </div>;
}
