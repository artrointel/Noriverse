import type { ExplorerId } from '../../../../packages/protocol/explorers.ts';

type ExplorerCopy = { name: string; motif: string; role: string; summary: string; story: string };
type Explorer = { accent: string; ko: ExplorerCopy; en: ExplorerCopy };

export const explorers = {
  toring: {
    accent: '#ed8c9c',
    ko: { name: '토링', motif: '고리 행성', role: '항로 안내',
      summary: '고리의 움직임을 읽어 행성 사이의 길을 찾아요.',
      story: '토링은 고리의 얼음 조각이 움직이는 방향을 보며 자랐어요. 어느 날 친구가 길을 잃자 고리를 기울여 돌아올 방향을 가리켰죠. 이제는 꼬미가 발견한 지름길을 기록해, 처음 오는 친구도 길을 찾을 수 있도록 항로를 남겨요.' },
    en: { name: 'Toring', motif: 'Ringed planet', role: 'Navigator',
      summary: 'Reads the drift of its rings to chart paths between planets.',
      story: 'Toring grew up watching ice drift around its rings. When a friend lost their way, Toring tilted a ring to point them home. Now it charts every shortcut Kommi finds so the next crew can follow it.' },
  },
  solori: {
    accent: '#f1aa42',
    ko: { name: '솔오리', motif: '어린 항성', role: '야영지 관리',
      summary: '어둡고 추운 길에서 잠시 쉬어 갈 빛과 온기를 나눠요.',
      story: '솔오리는 멀리 비추는 별이 되고 싶어 했어요. 파루미와 첫 탐사를 나가 보니, 친구의 얼어붙은 발을 녹이는 작은 빛만으로도 다시 길을 나설 수 있었죠. 이제는 탐사대가 돌아올 때까지 야영지의 불빛을 지켜요.' },
    en: { name: 'Solori', motif: 'Young star', role: 'Camp keeper',
      summary: 'Shares warmth and light wherever the crew stops to rest.',
      story: 'Solori dreamed of shining across the whole sky. On a first trip with Parumi, a little glow was enough to warm cold feet and get the crew moving again. Solori keeps the camp lit until everyone makes it home.' },
  },
  kommi: {
    accent: '#54b9ef',
    ko: { name: '꼬미', motif: '혜성', role: '정찰',
      summary: '아무도 지나지 않은 길을 먼저 살피고 얼음 꼬리로 표시해요.',
      story: '꼬미는 새로운 곳을 발견하면 너무 신이 나서 멀리 앞서가곤 했어요. 한 번은 혼자 찾은 얼음 터널의 입구를 잊어 모두와 함께 가 볼 수 없었죠. 그 뒤로는 갈림길에서 멈춰 얼음 꼬리로 방향을 남기고 친구를 기다려요.' },
    en: { name: 'Kommi', motif: 'Comet', role: 'Scout',
      summary: 'Scouts uncharted trails and marks the way with an icy tail.',
      story: 'Kommi used to race ahead at the sight of anything new. After losing the entrance to a beautiful ice tunnel, Kommi began stopping at each fork to leave an icy trail marker and wait for the crew.' },
  },
  noeulbi: {
    accent: '#c18ce9',
    ko: { name: '노을비', motif: '성운', role: '표본 돌봄',
      summary: '성운 자락에 작은 표본을 감싸 안전하게 돌봐요.',
      story: '노을비는 먼지 구름을 지나던 중 자기 자락 안에서 작은 빛이 자라는 것을 발견했어요. 그 뒤로 탐사대가 가져온 표본을 하나씩 맡아, 어떤 빛과 온도에서 달라지는지 관찰해요. 발견을 기록하고 나면 모두가 볼 수 있게 풀어 주죠.' },
    en: { name: 'Noeulbi', motif: 'Nebula', role: 'Specimen keeper',
      summary: 'Wraps tiny discoveries in a soft cloud until they are safe to study.',
      story: 'While crossing a dust cloud, Noeulbi found a tiny light growing in the folds of its mantle. Now it cares for the crew’s specimens, records how they respond to light and warmth, and releases them for everyone to see.' },
  },
  muruon: {
    accent: '#de9067',
    ko: { name: '무루온', motif: '암석 행성', role: '쉼터 만들기',
      summary: '단단한 등과 튼튼한 발로 탐사대의 쉼터를 지어요.',
      story: '무루온은 혼자서도 충분히 단단하다고 생각했어요. 자갈 폭풍 때 탈각이가 찾아낸 돌을 겹쳐 쌓아 보니 친구 모두가 들어갈 쉼터가 됐죠. 이후에는 누가 가장 지쳐 있는지 먼저 살피고, 함께 돌을 고르며 자리를 만들어요.' },
    en: { name: 'Muruon', motif: 'Rocky planet', role: 'Shelter builder',
      summary: 'Builds safe shelters with a sturdy back and sure feet.',
      story: 'Muruon thought a sturdy shell was all it needed. During a pebble storm, stacking the stones Talgak found made a shelter big enough for everyone. Now Muruon checks who needs a rest and picks building stones with the crew.' },
  },
  parumi: {
    accent: '#6ecebb',
    ko: { name: '파루미', motif: '얼음 위성', role: '물 찾기',
      summary: '얼음 아래로 귀를 기울여 숨은 물길을 찾아요.',
      story: '감각이 예민한 파루미는 얼음 아래에서 물이 흐르는 소리를 들었어요. 솔오리가 얼음을 천천히 데우는 동안 파루미는 안전한 틈을 골랐죠. 탐사대가 그 물을 맛본 날부터, 얼음 지대에서는 모두 파루미의 신호를 기다려요.' },
    en: { name: 'Parumi', motif: 'Icy moon', role: 'Water finder',
      summary: 'Listens beneath the ice for hidden streams.',
      story: 'Parumi once heard water moving under a sheet of ice. While Solori warmed the surface, Parumi found a safe crack to reach it. Ever since the crew tasted that water, they have followed Parumi’s lead across the ice.' },
  },
  pulsori: {
    accent: '#8392ef',
    ko: { name: '펄소리', motif: '펄서', role: '통신',
      summary: '박자가 일정한 전파 신호로 멀어진 친구와 연락해요.',
      story: '펄소리의 신호는 빛이 거의 닿지 않는 골짜기에서도 끊기지 않았어요. 펄소리와 빌몽은 서로 다른 박자에 “괜찮아”, “멈춰”, “이쪽이야”라는 뜻을 정했죠. 어디에 있든 친구들이 같은 박자로 대답하면 펄소리는 마음이 놓여요.' },
    en: { name: 'Pulsori', motif: 'Pulsar', role: 'Communications',
      summary: 'Keeps the crew in touch through steady radio pulses.',
      story: 'Pulsori’s signal carried even through a valley with almost no light. Together, Pulsori and Bilmong gave different rhythms the meanings “all clear,” “stop,” and “this way.” Hearing a friend answer in rhythm always puts Pulsori at ease.' },
  },
  guriong: {
    accent: '#5ebbb2',
    ko: { name: '구리옹', motif: '가스 행성', role: '기류 관측',
      summary: '몸의 구름 띠가 움직이는 모습을 보고 폭풍을 미리 알려요.',
      story: '구리옹은 바람에 몸을 맡기며 느긋하게 떠다녀요. 탐사대가 폭풍을 만난 날, 몸을 가로지르는 구름 띠가 어떻게 움직이는지 친구들에게 보여 줬죠. 토링은 그 관측을 항로에 표시해 다 같이 바람이 잦아들 때까지 기다릴 수 있었어요.' },
    en: { name: 'Guriong', motif: 'Gas giant', role: 'Weather observer',
      summary: 'Reads the clouds in its stripes to warn the crew of storms.',
      story: 'Guriong likes to drift wherever the wind leads. When the crew met a storm, Guriong showed them how the cloud bands were moving. Toring marked the pattern on the chart, and everyone found a place to wait out the wind.' },
  },
  bilmong: {
    accent: '#d99c66',
    ko: { name: '빌몽', motif: '블랙홀', role: '중력 관측',
      summary: '휘어지는 빛을 관찰해 안전하게 돌아갈 궤도를 찾아요.',
      story: '빌몽의 주변에서는 별빛이 평소와 다른 방향으로 휘어요. 처음에는 친구들과 너무 가까워질까 걱정했지만, 펄소리와 안전한 거리에서 신호를 주고받으며 관측하는 법을 익혔죠. 이제는 토링이 항로를 정할 때 궤도의 어느 지점을 넉넉히 돌아가야 하는지 알려 줘요.' },
    en: { name: 'Bilmong', motif: 'Black hole', role: 'Gravity observer',
      summary: 'Watches light bend to help the crew find safe orbits.',
      story: 'Starlight bends around Bilmong. Worried friends might come too close, Bilmong practiced exchanging signals with Pulsori from a safe distance. Now Bilmong helps Toring spot places where a route needs a wider turn.' },
  },
  talgak: {
    accent: '#e18973',
    ko: { name: '탈각이', motif: '소행성', role: '암석 조사',
      summary: '작은 집게로 암석을 살펴 각 표본의 특징을 찾아요.',
      story: '탈각이는 마음에 든 돌을 죄다 모으다가 짐이 무거워 한 발도 못 움직인 적이 있어요. 무루온과 함께 돌을 살펴보니 쉼터에는 듬직한 돌이, 노을비의 관찰에는 반짝이는 작은 조각이 필요했죠. 이제는 이유를 설명할 수 있는 돌만 가져와요.' },
    en: { name: 'Talgak', motif: 'Asteroid', role: 'Geologist',
      summary: 'Examines rocks with tiny claws to find what makes each sample special.',
      story: 'Talgak once collected so many rocks that the load would not budge. Sorting them with Muruon revealed sturdy stones for shelters and tiny sparkling chips for Noeulbi to study. Now Talgak can tell you why every stone in the bag is there.' },
  },
  jiena: {
    accent: '#aaa0ed',
    ko: { name: '지에나', motif: '까마귀자리와 백조자리의 날개별', role: '별빛 길잡이',
      summary: '두 날개에 닿는 별빛의 차이로 어두운 항로의 방향을 찾아요.',
      story: '지에나는 까마귀처럼 푸른 보라색 날개와 백조처럼 밝은 날개를 가진 별새예요. 두 별이 똑같이 빛나 토링이 어느 쪽으로 갈지 망설였던 밤, 지에나는 날개에 닿는 빛의 방향을 살펴 길을 찾아냈어요. 이제 토링과 함께 빛이 희미한 길에도 방향 표지를 남겨요.' },
    en: { name: 'Jiena', motif: 'Wing stars of Corvus and Cygnus', role: 'Starlight guide',
      summary: 'Reads the light on her two wings to find a bearing in the dark.',
      story: 'Jiena is a starbird with a blue-violet crow wing and a bright swan wing. One night two stars shone alike and Toring hesitated at a fork. Jiena found the way by watching where the light landed on each wing. Now she helps Toring leave bearings for explorers traveling through dim skies.' },
  },
} satisfies Record<ExplorerId, Explorer>;

export function explorerCopy(id: ExplorerId, language?: string) {
  return explorers[id][language?.startsWith('ko') ? 'ko' : 'en'];
}
