import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../packages/protocol/profile.ts';
import licenseUrl from '../../../LICENSE?url&no-inline';
import logo from './assets/noriverse-icon.png';
import { boardRules, isBoardGame } from './games/board-rules.ts';
import type { BoardGame } from './games/board-rules.ts';
import { useRoomBoard } from './network/use-room-board.ts';
import { apiAvailable } from './network/api.ts';
import type { GameId } from './games/scenes.ts';
import type { Stone } from './games/table.ts';
import { bindPageAudio, loadAudioLevels, playSound, setAudioLevels, setMusicScene } from './platform/audio.ts';
import type { AudioLevels } from './platform/audio.ts';
import { CatalogPage, GameDetail, GameSetup } from './platform/catalog-pages.tsx';
import type { Power } from './platform/catalog-pages.tsx';
import { gamePath, RouteLink, useNavigation } from './platform/navigation.tsx';
import type { GameMode } from './platform/navigation.tsx';
import { createLocalRound, PlayPage } from './platform/play-page.tsx';
import { RoomPage } from './platform/room-page.tsx';
import { usePreferences } from './platform/preferences.ts';
import { SettingsMenu } from './platform/settings-menu.tsx';
import { NameDialog, ProfileNav, ProfilePage, useProfile } from './platform/profiles.tsx';
import './styles.css';

function createLocalBoard(allowDoubleThree = true) {
  return { ...createLocalRound(), history: [] as number[], allowDoubleThree };
}

