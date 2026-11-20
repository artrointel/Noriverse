const words = {
  ko: {
    adjectives: ['신나는', '재빠른', '용감한', '반짝이는', '느긋한', '영리한', '엉뚱한', '씩씩한', '다정한', '고요한'],
    characters: ['수달', '보름달', '바둑돌', '여우', '새싹', '별똥별', '구름', '너구리', '오리', '해바라기'],
  },
  en: {
    adjectives: ['Sunny', 'Nimble', 'Brave', 'Cosmic', 'Quiet', 'Lucky', 'Clever', 'Jolly', 'Swift', 'Gentle'],
    characters: ['Otter', 'Moon', 'Pebble', 'Fox', 'Sprout', 'Comet', 'Cloud', 'Raccoon', 'Duck', 'Finch'],
  },
};

export function randomPlayerName(language: string | undefined, previous = '') {
  const { adjectives, characters } = language?.toLowerCase().split('-')[0] === 'ko' ? words.ko : words.en;
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const index = Math.floor(Math.random() * characters.length);
  const name = adjective + ' ' + characters[index];
  return name === previous ? adjective + ' ' + characters[(index + 1) % characters.length] : name;
}
