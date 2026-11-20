import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../packages/protocol/profile.ts';
import { isRoomGame } from '../../../packages/protocol/rooms.ts';
import licenseUrl from '../../../LICENSE?url&no-inline';
import logo from './assets/noriverse-icon.png';
import { boardRules, isBoardGame } from './games/board-rules.ts';
import { defaultOmokOverline } from './games/omok/rules.ts';
import type { OmokOverline } from './games/omok/rules.ts';
import type { BoardGame } from './games/board-rules.ts';
import { useRoomBoard } from './network/use-room-board.ts';
import { apiAvailable } from './network/api.ts';
import type { GameId } from './games/scenes.ts';
import type { Stone } from './games/table.ts';
import { oppositeStone, rematchPlayerColor } from './games/table.ts';
import { nextDeadline, resolveTurnTimeout } from './games/turn-clock.ts';
import type { TimeoutChoice, TurnLimit } from './games/turn-clock.ts';
import { bindPageAudio, loadAudioLevels, playSound, setAudioLevels, setMusicScene } from './platform/audio.ts';
import type { AudioLevels } from './platform/audio.ts';
import { CatalogPage, GameDetail } from './platform/catalog-pages.tsx';
import { GameSetup } from './platform/game-setup.tsx';
import { games } from './platform/game-catalog.ts';
import { BackNavigation, gamePath, RouteLink, useNavigation } from './platform/navigation.tsx';
import type { GameMode } from './platform/navigation.tsx';
import { createLocalRound, PlayPage } from './platform/play-page.tsx';
import { SichuanPage } from './platform/sichuan-page.tsx';
import { defaultMatchSettings } from './games/match-settings.ts';
import { puzzleOutcome } from './games/sichuan/multiplayer.ts';
import { RoomPage } from './platform/room-page.tsx';
import { FriendsPage, useFriends } from './platform/friends.tsx';
import { InvitationToasts, useInvitations } from './platform/invitations.tsx';
import { usePreferences } from './platform/preferences.ts';
import { SettingsMenu } from './platform/settings-menu.tsx';
import { NameDialog, ProfileNav, ProfilePage, useProfile } from './platform/profiles.tsx';
import './styles.css';

function createLocalBoard(allowDoubleThree = true, firstPlayerColor: Stone = 1, turnLimit: TurnLimit = 0, overline: OmokOverline = defaultOmokOverline) {
  return { ...createLocalRound(turnLimit, firstPlayerColor), history: [] as number[], allowDoubleThree, overline };
}