function App() {
  const { t, i18n } = useTranslation();
  const preferences = usePreferences();
  const { route, path, navigate } = useNavigation();
  const room = useRoomBoard();
  const profile = useProfile();
  const [localBoards, setLocalBoards] = useState(() => ({ omok: createLocalBoard(), othello: createLocalBoard() }));
  const [power, setPower] = useState<Power>('standard');
  const [allowDoubleThree, setAllowDoubleThree] = useState(true);
  const [nameDismissed, setNameDismissed] = useState(false);
  const [editName, setEditName] = useState(false);
  const [pendingFavorite, setPendingFavorite] = useState<GameId>();
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState(false);
  const [audioLevels, setLevelState] = useState(loadAudioLevels);
  const lastPath = useRef(path);
  const matchOpened = useRef(false);
  const lastAwayResult = useRef('');

  useEffect(bindPageAudio, []);
  useEffect(() => { setAudioLevels(audioLevels); }, [audioLevels]);

  useEffect(() => {
    if (path === lastPath.current) return;
    lastPath.current = path;
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    playSound('navigate');
  }, [path]);

  useEffect(() => { setMusicScene(route.page === 'play' ? route.id : 'lobby'); }, [route.page, route.id]);

  useEffect(() => {
    if (!profile.profile || !room.role || !room.finishedAt || !room.matchId || lastAwayResult.current === room.matchId
      || (route.page === 'play' && route.id === room.game && route.online)) return;
    const winner = room.surrendered ? (room.surrendered === 1 ? 2 : 1) : boardRules[room.game].result(room.history);
    if (!winner) return;
    const matchId = room.matchId;
    lastAwayResult.current = matchId;
    const side = room.role === 'host' ? 1 : 2;
    void profile.record({
      id: matchId, game: room.game, mode: 'online', outcome: winner === 'draw' ? 'draw' : winner === side ? 'win' : 'loss',
      seconds: elapsedPlaySeconds(room.startedAt, room.finishedAt),
    }).then(saved => { if (!saved && lastAwayResult.current === matchId) lastAwayResult.current = ''; });
  }, [profile.profile, profile.record, room.game, room.role, room.finishedAt, room.matchId, room.history, room.surrendered, room.startedAt, route]);

  useEffect(() => {
    const view = route.id ? t(route.id) : route.page === 'room' ? t('room')
      : route.page === 'games' ? t('library') : null;
    const brand = i18n.resolvedLanguage === 'ko' ? '놀이버스' : 'Noriverse';
    document.title = view ? view + ' · ' + brand : brand + ' · ' + t('siteSummary');
  }, [route, t, i18n.resolvedLanguage]);

  useEffect(() => {
    if (!room.started) {
      matchOpened.current = false;
    } else if (!matchOpened.current) {
      matchOpened.current = true;
      if (room.role === 'guest' && route.page === 'room') navigate(gamePath(room.game, 'play', 'online'));
    }
  }, [room.game, room.started, room.role, route.page, navigate]);

  function startGame(mode: GameMode) {
    if (route.page !== 'setup') return;
    const id = route.id;
    if (mode === 'online' && isBoardGame(id)) {
      if (!room.code && room.state !== 'joining') void room.create(id, allowDoubleThree);
      navigate('/room');
    } else {
      if (isBoardGame(id)) resetBoard(id, allowDoubleThree);
      navigate(gamePath(id, 'play', mode));
    }
  }

  function resetBoard(id: BoardGame, allowRule = localBoards[id].allowDoubleThree) {
    setLocalBoards(previous => ({ ...previous, [id]: createLocalBoard(allowRule) }));
  }

  function placeLocal(id: BoardGame, index: number) {
    const time = Date.now();
    setLocalBoards(previous => {
      const current = previous[id];
      if (current.finishedAt) return previous;
      const rules = boardRules[id];
      const history = rules.place(current.history, index, current.allowDoubleThree);
      return history ? { ...previous, [id]: { ...current, history, finishedAt: rules.result(history) ? time : 0 } } : previous;
    });
  }

  function surrenderBoard(id: BoardGame, color: Stone) {
    const time = Date.now();
    setLocalBoards(previous => previous[id].finishedAt ? previous
      : { ...previous, [id]: { ...previous[id], finishedAt: time, surrendered: color } });
  }

  function enterRoomGame() {
    room.start();
    navigate(gamePath(room.game, 'play', 'online'));
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
          onFavorite={toggleFavorite} />;
      case 'profile':
      case 'publicProfile':
        return <ProfilePage own={route.page === 'profile'} id={route.profileId} model={profile} navigate={navigate}
          edit={() => setEditName(true)} />;
      case 'detail':
        return <GameDetail id={route.id} navigate={navigate} />;
      case 'setup':
        return <GameSetup id={route.id} online={route.online} practice={route.practice} power={power} onPower={setPower}
          allowDoubleThree={allowDoubleThree} onRule={setAllowDoubleThree} activeGame={room.code ? room.game : undefined} onStart={startGame} navigate={navigate} />;
      case 'room':
        return <RoomPage room={room} invite={route.invite} navigate={navigate} onPlay={enterRoomGame} />;
      case 'play': {
        const id = route.id;
        const board = isBoardGame(id) ? id : undefined;
        const online = Boolean(board && route.online);
        const local = board ? localBoards[board] : undefined;
        if (online && (!room.code || !room.started || room.game !== id)) {
          return <RoomPage room={room} invite="" navigate={navigate} onPlay={enterRoomGame} />;
        }
        return <PlayPage id={id} dark={preferences.dark} power={power} practice={id === 'physics' && route.practice} navigate={navigate}
          room={online ? room : undefined} history={online ? room.history : local?.history ?? []}
          boardRound={online ? undefined : local}
          allowDoubleThree={online ? room.allowDoubleThree : local?.allowDoubleThree ?? true} record={profile.profile ? profile.record : undefined}
          move={online ? room.move : index => { if (board) placeLocal(board, index); }}
          reset={online ? room.rematch : () => { if (board) resetBoard(board); }}
          surrenderLocal={color => { if (board) surrenderBoard(board, color); }} />;
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
            <SettingsMenu preferences={preferences} levels={audioLevels} onVolume={changeVolume} path={path} />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="route-frame"><div className="route-content" key={path}>{page}</div></main>
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
      {(editName || (profile.status === 'missing' && !nameDismissed && route.page !== 'publicProfile')) && (
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
