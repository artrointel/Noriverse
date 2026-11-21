import type { AlkkagiStatus, Flick, FlickRound, StonePosition } from './alkkagi/rules.ts';
import type { TargetMark } from './board-marks.ts';
import type { Tile, TilePoint } from './sichuan/rules.ts';
import type { SichuanSize, SichuanTheme } from './sichuan/options.ts';
import type { SichuanHudView } from './sichuan/hud.ts';

export interface GameView {
  history: number[];
  cursor: number | null;
  movePreview?: number;
  chessSelected?: number;
  chessTargets: ReadonlyMap<number, TargetMark>;
  canInspect?: boolean;
  dark: boolean;
  force: number;
  allowDoubleThree: boolean;
  canMove: boolean;
  deadline: number;
  finished: boolean;
  move: (index: number, touch?: boolean) => void;
  onAlkkagi: (status: AlkkagiStatus) => void;
  localFlick?: FlickRound;
  onlineFlick?: FlickRound & { host: boolean; send: (shot: Flick) => void; settle: (layout: StonePosition[], revision: number) => void };
  sichuan?: { board: readonly Tile[]; size: SichuanSize; theme: SichuanTheme; selected?: number;
    hint?: readonly [number, number]; match?: { path: readonly TilePoint[]; combo: number }; rejected?: { index: number };
    flip?: 'backs' | 'faces'; hud: SichuanHudView };
}
