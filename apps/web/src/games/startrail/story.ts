import { screen } from './outpost.ts';
import type { ExpeditionMap } from './expedition-maps.ts';

type Language = 'ko' | 'en';
const panels = {
  '1-1': [
    { ko: ['얼음 위성 궤도', '새까만 우주에서 얼음 위성 하나만이 깜빡이고 있었다. 별길 탐사대는 그 희미한 신호에 응답했다.'],
      en: ['Orbit of the frozen moon', 'One faint signal blinked in the dark. The Startrail Crew turned toward the frozen moon.'] },
    { ko: ['구조 요청', '잡음 사이로 작은 목소리가 들렸다. “관측소 대피실이에요. 전기가 끊겨서 나갈 수 없어요.”'],
      en: ['A call for help', 'A small voice broke through the static. “I’m in the observatory shelter. The power’s gone. I can’t get out.”'] },
    { ko: ['파루미의 교신', '“물소리 방향이 지하 관측소예요. 지표 발전기를 살려야 그곳으로 내려가는 승강기가 움직여요.”'],
      en: ['Parumi on the radio', '“The water runs toward the observatory. Restore the surface generator to bring the lift back online.”'] },
    { ko: ['지표 중계소', '착륙대에서 전력선을 따라 중앙 발전기를 찾자. 회로를 맞추고 전력이 돌아올 때까지 지켜야 한다.'],
      en: ['Surface relay', 'Follow the cables to the central generator. Repair its circuit and defend it until power returns.'] },
  ],
  '1-2': [
    { ko: ['승강기의 끝', '중계소의 불빛이 머리 위로 사라졌다. 승강기가 얼음 아래 정류장에 닿자 파루미의 목소리가 다시 들렸다.'],
      en: ['Below the ice', 'The relay lights vanished above. The lift reached the underground station, and Parumi came back on the radio.'] },
    { ko: ['얼음 아래 두 갈래', '“위쪽은 관측 복도, 아래쪽은 얼음 물길이에요. 어느 쪽이든 대피실의 따뜻한 불빛을 찾으세요.”'],
      en: ['Two paths underground', '“The catwalk is above. The meltwater channel is below. Either way, look for the warm light of the shelter.”'] },
    { ko: ['대피실의 불빛', '구조 신호를 보낸 주민은 대피실에 있다. 먼저 그를 찾고, 지표행 비상 승강기를 움직일 방법을 알아내자.'],
      en: ['A light in the shelter', 'The caller is waiting in the shelter. Find them, then get the emergency lift to the surface working.'] },
    { ko: ['돌아갈 길', '“관측 장비 전력을 비상 승강기로 돌리세요. 불이 바뀌면 주황색 비상등을 따라 함께 나오면 돼요.”'],
      en: ['The way home', '“Reroute power from the instruments to the emergency lift. When the lights change, follow the orange lamps together.”'] },
  ],
  '1-3': [
    { ko: ['다시 지표로', '비상 승강기가 설원에 닿았다. 구조한 주민은 옆 대피소로 옮겼지만, 셔틀은 아직 뜰 수 없었다.'],
      en: ['Back on the surface', 'The lift reached the snowfield. The resident took shelter nearby, but the shuttle was still grounded.'] },
    { ko: ['오로라 관제소', '오로라 아래 북쪽과 남쪽에 안테나가 있다. 갈라진 얼음 능선을 탐색해 두 기를 모두 연결하자.'],
      en: ['The aurora station', 'Two antennas stand on opposite ridges. Explore the northern and southern paths and bring them both online.'] },
    { ko: ['끊어진 항로', '“안테나를 켜면 관제탑에서 신호를 받을 수 있어요. 불빛 순서를 기억해 항로 주파수를 맞추세요.”'],
      en: ['A broken flight path', '“Once the antennas are online, look for a signal at the tower. Repeat the pattern to calibrate the flight path.”'] },
    { ko: ['마지막 교신', '항로 좌표가 전송되는 동안 관제탑을 지키자. 전송이 끝나면 문이 열리고 구조 셔틀에 탈 수 있다.'],
      en: ['The final transmission', 'Defend the tower while it sends the coordinates. When the gate opens, make for the rescue shuttle.'] },
  ],
  '1-4': [
    { ko: ['잔해 고리의 신호', '오로라 관제소에서 떠난 셔틀에 조난 신호가 잡혔다. 신호는 오래된 구조항에서 오고 있었다.'],
      en: ['A signal in the wreck ring', 'The shuttle picked up a distress call after leaving Aurora Control. It came from an old rescue station.'] },
    { ko: ['북쪽 온실', '“북쪽 온실의 순환기를 복구하면 예비 전력 셀을 쓸 수 있어요.” 파루미가 초록빛 통로를 가리켰다.'],
      en: ['The north greenhouse', 'Parumi pointed toward the green passage. “Restart the circulation system to recover a reserve power cell.”'] },
    { ko: ['남쪽 하역장', '남쪽 집게의 잠금을 풀면 중계기에 필요한 장비를 꺼낼 수 있다. 두 설비를 복구한 뒤 동쪽으로 가자.'],
      en: ['The south salvage bay', 'Unlock the salvage clamp to free the relay equipment. Restore both systems before heading east.'] },
    { ko: ['외곽 관측실', '관측실에서 잔해가 이동하는 경로를 미리 읽으면 전송 시간이 줄어든다. 신호를 보낸 뒤 동쪽 셔틀로 돌아가자.'],
      en: ['The outer observatory', 'Survey the drifting wreckage to shorten the transmission. Send the coordinates, then board the shuttle to the east.'] },
  ],
} satisfies Record<ExpeditionMap['id'], { ko: [string, string]; en: [string, string] }[]>;

