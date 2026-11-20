import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiAvailable } from '../network/api.ts';
import type { GameId } from '../games/scenes.ts';
import type { MatchSettings } from '../games/match-settings.ts';
import { BackLink, gamePath } from './navigation.tsx';
import type { GameMode, Navigate } from './navigation.tsx';
import { GameRulesEditor } from './game-settings.tsx';
import { games } from './game-catalog.ts';
import { SettingsSection } from './settings-fields.tsx';

export function GameSetup({ id, online, settings, change, onStart, navigate, activeGame }: {
  id: GameId; online: boolean; settings: MatchSettings; change: (settings: MatchSettings) => void;
  onStart: (mode: GameMode) => Promise<boolean>; navigate: Navigate; activeGame?: GameId;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GameMode>(online && apiAvailable ? 'online' : 'local');
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [valid, setValid] = useState(true);
  const useLobby = mode === 'online' && Boolean(activeGame);

  return <div className="site-width subpage game-setup">
    <BackLink fallback={gamePath(id)} fallbackLabel={id} navigate={navigate} />
    <header className="setup-heading">
      <img src={games[id].art} alt="" width="80" height="60" />
      <h1 tabIndex={-1}>{t('setupTitle', { game: t(id) })}</h1>
    </header>
    <form className="setup-form-layout" onSubmit={async event => {
      event.preventDefault();
      if (starting || (!useLobby && !valid)) return;
      setStarting(true);
      setFailed(false);
      try { setFailed(!await onStart(mode)); }
      catch { setFailed(true); }
      finally { setStarting(false); }
    }}>
      <div className="surface setup-panel">
        <SettingsSection title={t('gameMode')}>
          <fieldset className="setup-options" aria-label={t('gameMode')} aria-describedby="setup-mode-help">
            {(['online', 'local'] as const).map(value => <label className="setup-option" key={value}>
              <input type="radio" name="mode" value={value} checked={mode === value} disabled={value === 'online' && !apiAvailable}
                onChange={() => { setMode(value); setFailed(false); setValid(true); }} />
              <span>{t(value === 'online' ? 'newRoom' : 'local')}</span>
            </label>)}
          </fieldset>
          <p className="setup-help" id="setup-mode-help">{useLobby
            ? t(activeGame === id ? 'editRulesInLobby' : 'otherGameRoom', { game: t(activeGame!) })
            : t(mode === 'online' ? 'onlineCopy' : !apiAvailable ? 'roomUnavailable' : id === 'sichuan' ? 'sichuanSolo' : 'localCopy')}</p>
        </SettingsSection>
        {!useLobby && <GameRulesEditor key={mode} game={id} settings={settings} change={change} online={mode === 'online'} onValidity={setValid} />}
      </div>
      <div className="setup-actions">
        {mode === 'online' && failed && <p role="alert" className="setup-error">{t('createRoomError')}</p>}
        <button type="submit" className="button button-primary" disabled={starting || (!useLobby && !valid)}>
          {t(starting ? 'loading' : mode === 'online' ? useLobby ? 'goToRoom' : 'newRoom' : 'start')}
        </button>
      </div>
    </form>
  </div>;
}
