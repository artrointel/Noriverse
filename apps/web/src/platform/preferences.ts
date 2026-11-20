import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useState } from 'react';

const ko = {
  home: '홈', games: '게임', joinRoom: '방 참가', goToRoom: '대기실',
  skip: '본문으로 이동', siteSummary: '친구와 바로 즐기는 웹 게임',
  heroKicker: '설치 없이, 친구와 바로',
  heroTitle: '오늘 뭐 하고', heroAccent: '놀까?',
  heroBody: '링크 하나로 친구를 초대하고, 바로 한 판 시작하세요.',
  browse: '게임 둘러보기', library: '게임 라이브러리', libraryIntro: '지금 즐길 게임을 골라보세요.',
  all: '전체', strategy: '전략', action: '액션', twoPlayers: '2인', soloOrPair: '1–2인',
  inviteTitle: '친구가 기다리고 있나요?', inviteBody: '받은 링크를 열거나 방 코드를 입력해 바로 참가하세요.',
  omok: '오목', physics: '알까기',
  omokCopy: '흑과 백, 한 수씩 번갈아 두며 다섯 돌을 먼저 이으세요.',
  physicsCopy: '내 돌을 튕겨 상대 돌을 바둑판 밖으로 떨어뜨리세요.',
  omokRules: '15×15 보드에서 빈 교차점을 고르세요. 가로, 세로 또는 대각선으로 같은 색 돌 다섯 개 이상을 이으면 이깁니다.',
  physicsRules: '흑과 백이 돌을 다섯 개씩 놓고 흑부터 시작합니다. 자기 돌 하나를 원하는 방향의 반대로 당겼다가 놓으세요. 돌이 모두 멈추면 차례가 넘어갑니다. 자기 돌도 판 밖으로 나가면 제거됩니다. 상대 돌을 모두 떨어뜨리면 승리하며, 같은 수에 양쪽 돌이 모두 사라지면 무승부입니다.',
  rules: '게임 방법', selectGame: '플레이하기', settings: '게임 설정', gameMode: '플레이 방식',
  local: '한 기기에서', localCopy: '화면을 공유하고 차례대로 두세요.',
  localFlickCopy: '한 화면에서 자기 돌을 번갈아 튕기세요.',
  online: '친구와 온라인', onlineCopy: '방을 만들고 링크로 친구를 초대하세요.',
  practice: '혼자 연습', practiceCopy: '두 말을 움직이면서 충돌과 조작을 익히세요.',
  force: '발사 강도', standard: '표준', fast: '빠르게',
  start: '게임 시작', backToGames: '게임 목록',
  fullscreen: '전체 화면', restore: '전체 화면 나가기', board: '오목판', physicsBoard: '알까기 경기장',
  loading: '게임 불러오는 중', gameError: '게임을 불러오지 못했습니다.',
  boardHelp: '빈 교차점을 선택하세요. 방향키와 Enter로도 둘 수 있습니다.',
  physicsHelp: '돌을 누르고 뒤로 당겼다가 놓으세요. 키보드는 A/D로 돌 선택, 방향키로 조준과 세기 조절, Enter로 발사합니다.',
  settling: '돌이 멈추면 차례가 넘어갑니다', remaining: '{{count}}개 남음',
  room: '친구 대기실', newRoom: '방 만들기', code: '방 코드', join: '참가',
  codeHint: '친구에게 받은 8자리 코드를 입력하세요.',
  inviteHelp: '초대 링크나 방 코드를 공유하세요. 두 자리가 차면 호스트가 게임을 시작할 수 있습니다.',
  copy: '초대 링크 복사', copied: '링크 복사됨', link: '초대 링크', leave: '방 나가기', retry: '다시 연결',
  joining: '방에 접속하는 중', waiting: '친구를 기다리는 중', connecting: '친구와 연결하는 중',
  connected: '친구와 연결됨', disconnected: '연결이 끊겼습니다. 같은 방에 다시 연결할 수 있습니다.',
  failed: '연결하지 못했습니다. 방 서비스 또는 네트워크를 확인하세요.',
  full: '이 방은 이미 가득 찼습니다.', missing: '방을 찾을 수 없거나 만료되었습니다.',
  host: '호스트', guest: '친구', me: '나', openSeat: '참가 대기', waitingStart: '호스트가 시작하기를 기다리는 중',
  resume: '경기 계속', reset: '다시 시작', rematch: '재경기', resultTitle: '경기 결과',
  black: '흑', white: '백', turns: '{{stone}} 차례', winner: '{{stone}} 승리', draw: '무승부',
  played_one: '{{count}}수', played_other: '{{count}}수', position: '{{row}}행 {{column}}열',
  language: '언어', theme: '테마', system: '시스템', light: '라이트', dark: '다크',
  openSettings: '개인 설정', closeSettings: '설정 닫기', sound: '사운드', musicVolume: '배경음', effectsVolume: '효과음',
  activeRoom: '진행 중인 방', notFound: '페이지를 찾을 수 없습니다',
  myProfile: '내 프로필', publicProfile: '공개 프로필', profilePrompt: '어떤 이름으로 플레이할까요?',
  profileNotice: '공유 링크를 가진 사람은 이름, 레벨과 게임 기록을 볼 수 있습니다.',
  displayName: '표시 이름', namePlaceholder: '최대 24자', saveName: '이름 저장', editName: '이름 수정',
  later: '나중에', profileError: '프로필을 저장하지 못했습니다. 다시 시도하세요.',
  profileLoading: '프로필 불러오는 중', profileMissing: '프로필을 찾을 수 없습니다', shareProfile: '프로필 링크 복사',
  levelValue: '레벨 {{level}}', playTime: '플레이 시간', recordScore: '{{wins}}승 {{losses}}패 {{draws}}무',
  recentMatches: '최근 게임', emptyHistory: '아직 기록이 없습니다.',
  recordSource: '게임을 마친 브라우저에서 제출한 기록입니다.',
  outcome_win: '승리', outcome_loss: '패배', outcome_draw: '무승부', outcome_practice: '연습',
  matchResult: '{{game}} 결과', practiceDone: '연습 완료', finishPractice: '연습 종료', restartPractice: '다시 연습', saveResult: '기록 다시 저장',
  savingResult: '기록 저장 중', savedResult: '프로필에 기록됨', failedResult: '기록을 저장하지 못했습니다.',
  localRecord: '한 기기 대전은 흑 기준으로 프로필에 기록합니다.',
  rule33: '오목 3–3', allow33: '3–3 허용', ban33: '흑 3–3 금지',
  rule33Help: '한 수로 두 방향에 열린 삼을 만드는 수입니다. 금지 모드에서는 흑의 3–3 착수를 막습니다.',
  made33: '3–3!', blocked33: '흑의 3–3은 이 경기에서 금지된 수입니다.',
};

