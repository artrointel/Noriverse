import { RoomRankingContext } from './platform/room-ranking.tsx';
import { MatchRecoveryContext } from './platform/match-recovery.tsx';
import { lazy, StrictMode, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../packages/protocol/profile.ts';
import { isRoomGame } from '../../../packages/protocol/rooms.ts';
import licenseUrl from '../../../LICENSE?url&no-inline';
import logo from './assets/noriverse-icon.png';
import { boardRules, isBoardGame } from './games/board-rules.ts';
import { createLocalBoard, decideLocalBoard, endLocalBoard, moveLocalBoard, rematchLocalBoard, setLocalStart } from './games/local-round.ts';
import type { LocalBoard } from './games/local-round.ts';
import type { BoardGame } from './games/board-rules.ts';
import { useRoomBoard } from './network/use-room-board.ts';
import { apiAvailable } from './network/api.ts';
import type { GameId } from '../../../packages/protocol/games.ts';
import { bindPageAudio, loadAudioLevels, playSound, setAudioLevels, setLobbyMusic } from './platform/audio.ts';
import type { AudioLevels } from './platform/audio.ts';
import { CatalogPage, GameDetail } from './platform/catalog-pages.tsx';
import { explorerCopy } from './platform/explorers.ts';
import { GameSetup } from './platform/game-setup.tsx';
import { games } from './platform/game-catalog.ts';
import { BackNavigation, explorerPath, gamePath, roomActivityForRoute, RouteLink, useNavigation } from './platform/navigation.tsx';
import type { GameMode } from './platform/navigation.tsx';
import { PlayPage } from './platform/play-page.tsx';
import { SichuanPage } from './platform/sichuan-page.tsx';
import { SketchPage } from './platform/sketch-page.tsx';
import { defaultMatchSettings, matchSettingsForLanguage } from './games/match-settings.ts';
import type { MatchSettings } from './games/match-settings.ts';
import { CreateRoomPage, RoomPage } from './platform/room-page.tsx';
import { FriendRequestToast, FriendsPage, useFriends } from './platform/friends.tsx';
import { NotificationToasts, useInvitations } from './platform/invitations.tsx';
import { ReactionUsageContext } from './platform/game-reactions.tsx';
import { usePreferences } from './platform/preferences.ts';
import { SettingsMenu } from './platform/settings-menu.tsx';
import { NameDialog, ProfileNav, ProfilePage } from './platform/profiles.tsx';
import { ScrollingLabel } from './platform/scrolling-label.tsx';
import { useProfile } from './platform/use-profile.ts';
import './styles.css';

const LiarPage = lazy(() => import('./platform/liar-page.tsx').then(module => ({ default: module.LiarPage })));
const SlimePage = lazy(() => import('./platform/slime-page.tsx').then(module => ({ default: module.SlimePage })));
const ExplorerPage = lazy(() => import('./platform/explorer-pages.tsx'));

function App() {
  const { t, i18n } = useTranslation();
  const preferences = usePreferences();
  const { route, path, navigate, backNavigation } = useNavigation();
  const profile = useProfile(route.page === 'profile');
  const language = i18n.resolvedLanguage === 'ko' ? 'ko' : 'en';
  const room = useRoomBoard(profile.profile, language, roomActivityForRoute(route));
  const reviewingRequests = route.page === 'friends';
  const friends = useFriends(profile.profile?.id, reviewingRequests ? 'full' : route.page === 'profile' ? 'summary' : false,
    route.page === 'room', reviewingRequests);
  const presence = profile.profile?.presence ?? 'online';
  const invitations = useInvitations(profile.profile?.id, presence, profile.syncPresence, profile.syncBadges);
  const playGame = route.page === 'play' && (!route.online || (room.code && room.inMatch && room.started && room.game === route.id
    && room.state !== 'closed' && room.state !== 'missing')) ? route.id : undefined;
  const [localBoards, setLocalBoards] = useState(() => {
    const boards = Object.fromEntries(Object.keys(boardRules).map(id => [id, createLocalBoard()]));
    return boards as Record<BoardGame, LocalBoard>;
  });
  const [settings, setSettings] = useState<MatchSettings>(() => matchSettingsForLanguage(language));
  const [selectedRoomGame, selectRoomGame] = useState<GameId>();
  const { power, flick: flickSettings, allowDoubleThree, puzzle: { settings: sichuanSettings }, overline, turnLimit } = settings;
  const roomOpen = room.active;
  const roomAction = t(roomOpen ? 'activeRoom' : 'joinRoom');
  const roomTitle = roomOpen ? room.title : undefined;
  const roomActionLabel = roomTitle ? roomAction + ' · ' + roomTitle : roomAction;
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

  useEffect(() => { if (!playGame) setLobbyMusic(); }, [playGame]);

  useEffect(() => {
    if (!profile.profile) return;
    const watchingMatch = route.page === 'play' && route.id === room.game && route.online;
    const outcome = room.roundOutcome;
    const report = !room.started ? room.lobbyReport
      : !watchingMatch && !room.testMatch && room.inMatch && room.finishedAt && room.matchId && outcome
        ? { id: room.matchId, game: room.game, mode: 'online' as const, outcome,
          seconds: elapsedPlaySeconds(room.playStartedAt, room.finishedAt) } : undefined;
    if (!report || lastAwayResult.current === report.id) return;
    lastAwayResult.current = report.id;
    void profile.record(report).then(saved => { if (!saved && lastAwayResult.current === report.id) lastAwayResult.current = ''; });
  }, [profile.profile, profile.record, room.game, room.finishedAt, room.matchId, room.roundOutcome, room.playStartedAt,
    room.inMatch, room.testMatch, room.lobbyReport, room.started, route]);

  useEffect(() => {
    const view = route.id ? t(route.id) : route.page === 'room' ? (room.active && room.title) || t('room') : route.page === 'createRoom' ? t('newRoom')
      : route.page === 'games' ? t('library') : route.page === 'explorers' ? t('explorers')
        : route.page === 'explorer' ? explorerCopy(route.characterId, i18n.resolvedLanguage).name : null;
    const brand = i18n.resolvedLanguage === 'ko' ? '놀이버스' : 'Noriverse';
    document.title = view ? view + ' · ' + brand : brand + ' · ' + t('siteSummary');
  }, [route, t, i18n.resolvedLanguage, room.active, room.title]);

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

  async function startGame(mode: GameMode, title?: string) {
    if (route.page !== 'setup') return false;
    const id = route.id;
    if (mode === 'online' && isRoomGame(id)) {
      const setupUrl = location.href;
      if (!room.active && room.state !== 'joining') {
        if (!await room.create(id, settings, title)) return false;
      }
      if (location.href === setupUrl) navigate('/room');
    } else {
      if (isBoardGame(id)) setLocalBoards(previous => ({ ...previous, [id]: createLocalBoard(allowDoubleThree, 1, turnLimit, overline) }));
      navigate(gamePath(id, 'play'));
    }
    return true;
  }

  function updateLocalBoard(id: BoardGame, apply: (board: LocalBoard, now: number) => LocalBoard) {
    const now = Date.now();
    setLocalBoards(previous => {
      const next = apply(previous[id], now);
      return next === previous[id] ? previous : { ...previous, [id]: next };
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
          edit={() => setEditName(true)} onDeleted={() => {
            if (room.active) room.leave();
            setNameDismissed(false);
          }} />;
      case 'friends':
        return <FriendsPage model={friends} navigate={navigate} openProfile={() => setEditName(true)} follow={target => {
          if (room.code === target.code && room.state === 'connected' && room.started) {
            navigate(gamePath(room.game, 'play', 'online'));
            return;
          }
          if (room.code !== target.code || !room.active || room.needsReconnect) {
            room.join(target.code);
          }
          navigate('/room?room=' + target.code);
        }} />;
      case 'detail':
        return <GameDetail id={route.id} navigate={navigate} />;
      case 'explorers':
      case 'explorer':
        return <Suspense fallback={<div className="site-width subpage" role="status">{t('loading')}</div>}>
          <ExplorerPage characterId={route.characterId} navigate={navigate} />
        </Suspense>;
      case 'setup':
        return <GameSetup id={route.id} online={route.online} settings={settings} change={setSettings}
          activeGame={roomOpen ? room.game : undefined} profileName={profile.profile?.name} profileLoading={profile.status === 'loading'}
          onStart={startGame} navigate={navigate} />;
      case 'room':
        return <RoomPage room={room} friends={friends} ownProfile={profile.profile} invite={route.invite} navigate={navigate} onPlay={enterRoomGame} />;
      case 'createRoom':
        return <CreateRoomPage selected={selectedRoomGame} select={selectRoomGame} navigate={navigate} />;
      case 'play': {
        const id = route.id;
        const board = isBoardGame(id) ? id : undefined;
        const online = route.online;
        const local = board ? localBoards[board] : undefined;
        if (online && playGame !== id) {
          return <RoomPage room={room} friends={friends} ownProfile={profile.profile} invite="" navigate={navigate} onPlay={enterRoomGame} />;
        }
        if (id === 'liar') {
          if (!online) return <div className="site-width subpage">
            <p>{t('liarOnlineOnly')}</p><RouteLink href={gamePath(id, 'setup', 'online')} navigate={navigate} className="button button-primary">{t('settings')}</RouteLink>
          </div>;
          if (!room.liar || !room.role) return <p role="status">{t('loading')}</p>;
          return <Suspense fallback={<div className="surface stage-loading" role="status">{t('loading')}</div>}>
            <LiarPage room={{ ...room, liar: room.liar, role: room.role }} ownProfile={profile.profile} navigate={navigate}
            dark={preferences.dark} antialias={preferences.antialias} resolution={preferences.resolution}
            onResolution={preferences.changeResolution} onAntialias={preferences.changeAntialias}
            showTouches={preferences.showTouches} onTouchDisplay={preferences.changeShowTouches} touchStyle={profile.profile?.touchEffect ?? 'soft'}
            record={apiAvailable && profile.profile && !room.testMatch ? profile.record : undefined} />
          </Suspense>;
        }
        if (id === 'sketch') {
          const sketchRoom = online && room.sketch && room.role ? { ...room, sketch: room.sketch, role: room.role } : undefined;
          if (online && !sketchRoom) return <p role="status">{t('loading')}</p>;
          return <SketchPage room={sketchRoom} settings={settings.sketch} ownProfile={profile.profile} navigate={navigate}
            dark={preferences.dark} antialias={preferences.antialias} resolution={preferences.resolution}
            onResolution={preferences.changeResolution} onAntialias={preferences.changeAntialias} showTouches={preferences.showTouches}
            onTouchDisplay={preferences.changeShowTouches} touchStyle={profile.profile?.touchEffect ?? 'soft'}
            record={online && apiAvailable && profile.profile && !room.testMatch ? profile.record : undefined} />;
        }
        if (id === 'slime') {
          const slimeRoom = online && room.slime && room.role ? { ...room, slime: room.slime, role: room.role } : undefined;
          if (online && !slimeRoom) return <p role="status">{t('loading')}</p>;
          return <Suspense fallback={<div className="surface stage-loading" role="status">{t('loading')}</div>}>
            <SlimePage room={slimeRoom} ownProfile={profile.profile} navigate={navigate}
              dark={preferences.dark} antialias={preferences.antialias} resolution={preferences.resolution}
              onResolution={preferences.changeResolution} onAntialias={preferences.changeAntialias} showTouches={preferences.showTouches}
              onTouchDisplay={preferences.changeShowTouches} touchStyle={profile.profile?.touchEffect ?? 'soft'}
              record={online && apiAvailable && profile.profile && !room.testMatch ? profile.record : undefined} />
          </Suspense>;
        }
        if (id === 'sichuan' || id === 'memory') {
          const puzzleRoom = online && room.puzzle && room.puzzleConfig && room.role
            ? { ...room, puzzle: room.puzzle, puzzleConfig: room.puzzleConfig, role: room.role } : undefined;
          if (online && !puzzleRoom) return <p role="status">{t('loading')}</p>;
          return <SichuanPage game={id} settings={id === 'memory' ? settings.memory.settings : sichuanSettings}
            room={puzzleRoom} ownProfile={profile.profile}
            dark={preferences.dark} antialias={preferences.antialias} resolution={preferences.resolution}
            onResolution={preferences.changeResolution} onAntialias={preferences.changeAntialias} showTouches={preferences.showTouches}
            onTouchDisplay={preferences.changeShowTouches} touchStyle={profile.profile?.touchEffect ?? 'soft'} navigate={navigate}
            record={online && apiAvailable && profile.profile && !room.testMatch ? profile.record : undefined} />;
        }
        return <PlayPage id={id} dark={preferences.dark} antialias={preferences.antialias} power={power} flickSettings={flickSettings} turnLimit={turnLimit} navigate={navigate}
          resolution={preferences.resolution} onResolution={preferences.changeResolution} onAntialias={preferences.changeAntialias}
          showTouches={preferences.showTouches} onTouchDisplay={preferences.changeShowTouches} touchStyle={profile.profile?.touchEffect ?? 'soft'}
          room={online ? room : undefined} ownProfile={profile.profile} history={online ? room.history : local?.history ?? []}
          boardRound={online ? undefined : local}
          allowDoubleThree={online ? room.allowDoubleThree : local?.allowDoubleThree ?? true}
          overline={online ? room.overline : local?.overline ?? defaultMatchSettings.overline} record={online && apiAvailable && profile.profile && !room.testMatch ? profile.record : undefined}
          move={online ? room.move : index => { if (board) updateLocalBoard(board, (current, now) => moveLocalBoard(board, current, index, now)); }}
          reset={online ? room.rematch : () => { if (board) updateLocalBoard(board, (current, now) => rematchLocalBoard(board, current, now)); }}
          startLocal={(matchId, at) => { if (board) updateLocalBoard(board, current => setLocalStart(current, matchId, at)); }}
          endLocal={(color, deadline) => { if (board) updateLocalBoard(board, (current, now) => endLocalBoard(current, color, now, deadline)); }}
          decideLocal={(choice, at) => { if (board) updateLocalBoard(board, (current, now) => decideLocalBoard(current, choice, at, now)); }} />;
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
            <div className="header-room-actions">
              <RouteLink href="/room" navigate={navigate} className={'header-room-link' + (roomOpen ? ' header-active-room attention-button' : '')}
                aria-label={roomActionLabel} title={roomActionLabel} aria-current={route.page === 'room' ? 'page' : undefined}>
                <span className={roomOpen ? 'room-marker room-marker-active' : 'room-marker'} aria-hidden="true" />
                <span className="header-room-copy">
                  <span className="header-room-label">{roomAction}</span>
                  {roomTitle && <ScrollingLabel text={roomTitle} />}
                </span>
              </RouteLink>
              <RouteLink href="/room/create" navigate={navigate} className="header-room-link header-create" aria-label={t('newRoom')}
                title={t('newRoom')} aria-current={route.page === 'createRoom' ? 'page' : undefined}>
                <span className="header-create-icon" aria-hidden="true">+</span><span className="header-room-label">{t('newRoom')}</span>
              </RouteLink>
            </div>
            <div className="header-account-actions">
              <ProfileNav profile={profile.profile} navigate={navigate} unreadRequests={friends.unreadIncoming} />
              <SettingsMenu preferences={preferences} levels={audioLevels} onVolume={changeVolume} path={path}
                presence={apiAvailable && profile.profile ? { mode: presence, change: mode => profile.setPreferences({ presence: mode }) } : undefined} />
            </div>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="route-frame"><BackNavigation.Provider value={backNavigation}><div className="route-content" key={path} data-play-game={backdropGame}>
        {backdropGame && <div className="game-backdrop" aria-hidden="true" key={backdropGame}><img src={games[backdropGame].art} alt="" decoding="async" /></div>}
        <ReactionUsageContext.Provider value={route.page === 'play' && route.online && room.testMatch ? undefined : profile.recordReaction}>
          <RoomRankingContext.Provider value={route.page === 'play' && route.online && playGame
            ? { entries: room.roomHistory, participants: room.participants, test: room.testMatch,
              matchId: room.matchId, roomTitle: room.title, finished: Boolean(room.finishedAt) } : undefined}>
            <MatchRecoveryContext.Provider value={route.page === 'play' && route.online && room.recoveryAt
              ? { since: room.recoveryAt, players: room.recoveryPlayers,
                exit: () => { room.exitInterruptedMatch(); navigate('/', true); } } : undefined}>
              {page}
            </MatchRecoveryContext.Provider>
          </RoomRankingContext.Provider>
        </ReactionUsageContext.Provider>
      </div></BackNavigation.Provider></main>
      <footer className="site-footer">
        <div className="site-width footer-row">
          <div className="footer-identity">
            <RouteLink href="/" navigate={navigate} className="brand"><img src={logo} alt="" width="30" height="30" /><strong>Nori<span>verse</span></strong></RouteLink>
            <p>{t('footerInfo')}</p>
          </div>
          <nav className="footer-links" aria-label={t('siteLinks')}>
            <RouteLink href="/games" navigate={navigate}>{t('games')}</RouteLink>
            <RouteLink href={explorerPath()} navigate={navigate} aria-current={route.page === 'explorers' ? 'page' : undefined}>{t('explorers')}</RouteLink>
            <a href="https://github.com/artrointel/Noriverse">{t('sourceCode')}</a>
            <a href={licenseUrl} target="_blank" rel="noopener">{t('license')}</a>
          </nav>
        </div>
        <div className="site-width footer-meta"><small>© {new Date().getFullYear()} Noriverse</small></div>
      </footer>
      <NotificationToasts model={invitations} badges={profile.badgeToasts} dismissBadge={profile.dismissBadge}
        openBadges={() => navigate('/profile')} accept={invite => {
        if (room.code !== invite.code) room.join(invite.code);
        navigate('/room?room=' + invite.code);
      }} />
      <FriendRequestToast key={friends.owner} model={friends} navigate={navigate}
        enabled={route.page === 'room' || (presence === 'online' && route.page !== 'friends')} />
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
