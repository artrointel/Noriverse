import { emojiChoices, emojiIds } from '../../../../packages/protocol/reactions.ts';
import type { Emoji } from '../../../../packages/protocol/reactions.ts';

const terms = {
  smile: ['웃음 행복 미소', 'Smile happy grin'], laugh: ['폭소 웃음 눈물', 'Laugh tears joy lol'],
  surprise: ['놀람 깜짝', 'Surprise wow shock'], thinking: ['고민 생각 의문', 'Thinking curious hmm'],
  sad: ['슬픔 눈물 울음', 'Sad tear crying'], anger: ['분함 화 짜증', 'Frustration anger huff'],
  hearts: ['하트 눈|사랑 좋아', 'Heart eyes|love adore'], clap: ['박수 잘했어', 'Clap applause bravo'],
  thumbsUp: ['엄지 척|좋아 최고', 'Thumbs up|like good'], handshake: ['악수 협력 인사', 'Handshake deal team'],
  fire: ['불꽃 불 뜨거움', 'Fire flame lit hot'], celebrate: ['축하 파티 폭죽', 'Celebrate party popper confetti'],
  grin: ['활짝 웃음|미소', 'Grin smile happy'], wink: ['윙크 눈 장난', 'Wink playful eye'],
  sweatSmile: ['식은땀 민망 웃음', 'Sweat smile relief awkward'], victory: ['브이 승리 평화 손', 'Victory peace two hand'],
  salute: ['경례 존경 인사', 'Salute respect yes'], hug: ['포옹 안아줘 하트', 'Hug embrace care'],
  hot: ['더위 열 땀', 'Hot heat sweating'], cold: ['추위 얼음 오들오들', 'Cold freeze ice'],
  sunglasses: ['선글라스 멋짐 쿨', 'Sunglasses cool awesome'], mindBlown: ['충격 놀람 머리 폭발', 'Mind blown|shocked explode'],
  scream: ['비명 공포 놀람', 'Scream fear shocked'], cry: ['울음 눈물 슬픔', 'Cry tears sob sad'],
  worried: ['걱정 불안', 'Worried anxious nervous'], dizzy: ['어지러움 혼란', 'Dizzy spiral confused'],
  sleeping: ['잠 졸림 피곤', 'Sleeping tired zzz'], angry: ['화남 분노 빨강', 'Angry rage mad'],
  upsideDown: ['거꾸로 장난 웃음', 'Upside down silly smile'], shush: ['조용 비밀 쉿', 'Shush quiet secret'],
  eyes: ['눈 보기 관찰', 'Eyes look watching'], facepalm: ['이마 황당 실수', 'Facepalm oops mistake'],
  skull: ['해골 뼈 죽음', 'Skull bones dead'], ghost: ['유령 귀신 할로윈', 'Ghost spooky halloween'],
  robot: ['로봇 봇 기계', 'Robot bot machine'], alien: ['외계인 우주', 'Alien space ufo'],
  cat: ['고양이 동물 야옹', 'Cat animal kitten'], dog: ['강아지 개 동물', 'Dog animal puppy'],
  fox: ['여우 동물', 'Fox animal'], frog: ['개구리 동물', 'Frog animal'],
  panda: ['판다 팬더 곰 동물', 'Panda bear animal'], penguin: ['펭귄 새 동물', 'Penguin bird animal'],
  heart: ['하트 사랑 좋아', 'Heart love red'], brokenHeart: ['깨진 하트|이별 슬픔', 'Broken heart|heartbreak sad'],
  sparkle: ['반짝임 빛 별', 'Sparkles shine stars'], star: ['별 스타 빛', 'Star shine gold'],
  trophy: ['트로피 우승 승리', 'Trophy winner cup victory'], medal: ['금메달 우승 1등', 'Gold medal|winner first'],
  crown: ['왕관 왕 여왕', 'Crown king queen'], lightning: ['번개 전기 빠름', 'Lightning bolt electricity speed'],
  rocket: ['로켓 우주 빠름', 'Rocket space speed'], rainbow: ['무지개 색깔', 'Rainbow color'],
  snowflake: ['눈송이 눈 겨울', 'Snowflake snow winter cold'], dice: ['주사위 게임 운', 'Dice game luck'],
  puzzle: ['퍼즐 조각 사천성', 'Puzzle piece game'], flex: ['근육 힘 파이팅', 'Flex muscle strength strong'],
  raisedHands: ['만세 환호 축하 손', 'Raised hands|hooray celebrate'], fistBump: ['주먹 인사 파이팅', 'Fist bump|punch'],
  pray: ['기도 감사 부탁 손', 'Folded hands|pray please thanks'], ok: ['오케이 좋아 손', 'OK hand|good okay'],
  thumbsDown: ['엄지 아래|싫어요', 'Thumbs down|dislike bad'], coffee: ['커피 음료 휴식', 'Coffee drink break'],
  pizza: ['피자 음식', 'Pizza food slice'], popcorn: ['팝콘 음식 구경 영화', 'Popcorn food movie watch'],
  musicalNote: ['음표 음악 노래', 'Musical note|music song'], gift: ['선물 생일 축하', 'Gift present birthday'],
  hourglass: ['모래시계 시간 기다림', 'Hourglass timer wait time'],
} satisfies Record<Emoji, [string, string]>;

export function emojiName(emoji: Emoji, language: string | undefined) {
  const text = terms[emoji][language?.startsWith('ko') ? 0 : 1];
  return text.includes('|') ? text.split('|')[0] : text.split(' ')[0];
}

export function searchEmojis(query: string) {
  const words = query.trim().normalize('NFKC').toLowerCase().split(/\s+/);
  return emojiIds.filter(emoji => {
    const text = [emojiChoices[emoji], ...terms[emoji]].join(' ').replaceAll('|', ' ').toLowerCase();
    return words.every(word => text.includes(word));
  });
}
