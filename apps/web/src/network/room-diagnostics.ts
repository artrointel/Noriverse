import type { Role } from '../../../../packages/protocol/rooms.ts';

const maxEntriesPerPeer = 36;

export function candidateKind(candidate: string) {
  const kind = /\btyp (host|srflx|prflx|relay)(?: |$)/.exec(candidate)?.[1] ?? 'unknown';
  return kind === 'host' && /\.local\s/i.test(candidate) ? 'host/mDNS' : kind;
}

type IceStat = {
  type: string;
  selectedCandidatePairId?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  protocol?: string;
  requestsSent?: number;
  responsesReceived?: number;
};

const safeKind = (kind?: string) => kind && ['host', 'srflx', 'prflx', 'relay'].includes(kind) ? kind : 'unknown';

export function summarizeIcePath(stats: Iterable<IceStat>, lookup: (id: string) => IceStat | undefined) {
  const entries = [...stats];
  const id = entries.find(entry => entry.type === 'transport' && entry.selectedCandidatePairId)?.selectedCandidatePairId;
  const pair = id && lookup(id);
  if (pair) {
    const local = pair.localCandidateId ? lookup(pair.localCandidateId) : undefined;
    const remote = pair.remoteCandidateId ? lookup(pair.remoteCandidateId) : undefined;
    const protocol = local?.protocol === 'udp' || local?.protocol === 'tcp' ? local.protocol : 'unknown';
    return `selected ICE path ${safeKind(local?.candidateType)} / ${safeKind(remote?.candidateType)} via ${protocol}`;
  }
  const pairs = entries.filter(entry => entry.type === 'candidate-pair');
  const total = (key: 'requestsSent' | 'responsesReceived') => pairs.reduce((sum, entry) => {
    const value = entry[key] ?? 0;
    return sum + (Number.isSafeInteger(value) && value >= 0 ? value : 0);
  }, 0);
  return `no selected ICE path, ${pairs.length} candidate pairs, requests ${total('requestsSent')} / responses ${total('responsesReceived')}`;
}

export function createRoomDiagnostics() {
  const started = Date.now();
  const entries = new Map<Role, string[]>();
  return {
    note(peer: Role, event: string) {
      const previous = entries.get(peer) ?? [];
      if (previous.length >= maxEntriesPerPeer) previous.shift();
      previous.push(`${((Date.now() - started) / 1000).toFixed(1)}s ${event}`);
      entries.set(peer, previous);
    },
    report(role: Role | undefined, path: (peer: Role) => string) {
      return ['Noriverse WebRTC diagnostic', `seat: ${role ?? 'unassigned'}`,
        ...[...entries].flatMap(([peer, events]) => [`[${peer}] path: ${path(peer)}`, ...events])].join('\n');
    },
  };
}
