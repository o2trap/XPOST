import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDb } from './harness';

let db: D1Database, dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await startDb()));
afterAll(() => dispose());

const tables = async () => (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'").all<{ name: string }>()).results.map((r) => r.name);
const columns = async (t: string) => (await db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((r) => r.name);

describe('schema v1', () => {
  it('has the planned tables and no platform-account/token tables', async () => {
    const t = await tables();
    for (const name of ['users', 'licences', 'sessions', 'devices', 'posts', 'post_media', 'post_targets', 'target_events', 'media', 'reminders',
      'push_subscriptions', 'remote_config', 'webhook_events', 'auth_attempts', 'audit_log']) expect(t).toContain(name);
    expect(t.join(' ')).not.toMatch(/social|oauth|token/);
  });

  it('every user-owned table has user_id', async () => {
    for (const t of ['licences', 'sessions', 'devices', 'posts', 'post_media', 'post_targets', 'target_events', 'media', 'reminders', 'push_subscriptions', 'audit_log']) {
      expect(await columns(t), t).toContain('user_id');
    }
  });

  it('stores key and token hashes, never raw values', async () => {
    expect(await columns('licences')).toEqual(expect.arrayContaining(['ls_license_key_hash', 'key_last4']));
    expect((await columns('licences')).join(' ')).not.toMatch(/\bls_license_key\b|\bkey\b/);
    expect(await columns('sessions')).toContain('token_hash');
  });

  it('enforces CHECK constraints (statuses, lower-case email)', async () => {
    await expect(db.prepare("INSERT INTO users (id, email, created_at, updated_at) VALUES ('u', 'Mixed@Case.com', 0, 0)").run()).rejects.toThrow(/CHECK/);
    await db.prepare("INSERT INTO users (id, email, created_at, updated_at) VALUES ('u', 'a@b.co', 0, 0)").run();
    await db.prepare("INSERT INTO posts (id, user_id, created_at, updated_at) VALUES ('p', 'u', 0, 0)").run();
    await expect(db.prepare("INSERT INTO post_targets (id, post_id, user_id, platform, mode, status, created_at, updated_at) VALUES ('t', 'p', 'u', 'x', 'api', 'draft', 0, 0)").run()).rejects.toThrow(/CHECK/);
    await expect(db.prepare("INSERT INTO post_targets (id, post_id, user_id, platform, mode, status, created_at, updated_at) VALUES ('t', 'p', 'u', 'myspace', 'intent', 'draft', 0, 0)").run()).rejects.toThrow(/CHECK/);
    await expect(db.prepare("INSERT INTO post_targets (id, post_id, user_id, platform, mode, status, created_at, updated_at) VALUES ('t', 'p', 'nobody', 'x', 'intent', 'draft', 0, 0)").run()).rejects.toThrow(/FOREIGN KEY/);
  });

  it('seeds remote_config for all six platforms with valid JSON', async () => {
    const rows = (await db.prepare('SELECT key, value FROM remote_config ORDER BY key').all<{ key: string; value: string }>()).results;
    expect(rows.map((r) => r.key)).toEqual(['global', 'platform:facebook', 'platform:instagram', 'platform:snapchat', 'platform:tiktok', 'platform:x', 'platform:youtube']);
    for (const r of rows) expect(() => JSON.parse(r.value)).not.toThrow();
    expect(JSON.parse(rows.find((r) => r.key === 'platform:x')!.value)).toMatchObject({ default_mode_web: 'intent', assisted_enabled: true, selector_config_version: 0 });
  });
});
