import { defaultFlickSettings } from './alkkagi/rules.ts';
import type { FlickPower, FlickSettings } from './alkkagi/rules.ts';
import { defaultOmokOverline } from './omok/rules.ts';
import type { OmokOverline } from './omok/rules.ts';
import { defaultSichuanRoomSettings } from './sichuan/options.ts';
import type { SichuanRoomSettings } from './sichuan/options.ts';
import type { TurnLimit } from './turn-clock.ts';
import { defaultSketchSettings } from './sketch/rules.ts';
import type { SketchSettings } from './sketch/rules.ts';

export type MatchSettings = {
  turnLimit: TurnLimit;
  allowDoubleThree: boolean;
  overline: OmokOverline;
  power: FlickPower;
  flick: FlickSettings;
  puzzle: SichuanRoomSettings;
  sketch: SketchSettings;
};

export const defaultMatchSettings: MatchSettings = {
  turnLimit: 0, allowDoubleThree: true, overline: defaultOmokOverline,
  power: 1, flick: defaultFlickSettings, puzzle: defaultSichuanRoomSettings, sketch: defaultSketchSettings,
};
