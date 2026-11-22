import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultAvatar } from '../../../../packages/protocol/profile.ts';
import type { AvatarLayers } from '../../../../packages/protocol/profile.ts';
import type { RoomLink } from '../../../../packages/protocol/rooms.ts';
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

export function RoomPlayerAvatar({ appearance, size, path }: { appearance?: AvatarLayers; size: number; path?: RoomLink }) {
  const { t } = useTranslation();
  const status = path ?? 'offline';
  const label = t(path === 'direct' ? 'roomPathDirect' : path === 'relay' ? 'roomPathRelay' : 'roomPathOffline');
  return <span className="room-player-avatar">
    <Avatar appearance={appearance ?? { avatar: defaultAvatar }} size={size} />
    <span className="room-player-path" data-path={status} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M2 5.7a9 9 0 0 1 12 0M4.2 8a5.7 5.7 0 0 1 7.6 0M6.3 10.3a2.6 2.6 0 0 1 3.4 0"
          fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
        <circle cx="8" cy="12.7" r="1" fill="currentColor" />
      </svg>
    </span>
  </span>;
}
