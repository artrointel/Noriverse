import { playRecordedEffect } from '../../platform/audio.ts';
import type { BurgerAction } from './rules.ts';

const clips = import.meta.glob<string>('../../assets/burger/sounds/*.wav', { eager: true, import: 'default', query: '?url' });
type Clip = 'paper' | 'wrap' | 'toss' | 'flip' | 'touch' | 'plate' | 'knob' | 'bell' | 'call-bell' | 'sizzle' | 'pour' | 'splash' | 'burn' | 'fever';

export function kitchenSound(clip: Clip, volume = .32, loop = false) {
  const url = clips['../../assets/burger/sounds/' + clip + '.wav'];
  return url ? playRecordedEffect(url, volume, loop) : undefined;
}

export function kitchenActionSound(action: BurgerAction) {
  const cue: Clip | undefined = (() => {
    switch (action.type) {
      case 'add': return action.item === 'paper' ? 'paper' : 'touch';
      case 'pop': return 'paper';
      case 'wrap': return 'wrap';
      case 'flip': return 'flip';
      case 'hold': return 'plate';
      case 'pour': return 'knob';
      case 'start-assembly': return 'knob';
      case 'choose-card': return 'plate';
      case 'reroll-cards': return 'paper';
      case 'ring-bell': return 'call-bell';
      case 'serve': return undefined;
      case 'move': case 'return-burger': case 'return-drink': return action.to === 'trash' ? 'toss' : 'plate';
      case 'discard': case 'discard-stored': case 'discard-tray': case 'shoo': return 'toss';
      case 'spill': return 'splash';
      case 'grill': case 'stack': case 'stack-tray': return 'flip';
      case 'stage-burger': case 'stage-drink': case 'store-burger': case 'store-drink': case 'stage-stored': case 'shift-stored': return 'plate';
    }
  })();
  if (cue) kitchenSound(cue, cue === 'call-bell' ? .24 : undefined);
}
