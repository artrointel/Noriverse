import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import logo from './assets/noriverse-icon.png';
import { place, result } from './games/omok/rules.ts';
import { useRoomBoard } from './network/use-room-board.ts';
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
import { NameDialog, ProfilePage, useProfile } from './platform/profiles.tsx';
import './styles.css';

function App() {
  const { t, i18n } = useTranslation();
  const preferences = usePreferences();
  const { route, path, navigate } = useNavigation();
  const room = useRoomBoard();
  const profile = useProfile();
  const [localOmok, setLocalOmok] = useState(() => ({ ...createLocalRound(), history: [] as number[], allowDoubleThree: true }));
  const [power, setPower] = useState<Power>('standard');
  const [allowDoubleThree, setAllowDoubleThree] = useState(true);
  const [nameDismissed, setNameDismissed] = useState(false);
  const [editName, setEditName] = useState(false);
  const [audioLevels, setLevelState] = useState(loadAudioLevels);
  const lastPath = useRef(path);
  const matchOpened = useRef(false);

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
      if (room.role === 'guest' && route.page === 'room') navigate(gamePath('omok', 'play', 'online'));
    }
  }, [room.started, room.role, route.page, navigate]);

  function startGame(mode: GameMode) {
    if (route.page !== 'setup') return;
    if (mode === 'online') {
      if (!room.code && room.state !== 'joining') void room.create(allowDoubleThree);
      navigate('/room');
    } else {
      if (route.id === 'omok') resetOmok(allowDoubleThree);
      navigate(gamePath(route.id, 'play', mode));
    }
  }

  function resetOmok(allowRule = localOmok.allowDoubleThree) {
    setLocalOmok({ ...createLocalRound(), history: [], allowDoubleThree: allowRule });
  }

  function placeLocal(index: number) {
    const time = Date.now();
    setLocalOmok(current => {
      const history = place(current.history, index, current.allowDoubleThree);
      return history ? { ...current, history, finishedAt: result(history) ? time : 0 } : current;
    });
  }

  function changeVolume(channel: keyof AudioLevels, value: number) {
    const levels = { ...audioLevels, [channel]: value };
    setLevelState(levels);
    try { localStorage.setItem('noriverse.audio', JSON.stringify(levels)); } catch { /* Storage is optional. */ }
  }

  const page = (() => {
    switch (route.page) {
      case 'home':
      case 'games':
        return <CatalogPage home={route.page === 'home'} navigate={navigate} />;
      case 'profile':
      case 'publicProfile':
        return <ProfilePage own={route.page === 'profile'} id={route.profileId} model={profile} navigate={navigate}
          edit={() => setEditName(true)} />;
      case 'detail':
        return <GameDetail id={route.id} navigate={navigate} />;
      case 'setup':
        return <GameSetup id={route.id} online={route.online} practice={route.practice} power={power} onPower={setPower}
          allowDoubleThree={allowDoubleThree} onRule={setAllowDoubleThree} hasRoom={Boolean(room.code)} onStart={startGame} navigate={navigate} />;
      case 'room':
        return <RoomPage room={room} invite={route.invite} navigate={navigate} onPlay={() => {
          room.start();
          navigate(gamePath('omok', 'play', 'online'));
        }} />;
      case 'play': {
        const online = route.id === 'omok' && route.online;
        if (online && (!room.code || !room.started)) {
          return <RoomPage room={room} invite="" navigate={navigate} onPlay={room.start} />;
        }
        return <PlayPage id={route.id} dark={preferences.dark} power={power} practice={route.id === 'physics' && route.practice} navigate={navigate}
          room={online ? room : undefined} history={online ? room.history : route.id === 'omok' ? localOmok.history : []}
          omokRound={route.id === 'omok' && !online ? localOmok : undefined}
          allowDoubleThree={online ? room.allowDoubleThree : localOmok.allowDoubleThree} record={profile.profile ? profile.record : undefined}
          move={online ? room.move : placeLocal} reset={online ? room.rematch : resetOmok} />;
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
      <a className="skip-link" href="#main">{t('skip')}</a>
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
            <RouteLink href="/room" navigate={navigate} className="header-join">
              <span className={room.code ? 'room-marker room-marker-active' : 'room-marker'} aria-hidden="true" />
              {t(room.code ? 'activeRoom' : 'joinRoom')}
            </RouteLink>
            <RouteLink href="/profile" navigate={navigate} className="profile-link" aria-label={t('myProfile')} title={profile.profile?.name ?? t('myProfile')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="8" r="3.2" /><path d="M5 20v-2a7 5 0 0 1 14 0v2" />
              </svg>
            </RouteLink>
            <SettingsMenu preferences={preferences} levels={audioLevels} onVolume={changeVolume} path={path} />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="route-frame"><div className="route-content" key={path}>{page}</div></main>
      <footer className="site-footer">
        <div className="site-width footer-row">
          <RouteLink href="/" navigate={navigate} className="brand"><img src={logo} alt="" width="30" height="30" /><strong>Nori<span>verse</span></strong></RouteLink>
          <p>{t('siteSummary')}</p>
        </div>
      </footer>
      {(editName || (profile.status === 'missing' && !nameDismissed && route.page !== 'publicProfile')) && (
        <NameDialog name={profile.profile?.name} close={() => { setNameDismissed(true); setEditName(false); }} save={profile.saveName} />
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