function App() {
  const { t, i18n } = useTranslation();
  const preferences = usePreferences();
  const { route, path, navigate, backNavigation } = useNavigation();
  const profile = useProfile(route.page === 'profile');
  const room = useRoomBoard(profile.profile);
  const friends = useFriends(profile.profile?.id, route.page === 'friends');
  const presence = profile.profile?.presence ?? 'online';
  const invitations = useInvitations(profile.profile?.id, presence, profile.syncPresence);
  const playGame = route.page === 'play' && (!route.online || (room.code && room.inMatch && room.started && room.game === route.id
    && room.state !== 'closed' && room.state !== 'missing')) ? route.id : undefined;
  const [localBoards, setLocalBoards] = useState(() => {
    const boards = Object.fromEntries(Object.keys(boardRules).map(id => [id, createLocalBoard()]));
    return boards as Record<BoardGame, ReturnType<typeof createLocalBoard>>;
  });
  const [settings, setSettings] = useState(defaultMatchSettings);
  const { power, flick: flickSettings, allowDoubleThree, puzzle: { settings: sichuanSettings }, overline, turnLimit } = settings;
  const roomOpen = Boolean(room.code && !['closed', 'missing', 'full'].includes(room.state ?? ''));
  const backdropGame = playGame ?? (roomOpen && (route.page === 'room' || (route.page === 'play' && route.online)) ? room.game : undefined);
  const [nameDismissed, setNameDismissed] = useState(() => Boolean(room.guestRoom));
  const [editName, setEditName] = useState(false);
  const [pendingFavorite, setPendingFavorite] = useState<GameId>();
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState(false);
  const [audioLevels, setLevelState] = useState(loadAudioLevels);
  const lastPath = useRef(path);
  const matchOpened = useRef('');
  const lastAwayResult = useRef('');

  useEffect(bindPageAudio, []);
  useEffect(() => { setAudioLevels(preferences.muted ? { music: 0, effects: 0 } : audioLevels); }, [audioLevels, preferences.muted]);

  useEffect(() => {
    if (path === lastPath.current) return;
    lastPath.current = path;
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    playSound('navigate');
  }, [path]);

  useEffect(() => { setMusicScene(route.page === 'play' ? route.id : 'lobby'); }, [route.page, route.id]);

  useEffect(() => {
    if (!profile.profile || !room.inMatch || !room.playerColor || !room.finishedAt || !room.matchId || lastAwayResult.current === room.matchId
      || (route.page === 'play' && route.id === room.game && route.online)) return;
    const loser = room.surrendered ?? room.timedOut;
    const winner = loser ? oppositeStone(loser) : room.winner;
    const puzzleResult = room.puzzle?.result && room.role ? puzzleOutcome(room.puzzle.result, room.role) : undefined;
    const outcome = puzzleResult ?? (winner ? winner === 'draw' ? 'draw' : winner === room.playerColor ? 'win' : 'loss' : undefined);
    if (!outcome) return;
    const matchId = room.matchId;
    lastAwayResult.current = matchId;
    void profile.record({
      id: matchId, game: room.game, mode: 'online', outcome,
      seconds: elapsedPlaySeconds(room.puzzle?.beginsAt || room.startedAt, room.finishedAt),
    }).then(saved => { if (!saved && lastAwayResult.current === matchId) lastAwayResult.current = ''; });
  }, [profile.profile, profile.record, room.game, room.playerColor, room.finishedAt, room.matchId, room.winner, room.surrendered, room.timedOut, room.startedAt, room.puzzle, room.role, room.inMatch, route]);

  useEffect(() => {
    const view = route.id ? t(route.id) : route.page === 'room' ? t('room')
      : route.page === 'games' ? t('library') : null;
    const brand = i18n.resolvedLanguage === 'ko' ? '놀이버스' : 'Noriverse';
    document.title = view ? view + ' · ' + brand : brand + ' · ' + t('siteSummary');
  }, [route, t, i18n.resolvedLanguage]);

  useEffect(() => {
    if (!room.started) {
      matchOpened.current = '';
    } else if (!room.finishedAt && room.role && room.role !== 'host' && room.inMatch && matchOpened.current !== room.matchId) {
      if (route.page === 'room') {
        matchOpened.current = room.matchId;
        navigate(gamePath(room.game, 'play', 'online'));
      } else if (route.page === 'play' && route.online && route.id === room.game) {
        matchOpened.current = room.matchId;
      }
    }
  }, [room.game, room.started, room.finishedAt, room.role, room.inMatch, room.matchId, route, navigate]);

  useEffect(() => {
    if (room.role && room.role !== 'host' && room.matchId && route.page === 'play' && route.online && (!room.started || !room.inMatch || route.id !== room.game)) {
      navigate('/room', true);
    }
  }, [room.game, room.started, room.role, room.inMatch, room.matchId, route, navigate]);

  async function startGame(mode: GameMode) {
    if (route.page !== 'setup') return false;
    const id = route.id;
    if (mode === 'online' && isRoomGame(id)) {
      const setupUrl = location.href;
      if ((!room.code || room.state === 'closed' || room.state === 'missing' || room.state === 'full') && room.state !== 'joining') {
        if (!await room.create(id, settings)) return false;
      }
      if (location.href === setupUrl) navigate('/room');
    } else {
      if (isBoardGame(id)) setLocalBoards(previous => ({ ...previous, [id]: createLocalBoard(allowDoubleThree, 1, turnLimit, overline) }));
      navigate(gamePath(id, 'play'));
    }
    return true;
  }

  function rematchBoard(id: BoardGame) {
    setLocalBoards(previous => {
      const current = previous[id];
      if (!current.finishedAt) return previous;
      const firstPlayerColor = rematchPlayerColor(current.firstPlayerColor, boardRules[id].result(current.history, current.overline),
        current.surrendered ?? current.timedOut);
      return { ...previous, [id]: createLocalBoard(current.allowDoubleThree, firstPlayerColor, current.turnLimit, current.overline) };
    });
  }

  function placeLocal(id: BoardGame, index: number) {
    const time = Date.now();
    setLocalBoards(previous => {
      const current = previous[id];
      if (current.finishedAt || current.timeoutPending || (current.deadline && time >= current.deadline)) return previous;
      const rules = boardRules[id];
      const history = rules.place(current.history, index, current.allowDoubleThree, current.overline);
      if (!history) return previous;
      const finishedAt = rules.result(history, current.overline) ? time : 0;
      return { ...previous, [id]: { ...current, history, finishedAt, deadline: finishedAt ? 0 : nextDeadline(current.turnLimit, time) } };
    });
  }

  function endLocalBoard(id: BoardGame, color: Stone, expiredDeadline?: number) {
    const time = Date.now();
    setLocalBoards(previous => {
      const current = previous[id];
      if (current.finishedAt) return previous;
      if (expiredDeadline !== undefined) {
        if (current.deadline !== expiredDeadline || time < expiredDeadline) return previous;
        return { ...previous, [id]: { ...current, timeoutPending: { color, at: expiredDeadline }, deadline: 0 } };
      }
      if (current.deadline && time >= current.deadline) return previous;
      return { ...previous, [id]: { ...current, finishedAt: time, surrendered: color, deadline: 0, timeoutPending: undefined } };
    });
  }

  function decideLocalBoard(id: BoardGame, choice: TimeoutChoice, at: number) {
    const now = Date.now();
    setLocalBoards(previous => {
      const current = previous[id];
      if (!current.timeoutPending || current.timeoutPending.at !== at || current.finishedAt) return previous;
      return { ...previous, [id]: { ...current, ...resolveTurnTimeout(current.timeoutPending, choice, now) } };
    });
  }

  function enterRoomGame() {
    if (room.started ? room.inMatch : room.start()) navigate(gamePath(room.game, 'play', 'online'));
  }

  function rejoinRoom() {
    const saved = room.guestRoom;
    if (!saved) return;
    if (room.code === saved.code && room.state === 'connected' && room.started) {
      navigate(gamePath(room.game, 'play', 'online'));
    } else {
      room.join(saved.code);
      navigate('/room?room=' + saved.code);
    }
  }

  function changeVolume(channel: keyof AudioLevels, value: number) {
    const levels = { ...audioLevels, [channel]: value };
    setLevelState(levels);
    try { localStorage.setItem('noriverse.audio', JSON.stringify(levels)); } catch { /* Storage is optional. */ }
  }

  async function changeFavorite(game: GameId, selected: boolean) {
    setFavoriteBusy(true);
    setFavoriteError(false);
    try { await profile.setPreferences({ favorite: { game, selected } }); }
    catch { setFavoriteError(true); }
    finally { setFavoriteBusy(false); }
  }

  function toggleFavorite(game: GameId) {
    if (favoriteBusy || !apiAvailable) return;
    if (!profile.profile) {
      setPendingFavorite(game);
      setEditName(true);
      return;
    }
    void changeFavorite(game, !profile.profile.favorites.includes(game));
  }

  async function saveProfileName(name: string) {
    await profile.saveName(name);
    if (pendingFavorite) await changeFavorite(pendingFavorite, true);
  }

  const page = (() => {
    switch (route.page) {
      case 'home':
      case 'games':
        return <CatalogPage home={route.page === 'home'} navigate={navigate} favorites={profile.profile?.favorites ?? []}
          disableFavorite={!apiAvailable || profile.status === 'loading' || favoriteBusy} favoriteError={favoriteError}
          onFavorite={toggleFavorite} rejoin={apiAvailable && room.guestRoom ? { room: room.guestRoom, resume: rejoinRoom } : undefined} />;
      case 'profile':
      case 'publicProfile':
        return <ProfilePage own={route.page === 'profile'} id={route.profileId} model={profile} friends={friends} navigate={navigate}
          edit={() => setEditName(true)} />;
      case 'friends':
        return <FriendsPage model={friends} navigate={navigate} openProfile={() => setEditName(true)} follow={target => {
          if (room.code === target.code && room.state === 'connected' && room.started) {
            navigate(gamePath(room.game, 'play', 'online'));
            return;
          }
          if (room.code !== target.code || room.state === 'missing' || room.state === 'closed' || room.state === 'full' || room.state === 'disconnected' || room.state === 'failed') {
            room.join(target.code);
          }
          navigate('/room?room=' + target.code);
        }} />;
      case 'detail':
        return <GameDetail id={route.id} navigate={navigate} />;
      case 'setup':
        return <GameSetup id={route.id} online={route.online} settings={settings} change={setSettings}
          activeGame={roomOpen ? room.game : undefined}
          onStart={startGame} navigate={navigate} />;
      case 'room':
        return <RoomPage room={room} friends={friends} ownProfile={profile.profile} invite={route.invite} navigate={navigate} onPlay={enterRoomGame} />;
      case 'play': {
        const id = route.id;
        const board = isBoardGame(id) ? id : undefined;
        const online = route.online;
        const local = board ? localBoards[board] : undefined;
        if (online && playGame !== id) {
          return <RoomPage room={room} friends={friends} ownProfile={profile.profile} invite="" navigate={navigate} onPlay={enterRoomGame} />;
        }
        if (id === 'sichuan') {
          const puzzleRoom = online && room.puzzle && room.puzzleConfig && room.role
            ? { ...room, puzzle: room.puzzle, puzzleConfig: room.puzzleConfig, role: room.role } : undefined;
          if (online && !puzzleRoom) return <p role="status">{t('loading')}</p>;
          return <SichuanPage key={puzzleRoom?.matchId ?? id} settings={sichuanSettings} room={puzzleRoom} ownProfile={profile.profile}
            dark={preferences.dark} antialias={preferences.antialias} resolution={preferences.resolution}
            onResolution={preferences.changeResolution} onAntialias={preferences.changeAntialias} showTouches={preferences.showTouches}
            onTouchDisplay={preferences.changeShowTouches} touchStyle={profile.profile?.touchEffect ?? 'soft'} navigate={navigate}
            record={apiAvailable && profile.profile ? profile.record : undefined} />;
        }
        return <PlayPage id={id} dark={preferences.dark} antialias={preferences.antialias} power={power} flickSettings={flickSettings} turnLimit={turnLimit} navigate={navigate}
          resolution={preferences.resolution} onResolution={preferences.changeResolution} onAntialias={preferences.changeAntialias}
          showTouches={preferences.showTouches} onTouchDisplay={preferences.changeShowTouches} touchStyle={profile.profile?.touchEffect ?? 'soft'}
          room={online ? room : undefined} ownProfile={profile.profile} history={online ? room.history : local?.history ?? []}
          boardRound={online ? undefined : local}
          allowDoubleThree={online ? room.allowDoubleThree : local?.allowDoubleThree ?? true}
          overline={online ? room.overline : local?.overline ?? defaultOmokOverline} record={apiAvailable && profile.profile ? profile.record : undefined}
          move={online ? room.move : index => { if (board) placeLocal(board, index); }}
          reset={online ? room.rematch : () => { if (board) rematchBoard(board); }}
          endLocal={(color, deadline) => { if (board) endLocalBoard(board, color, deadline); }}
          decideLocal={(choice, at) => { if (board) decideLocalBoard(board, choice, at); }} />;
      }
      default:
        return <div className="site-width subpage missing">
          <h1 tabIndex={-1}>{t('notFound')}</h1>
          <RouteLink href="/games" navigate={navigate} className="button button-primary">{t('backToGames')}</RouteLink>
        </div>;
    }
  })();

  return (
    <>
      <a className="skip-link" href="#main" onClick={event => {
        event.preventDefault();
        const main = document.getElementById('main');
        main?.focus();
        main?.scrollIntoView();
      }}>{t('skip')}</a>
      <header className="site-header">
        <div className="site-width header-row">
          <RouteLink href="/" navigate={navigate} className="brand" aria-label="Noriverse">
            <img src={logo} alt="" width="42" height="42" /><strong>Nori<span>verse</span></strong>
          </RouteLink>
          <nav className="site-nav">
            <RouteLink href="/" navigate={navigate} aria-current={route.page === 'home' ? 'page' : undefined}>{t('home')}</RouteLink>
            <RouteLink href="/games" navigate={navigate} aria-current={'id' in route || route.page === 'games' ? 'page' : undefined}>{t('games')}</RouteLink>
          </nav>
          <div className="header-actions">
            <RouteLink href="/room" navigate={navigate} className="header-join" aria-label={t(room.code ? 'activeRoom' : 'joinRoom')}>
              <span className={room.code ? 'room-marker room-marker-active' : 'room-marker'} aria-hidden="true" />
              <span className="header-join-label">{t(room.code ? 'activeRoom' : 'joinRoom')}</span>
            </RouteLink>
            <ProfileNav profile={profile.profile} navigate={navigate} />
            <SettingsMenu preferences={preferences} levels={audioLevels} onVolume={changeVolume} path={path}
              presence={apiAvailable && profile.profile ? { mode: presence, change: mode => profile.setPreferences({ presence: mode }) } : undefined} />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="route-frame"><BackNavigation.Provider value={backNavigation}><div className="route-content" key={path} data-play-game={backdropGame}>
        {backdropGame && <div className="game-backdrop" aria-hidden="true" key={backdropGame}><img src={games[backdropGame].art} alt="" decoding="async" /></div>}
        {page}
      </div></BackNavigation.Provider></main>
      <footer className="site-footer">
        <div className="site-width footer-row">
          <div className="footer-identity">
            <RouteLink href="/" navigate={navigate} className="brand"><img src={logo} alt="" width="30" height="30" /><strong>Nori<span>verse</span></strong></RouteLink>
            <p>{t('footerInfo')}</p>
          </div>
          <nav className="footer-links" aria-label={t('siteLinks')}>
            <RouteLink href="/games" navigate={navigate}>{t('games')}</RouteLink>
            <a href="https://github.com/artrointel/Noriverse">{t('sourceCode')}</a>
            <a href={licenseUrl} target="_blank" rel="noopener">{t('license')}</a>
          </nav>
        </div>
        <div className="site-width footer-meta"><small>© {new Date().getFullYear()} Noriverse</small></div>
      </footer>
      <InvitationToasts model={invitations} accept={invite => {
        if (room.code !== invite.code) room.join(invite.code);
        navigate('/room?room=' + invite.code);
      }} />
      {presence === 'online' && route.page !== 'friends' && friends.incoming.length > 0 && <div className="friend-request-toast surface" role="status">
        <RouteLink href="/friends" navigate={navigate}>{t('reviewFriendRequests', { count: friends.incoming.length })}</RouteLink>
      </div>}
      {(editName || (profile.status === 'missing' && !nameDismissed)) && (
        <NameDialog name={profile.profile?.name} close={() => {
          setNameDismissed(true); setEditName(false); setPendingFavorite(undefined);
        }} save={saveProfileName} />
      )}
    </>
  );
}

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = logo;
document.head.append(favicon);

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
