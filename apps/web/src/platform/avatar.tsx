import type { CSSProperties } from 'react';
import { defaultAvatar } from '../../../../packages/protocol/profile.ts';
import type { AvatarLayers } from '../../../../packages/protocol/profile.ts';
import { avatars } from './avatars.ts';

export function Avatar({ appearance, size, className, characterOnly = false }: {
  appearance: AvatarLayers; size: number; className?: string; characterOnly?: boolean;
}) {
  const avatar = Object.hasOwn(avatars, appearance.avatar) ? appearance.avatar : defaultAvatar;
  const style = { '--avatar-size': size + 'px',
    backgroundColor: characterOnly ? undefined : appearance.avatarBackground ?? undefined } as CSSProperties;
  return <span className={className ? 'avatar ' + className : 'avatar'} style={style} data-character-only={characterOnly}>
    <img src={avatars[avatar]} width={size} height={size} alt="" data-pixel={avatar.startsWith('pixel')} />
  </span>;
}
