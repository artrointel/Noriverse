import { DurableObject } from 'cloudflare:workers';
import { matchXp, profileIdPattern, readName, readReport } from '../../packages/protocol/profile.ts';
import type { GameStats, MatchReport, PublicProfile } from '../../packages/protocol/profile.ts';

const cookieName = 'noriverse_profile';
type Identity = { id: string; secret: string; name: string };
interface Env { PROFILES: DurableObjectNamespace<ProfileStore> }

function json(data: unknown, status: number, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
}

async function readBody(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return undefined;
  const body = await request.text();
  if (body.length > 2048) return undefined;
  try { return JSON.parse(body) as unknown; } catch { return undefined; }
}

function session(request: Request) {
  const cookie = request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const [id, secret, extra] = cookie?.split('.') ?? [];
  return id && secret && !extra && profileIdPattern.test(id) && profileIdPattern.test(secret) ? { id, secret } : undefined;
}

export async function profileRequest(request: Request, env: Env, url: URL) {
  const path = url.pathname;
  const auth = session(request);
  const store = auth && env.PROFILES.getByName(auth.id);
  if (path === '/api/profiles/me' && request.method === 'GET') {
    const profile = store && await store.readOwn(auth.secret);
    return profile ? json(profile, 200) : json(null, 404);
  }
  if (path === '/api/profiles/me' && request.method === 'POST') {
    const input = await readBody(request) as { name?: unknown } | undefined;
    const name = readName(input?.name);
    if (!name) return json(null, 400);
    if (store) {
      const updated = await store.rename(auth.secret, name);
      if (updated) return json(updated, 200);
    }
    const id = crypto.randomUUID();
    const secret = crypto.randomUUID();
    const profile = await env.PROFILES.getByName(id).create({ id, secret, name });
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return json(profile, 201, {
      'Set-Cookie': cookieName + '=' + id + '.' + secret + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' + secure,
    });
  }
  if (path === '/api/profiles/me/matches' && request.method === 'POST') {
    if (!store) return json(null, 401);
    const report = readReport(await readBody(request));
    if (!report) return json(null, 400);
    const profile = await store.record(auth.secret, report);
    return profile ? json(profile, 200) : json(null, 401);
  }
  const id = path.match(/^\/api\/profiles\/([^/]+)$/)?.[1];
  if (request.method === 'GET' && id && profileIdPattern.test(id)) {
    const profile = await env.PROFILES.getByName(id).readPublic();
    return profile ? json(profile, 200) : json(null, 404);
  }
  return json(null, 404);
}

const emptyStats = (): GameStats => ({ seconds: 0, wins: 0, losses: 0, draws: 0, sessions: 0 });

export class ProfileStore extends DurableObject<Env> {
  constructor(context: DurableObjectState, env: Env) {
    super(context, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY, game TEXT NOT NULL, mode TEXT NOT NULL, outcome TEXT NOT NULL,
        seconds INTEGER NOT NULL, xp INTEGER NOT NULL, playedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS matches_recent ON matches(playedAt DESC);
    `);
  }

  async create(identity: Identity) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const existing = await this.ctx.storage.get<Identity>('identity');
      if (existing) return this.publicView(existing);
      await this.ctx.storage.put('identity', identity);
      return this.publicView(identity);
    });
  }

  async readOwn(secret: string) {
    const identity = await this.ctx.storage.get<Identity>('identity');
    return identity?.secret === secret ? this.publicView(identity) : null;
  }

  async readPublic() {
    const identity = await this.ctx.storage.get<Identity>('identity');
    return identity ? this.publicView(identity) : null;
  }

  async rename(secret: string, name: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const identity = await this.ctx.storage.get<Identity>('identity');
      if (identity?.secret !== secret) return null;
      const next = { ...identity, name };
      await this.ctx.storage.put('identity', next);
      return this.publicView(next);
    });
  }

  async record(secret: string, report: MatchReport) {
    const identity = await this.ctx.storage.get<Identity>('identity');
    if (identity?.secret !== secret) return null;
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO matches VALUES (?, ?, ?, ?, ?, ?, ?)',
      report.id, report.game, report.mode, report.outcome, report.seconds, matchXp[report.outcome], Date.now());
    return this.publicView(identity);
  }

  private publicView(identity: Identity): PublicProfile {
    const games = { omok: emptyStats(), physics: emptyStats() };
    let xp = 0;
    const totals = this.ctx.storage.sql.exec<{
      game: MatchReport['game']; seconds: number; wins: number; losses: number; draws: number; sessions: number; xp: number;
    }>(`SELECT game, sum(seconds) AS seconds, sum(outcome = 'win') AS wins,
      sum(outcome = 'loss') AS losses, sum(outcome = 'draw') AS draws, count(*) AS sessions, sum(xp) AS xp
      FROM matches GROUP BY game`);
    for (const { game, xp: gameXp, ...stats } of totals) {
      games[game] = stats;
      xp += gameXp;
    }
    const recent = this.ctx.storage.sql.exec<{
      id: string; game: MatchReport['game']; mode: MatchReport['mode']; outcome: MatchReport['outcome']; seconds: number; playedAt: number;
    }>(
      'SELECT id, game, mode, outcome, seconds, playedAt FROM matches ORDER BY playedAt DESC LIMIT 20').toArray();
    return { id: identity.id, name: identity.name, level: 1 + Math.floor(xp / 100), xp, games, recent };
  }
}