const en: Record<keyof typeof ko, string> = {
  home: 'Home', games: 'Games', joinRoom: 'Join a room', goToRoom: 'Lobby',
  skip: 'Skip to content', siteSummary: 'Browser games to play with friends',
  heroKicker: 'Instant games with friends',
  heroTitle: 'Ready to', heroAccent: 'play?',
  heroBody: 'Invite a friend with a link and jump straight into a game.',
  browse: 'Explore games', library: 'Game library', libraryIntro: 'Pick what you want to play.',
  all: 'All', strategy: 'Strategy', action: 'Action', twoPlayers: '2 players', soloOrPair: '1–2 players',
  inviteTitle: 'Is a friend waiting?', inviteBody: 'Open their invite link or enter their room code to join.',
  omok: 'Omok', physics: 'Alkkagi',
  omokCopy: 'Take turns placing black and white stones. Connect five first to win.',
  physicsCopy: 'Flick your stones to knock your opponent’s stones off the board.',
  omokRules: 'Choose an empty intersection on the 15×15 board. Connect at least five stones of your color horizontally, vertically or diagonally to win.',
  physicsRules: 'Each side starts with five stones. Black goes first. Pull one of your stones back and release to flick it. Turns change when the stones stop moving. Any stone that leaves the board is out, including your own. Clear all the opponent’s stones to win. If both sides lose their last stones on one shot, it is a draw.',
  rules: 'How to play', selectGame: 'Play', settings: 'Game settings', gameMode: 'Play mode',
  local: 'On this device', localCopy: 'Share the screen and take turns.',
  localFlickCopy: 'Share the screen and take turns flicking your own stones.',
  online: 'Online with a friend', onlineCopy: 'Create a room and invite a friend with a link.',
  practice: 'Solo practice', practiceCopy: 'Move both discs to practice your aim.',
  force: 'Flick power', standard: 'Standard', fast: 'Fast',
  start: 'Start game', backToGames: 'All games',
  fullscreen: 'Fullscreen', restore: 'Exit fullscreen', board: 'Omok board', physicsBoard: 'Disc arena',
  loading: 'Loading game', gameError: 'The game could not load.',
  boardHelp: 'Select an empty intersection, or use the arrow keys and Enter.',
  physicsHelp: 'Press a stone, pull back, and release. On a keyboard, use A/D to select, the arrows to aim and set power, and Enter to flick.',
  settling: 'Waiting for the stones to stop', remaining: '{{count}} left',
  room: 'Friend lobby', newRoom: 'Create room', code: 'Room code', join: 'Join',
  codeHint: 'Enter the 8-character code your friend shared.',
  inviteHelp: 'Share the link or room code. The host can start once both players arrive.',
  copy: 'Copy invite link', copied: 'Link copied', link: 'Invite link', leave: 'Leave room', retry: 'Reconnect',
  joining: 'Joining the room', waiting: 'Waiting for a friend', connecting: 'Connecting to your friend',
  connected: 'Connected to your friend', disconnected: 'Connection lost. You can reconnect to the same room.',
  failed: 'Could not connect. Check the room service or your network.',
  full: 'This room is full.', missing: 'The room could not be found or has expired.',
  host: 'Host', guest: 'Friend', me: 'You', openSeat: 'Open slot', waitingStart: 'Waiting for the host to start',
  resume: 'Resume game', reset: 'Restart', rematch: 'Rematch', resultTitle: 'Game result',
  black: 'Black', white: 'White', turns: '{{stone}} to play', winner: '{{stone}} wins', draw: 'Draw',
  played_one: '{{count}} move', played_other: '{{count}} moves', position: 'Row {{row}}, column {{column}}',
  language: 'Language', theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark',
  openSettings: 'Personal settings', closeSettings: 'Close settings', sound: 'Sound', musicVolume: 'Music', effectsVolume: 'Sound effects',
  activeRoom: 'Active room', notFound: 'Page not found',
  myProfile: 'My profile', publicProfile: 'Public profile', profilePrompt: 'What should we call you?',
  profileNotice: 'Anyone with your share link can see your name, level, and game history.',
  displayName: 'Display name', namePlaceholder: 'Up to 24 characters', saveName: 'Save name', editName: 'Edit name',
  later: 'Later', profileError: 'Could not save your profile. Please try again.',
  profileLoading: 'Loading profile', profileMissing: 'Profile not found', shareProfile: 'Copy profile link',
  levelValue: 'Level {{level}}', playTime: 'Play time', recordScore: '{{wins}} W · {{losses}} L · {{draws}} D',
  recentMatches: 'Recent games', emptyHistory: 'No game records yet.',
  recordSource: 'Records are reported by the browser that finished each game.',
  outcome_win: 'Win', outcome_loss: 'Loss', outcome_draw: 'Draw', outcome_practice: 'Practice',
  matchResult: '{{game}} result', practiceDone: 'Practice complete', finishPractice: 'End practice', restartPractice: 'Practice again', saveResult: 'Retry saving result',
  savingResult: 'Saving your result', savedResult: 'Saved to your profile', failedResult: 'Could not save this result.',
  localRecord: 'Same-device matches are recorded from Black’s side.',
  rule33: 'Omok double three', allow33: 'Allow double three', ban33: 'Ban double three for Black',
  rule33Help: 'This move creates open threes in two directions. With the ban on, Black cannot play it.',
  made33: 'Double three!', blocked33: 'Black cannot play a double three in this match.',
};

