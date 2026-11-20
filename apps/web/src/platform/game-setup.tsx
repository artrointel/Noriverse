import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiAvailable } from '../network/api.ts';
import type { GameId } from '../games/scenes.ts';
import type { MatchSettings } from '../games/match-settings.ts';
import { BackLink, gamePath } from './navigation.tsx';
import type { GameMode, Navigate } from './navigation.tsx';
import { GameFeature, GameRulesEditor, GameRulesSummary } from './game-settings.tsx';

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

  return <div className="site-width subpage match-workspace">
    <BackLink fallback={gamePath(id)} fallbackLabel={id} navigate={navigate} />
    <h1 className="match-page-title" tabIndex={-1}>{t('settings')}</h1>
    <GameFeature game={id} heading={t(id)} />
    <form className="match-setup-grid" onSubmit={async event => {
      event.preventDefault();
      if (starting || (!useLobby && !valid)) return;
      setStarting(true);
      setFailed(false);
      try { setFailed(!await onStart(mode)); }
      catch { setFailed(true); }
      finally { setStarting(false); }
    }}>
      <section className="surface match-editor">
        <fieldset className="match-mode">
          <legend>{t('gameMode')}</legend>
          {(['online', 'local'] as const).map(value => <label className="choice match-mode-choice" key={value}>
            <input type="radio" name="mode" value={value} checked={mode === value} disabled={value === 'online' && !apiAvailable}
              onChange={() => { setMode(value); setFailed(false); setValid(true); }} />
            <span><strong>{t(value === 'online' ? 'newRoom' : 'local')}</strong>
              <small>{t(value === 'online' ? apiAvailable ? 'onlineCopy' : 'roomUnavailable' : id === 'sichuan' ? 'sichuanSolo' : 'localCopy')}</small></span>
          </label>)}
        </fieldset>
        {useLobby ? <p className="match-setup-notice">{t(activeGame === id ? 'editRulesInLobby' : 'otherGameRoom', { game: t(activeGame!) })}</p>
          : <GameRulesEditor key={mode} game={id} settings={settings} change={change} online={mode === 'online'} onValidity={setValid} />}
      </section>
      <aside className="surface match-checkout" aria-label={t('rulesSummary')}>
        <h2>{t(useLobby ? 'room' : 'rulesSummary')}</h2>
        {!useLobby && <GameRulesSummary game={id} settings={settings} online={mode === 'online'} />}
        {mode === 'online' && failed && <p role="alert">{t('createRoomError')}</p>}
        <button type="submit" className="button button-primary" disabled={starting || (!useLobby && !valid)}>
          {t(starting ? 'loading' : mode === 'online' ? useLobby ? 'goToRoom' : 'newRoom' : 'start')}
        </button>
      </aside>
    </form>
  </div>;
}
