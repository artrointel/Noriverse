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
} satisfies Record<ExpeditionMap['id'], { ko: [string, string]; en: [string, string] }[]>;

const duration = 240;
const font = (size: number) => `${size}px 'Sketch Jua', 'Malgun Gothic', sans-serif`;

export class StoryIntro {
  private page = 0;
  private turnedAt = -Infinity;
  private lastStill = '';

  constructor(private readonly stage: ExpeditionMap, private readonly art: HTMLImageElement,
    private readonly language: Language, private readonly reduceMotion: boolean) {}

  advance(time: number) {
    if (time - this.turnedAt < (this.reduceMotion ? 100 : duration)) return false;
    if (this.page + 1 === panels[this.stage.id].length) return true;
    this.page++;
    this.turnedAt = time;
    return false;
  }

  draw(output: CanvasRenderingContext2D, hud: CanvasRenderingContext2D, time: number) {
    const { width, height } = screen;
    const count = panels[this.stage.id].length;
    const phase = this.reduceMotion ? 1 : Math.max(0, Math.min(1, (time - this.turnedAt) / duration));
    const still = phase === 1 ? `${this.page}:${output.canvas.width}:${output.canvas.height}:${hud.canvas.width}:${hud.canvas.height}` : '';
    if (still && this.lastStill === still) return;
    this.lastStill = still;
    const progress = 1 - (1 - phase) ** 3;
    const offset = (1 - progress) * width;
    const artWidth = this.art.naturalWidth / 2, artHeight = this.art.naturalHeight / 2;
    const drawCell = (page: number, x: number) => output.drawImage(this.art,
      page % 2 * artWidth + 1, Math.floor(page / 2) * artHeight + 1, artWidth - 2, artHeight - 2, x, 0, width, height);
    output.resetTransform();
    output.setTransform(output.canvas.width / width, 0, 0, output.canvas.height / height, 0, 0);
    output.imageSmoothingEnabled = true;
    if (this.page && phase < 1) drawCell(this.page - 1, offset - width);
    drawCell(this.page, offset);
    if (phase < 1) {
      output.fillStyle = '#070f20'; output.fillRect(offset - 2, 0, 4, height);
    }

    hud.resetTransform(); hud.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
    hud.setTransform(hud.canvas.width / width, 0, 0, hud.canvas.height / height, 0, 0);
    const shade = hud.createLinearGradient(0, 157, 0, height);
    shade.addColorStop(0, '#030a1600'); shade.addColorStop(.46, '#030a16c9'); shade.addColorStop(1, '#030a16');
    hud.fillStyle = shade; hud.fillRect(0, 157, width, height - 157);
    const stage = this.language === 'ko' ? this.stage.title : this.stage.id === '1-1' ? 'Surface relay' : 'Observatory beneath the ice';
    hud.save(); hud.textBaseline = 'middle'; hud.textAlign = 'left';
    hud.font = font(9); hud.fillStyle = '#9af1e3'; hud.fillText(`${this.stage.id}  /  ${stage}`, 20, 187);
    const drawCopy = (page: number, opacity: number) => {
      const [title, caption] = panels[this.stage.id][page][this.language];
      hud.globalAlpha = opacity;
      hud.font = font(19); hud.fillStyle = '#f2fcff'; hud.fillText(title, 20, 205);
      hud.font = font(12); hud.fillStyle = '#deedf4';
      let line = '', y = 224;
      for (const word of caption.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (hud.measureText(next).width <= width - 40) { line = next; continue; }
        hud.fillText(line, 20, y); line = word; y += 13;
      }
      if (line) hud.fillText(line, 20, y);
    };
    if (phase < .5 && this.page) drawCopy(this.page - 1, 1 - phase * 2);
    else {
      drawCopy(this.page, Math.max(0, phase * 2 - 1));
    }
    hud.globalAlpha = 1;
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
