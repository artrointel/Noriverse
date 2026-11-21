export const roomTitleMaxLength = 64;

const titleTemplates = {
  ko: [
    (name: string) => `${name}의 놀이버스가 간다 빵빵~`,
    (name: string) => `${name}의 웃음 충전소, 문 열었어요!`,
    (name: string) => `${name}의 우주선 출발! 친구 탑승 중`,
    (name: string) => `${name}의 놀이터에 과자 들고 모여요!`,
    (name: string) => `${name}의 한 판 더 가게, 오늘도 영업 중!`,
  ],
  en: [
    (name: string) => `${name}'s Noriverse bus is here. Beep beep!`,
    (name: string) => `${name}'s giggle station is open!`,
    (name: string) => `All aboard ${name}'s party rocket!`,
    (name: string) => `Bring snacks to ${name}'s playground!`,
    (name: string) => `${name}'s One More Round Cafe is open!`,
  ],
} as const;

export function roomTitleOptions(profileName?: string, language?: string) {
  const korean = /^ko(?:-|$)/i.test(language ?? '');
  const name = profileName || (korean ? '게스트' : 'Guest');
  return (korean ? titleTemplates.ko : titleTemplates.en).map(template => template(name));
}

export function readRoomTitle(value: unknown) {
  if (typeof value !== 'string' || /[\p{Cc}\p{Zl}\p{Zp}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)) return;
  const title = value.trim().normalize('NFC');
  if (title && title.length <= roomTitleMaxLength) return title;
}
