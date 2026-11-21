import type { FriendGraph } from './friend-graph.ts';
import type { ProfileStore } from './profiles.ts';
import type { Room } from './room.ts';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  PROFILES: DurableObjectNamespace<ProfileStore>;
  FRIENDS: DurableObjectNamespace<FriendGraph>;
  APP_ORIGIN?: string;
}
