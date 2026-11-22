import { playRecordedEffect } from '../../platform/audio.ts';
import type { BurgerAction } from './rules.ts';

const clips = import.meta.glob<string>('../../assets/burger/sounds/*.wav', { eager: true, import: 'default', query: '?url' });
type Clip = 'paper' | 'wrap' | 'toss' | 'flip' | 'touch' | 'plate' | 'knob' | 'bell' | 'sizzle' | 'pour' | 'splash' | 'burn' | 'fever';

export function kitchenSound(clip: Clip, volume = .32, loop = false) {
  const url = clips['../../assets/burger/sounds/' + clip + '.wav'];
  return url ? playRecordedEffect(url, volume, loop) : undefined;
}

export function kitchenActionSound(action: BurgerAction) {
  const cue: Clip = (() => {
    switch (action.type) {
      case 'add': return action.item === 'paper' ? 'paper' : 'touch';
      case 'pop': return 'paper';
      case 'wrap': return 'wrap';
      case 'flip': return 'flip';
      case 'hold': return 'plate';
      case 'pour': return 'knob';
      case 'choose-card': return 'plate';
      case 'serve': return 'bell';
      case 'move': case 'return-burger': case 'return-drink': return action.to === 'trash' ? 'toss' : 'plate';
      case 'discard': case 'discard-stored': case 'discard-tray': case 'shoo': return 'toss';
      case 'spill': return 'splash';
      case 'grill': case 'stack': case 'stack-tray': return 'flip';
      case 'stage-burger': case 'stage-drink': case 'store-burger': case 'stage-stored': case 'shift-stored': return 'plate';
    }
  })();
  kitchenSound(cue);
}
