import { DurableObject } from 'cloudflare:workers';
import type { FriendAction } from '../../packages/protocol/profile.ts';

type Edge = { first: string; second: string; sender: string; status: 'pending' | 'accepted' | 'removed' };

export class FriendGraph extends DurableObject<object> {
  constructor(context: DurableObjectState, env: object) {
    super(context, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS friendships (first TEXT NOT NULL, second TEXT NOT NULL, sender TEXT NOT NULL,
        status TEXT NOT NULL, PRIMARY KEY (first, second));
      CREATE INDEX IF NOT EXISTS friendships_by_second ON friendships(second);
      CREATE TABLE IF NOT EXISTS imported_friends (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS deleted_profiles (id TEXT PRIMARY KEY);
    `);
  }

  list(id: string) {
    const edges = this.ctx.storage.sql.exec<Edge>(
      'SELECT * FROM friendships WHERE (first = ? OR second = ?) AND status != ?', id, id, 'removed').toArray();
    const list = { friends: [] as string[], incoming: [] as string[], outgoing: [] as string[] };
    for (const edge of edges) {
      const group = edge.status === 'accepted' ? 'friends' : edge.sender === id ? 'outgoing' : 'incoming';
      list[group].push(edge.first === id ? edge.second : edge.first);
    }
    return list;
  }

  needsImport(id: string) {
    return this.ctx.storage.sql.exec('SELECT id FROM imported_friends WHERE id = ?', id).toArray().length === 0;
  }

  importMutual(id: string, mutual: string[]) {
    this.ctx.storage.transactionSync(() => {
      if (this.isDeleted(id) || !this.needsImport(id)) return;
      for (const other of mutual) {
        if (this.isDeleted(other)) continue;
        const [first, second] = [id, other].sort();
        this.ctx.storage.sql.exec('INSERT OR IGNORE INTO friendships VALUES (?, ?, ?, ?)', first, second, id, 'accepted');
      }
      this.ctx.storage.sql.exec('INSERT INTO imported_friends VALUES (?)', id);
    });
  }

  private isDeleted(id: string) {
    return this.ctx.storage.sql.exec('SELECT 1 FROM deleted_profiles WHERE id = ?', id).toArray().length > 0;
  }

  removeProfile(id: string) {
    return this.ctx.storage.transactionSync(() => {
      const { friends, incoming, outgoing } = this.list(id);
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO deleted_profiles VALUES (?)', id);
      this.ctx.storage.sql.exec('DELETE FROM imported_friends WHERE id = ?', id);
      this.ctx.storage.sql.exec('DELETE FROM friendships WHERE first = ? OR second = ?', id, id);
      return [...friends, ...incoming, ...outgoing];
    });
  }

  change(actor: string, other: string, action: FriendAction) {
    return this.ctx.storage.transactionSync(() => {
      if (this.isDeleted(actor) || this.isDeleted(other)) return false;
      const [first, second] = [actor, other].sort();
      const edge = this.ctx.storage.sql.exec<Edge>('SELECT * FROM friendships WHERE first = ? AND second = ?', first, second).toArray()[0];
      if (action === 'request') {
        if (edge && edge.status !== 'removed') return true;
        for (const id of [actor, other]) {
          const { count } = this.ctx.storage.sql.exec<{ count: number }>(
            'SELECT count(*) AS count FROM friendships WHERE (first = ? OR second = ?) AND status != ?', id, id, 'removed').one();
          if (count >= 64) return false;
        }
        this.ctx.storage.sql.exec('INSERT OR REPLACE INTO friendships VALUES (?, ?, ?, ?)', first, second, actor, 'pending');
        return true;
      }
      if (!edge) return false;
      const received = edge.status === 'pending' && edge.sender === other;
      const valid = action === 'remove' ? edge.status === 'accepted' : action === 'cancel' ? edge.status === 'pending' && !received : received;
      if (!valid) return false;
      this.ctx.storage.sql.exec('UPDATE friendships SET status = ? WHERE first = ? AND second = ?',
        action === 'accept' ? 'accepted' : 'removed', first, second);
      return true;
    });
  }
}