const font = (size: number) => `${size}px 'Sketch Jua', 'Malgun Gothic', sans-serif`;

export class StoryIntro {
  private page = 0;
  private lastStill = '';

  constructor(private readonly stage: ExpeditionMap, private readonly art: HTMLImageElement, private readonly language: Language) {}

  advance() {
    if (this.page + 1 === panels[this.stage.id].length) return true;
    this.page++;
    return false;
  }

  draw(output: CanvasRenderingContext2D, hud: CanvasRenderingContext2D, repaint: boolean) {
    const { width, height } = screen;
    const count = panels[this.stage.id].length;
    const still = `${this.page}:${output.canvas.width}:${output.canvas.height}:${hud.canvas.width}:${hud.canvas.height}`;
    if (!repaint && this.lastStill === still) return;
    this.lastStill = still;
    const artWidth = this.art.naturalWidth / 2, artHeight = this.art.naturalHeight / 2;
    output.resetTransform();
    output.setTransform(output.canvas.width / width, 0, 0, output.canvas.height / height, 0, 0);
    output.imageSmoothingEnabled = true;
    output.drawImage(this.art, this.page % 2 * artWidth + 1, Math.floor(this.page / 2) * artHeight + 1,
      artWidth - 2, artHeight - 2, 0, 0, width, height);

    hud.resetTransform(); hud.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
    hud.setTransform(hud.canvas.width / width, 0, 0, hud.canvas.height / height, 0, 0);
    const shade = hud.createLinearGradient(0, 157, 0, height);
    shade.addColorStop(0, '#030a1600'); shade.addColorStop(.46, '#030a16c9'); shade.addColorStop(1, '#030a16');
    hud.fillStyle = shade; hud.fillRect(0, 157, width, height - 157);
    const stage = this.language === 'ko' ? this.stage.title : this.stage.titleEn;
    hud.save(); hud.textBaseline = 'middle'; hud.textAlign = 'left';
    hud.font = font(9); hud.fillStyle = '#9af1e3'; hud.fillText(`${this.stage.id}  /  ${stage}`, 20, 187);
    const [title, caption] = panels[this.stage.id][this.page][this.language];
    hud.font = font(19); hud.fillStyle = '#f2fcff'; hud.fillText(title, 20, 205);
    hud.font = font(12); hud.fillStyle = '#deedf4';
    let line = '', y = 224;
    for (const word of caption.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (hud.measureText(next).width <= width - 40) { line = next; continue; }
      hud.fillText(line, 20, y); line = word; y += 13;
    }
    if (line) hud.fillText(line, 20, y);
    for (let i = 0; i < count; i++) {
      hud.fillStyle = i === this.page ? '#9af1e3' : '#426075'; hud.fillRect(20 + i * 15, 253, 10, 2);
    }
    const lastPage = this.page + 1 === count;
    const action = this.language === 'ko' ? lastPage ? '탐사 시작' : '다음 컷' : lastPage ? 'Begin expedition' : 'Next panel';
    hud.fillStyle = '#e5fcf9'; hud.font = font(10); hud.textAlign = 'right';
    hud.fillText(`${action}   ›`, width - 20, 253);
    hud.restore();
  }
}