export type Language = 'ko' | 'en';
export type LanguagePreference = Language | 'system';
export type Theme = 'system' | 'light' | 'dark';

export function browserLanguage(locales: readonly string[]): Language {
  for (const locale of locales) {
    const language = locale.toLowerCase().split(/[-_]/)[0];
    if (language === 'ko' || language === 'en') return language;
  }
  return 'en';
}

function readPreference(key: string) {
  try { return localStorage.getItem('noriverse.' + key); } catch { return null; }
}

function savePreference(key: string, value: string) {
  try { localStorage.setItem('noriverse.' + key, value); } catch { /* Storage is optional. */ }
}

function getLanguagePreference(): LanguagePreference {
  const saved = readPreference('language');
  return saved === 'ko' || saved === 'en' ? saved : 'system';
}

function getTheme(): Theme {
  const saved = readPreference('theme');
  return saved === 'dark' || saved === 'light' ? saved : 'system';
}

function resolveLanguage(preference: LanguagePreference): Language {
  return preference === 'system' ? browserLanguage(navigator.languages.length ? navigator.languages : [navigator.language]) : preference;
}

const systemDark = matchMedia('(prefers-color-scheme: dark)');
void i18next.use(initReactI18next).init({
  lng: resolveLanguage(getLanguagePreference()),
  fallbackLng: 'en',
  supportedLngs: ['ko', 'en'],
  resources: { ko: { translation: ko }, en: { translation: en } },
  interpolation: { escapeValue: false },
});

export function usePreferences() {
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState(getLanguagePreference);
  const [theme, setTheme] = useState(getTheme);
  const [systemIsDark, setSystemIsDark] = useState(systemDark.matches);
  const dark = theme === 'system' ? systemIsDark : theme === 'dark';

  useEffect(() => {
    const update = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    systemDark.addEventListener('change', update);
    return () => systemDark.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const sync = () => { void i18n.changeLanguage(resolveLanguage(language)); };
    if (language !== 'system') return;
    window.addEventListener('languagechange', sync);
    return () => window.removeEventListener('languagechange', sync);
  }, [i18n, language]);

  useLayoutEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useLayoutEffect(() => { document.documentElement.lang = i18n.resolvedLanguage ?? 'en'; }, [i18n.resolvedLanguage]);

  return {
    language, theme, dark,
    changeLanguage(value: LanguagePreference) {
      setLanguage(value);
      savePreference('language', value);
      void i18n.changeLanguage(resolveLanguage(value));
    },
    changeTheme(value: Theme) {
      setTheme(value);
      savePreference('theme', value);
    },
  };
}
