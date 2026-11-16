import { describe, expect, it } from 'vitest';
import toml from '../../wrangler.toml?raw';
import { getConfig, licenceConfigured } from '../src/config';
import { isScatteritProduct } from '../src/licence';

describe('config', () => {
  it('has sane defaults and fails closed with no LS IDs', () => {
    const c = getConfig({});
    expect(c).toMatchObject({ MAX_WEB_SESSIONS: 3, MAX_DESKTOP_DEVICES: 2, SESSION_TTL_DAYS: 30, REVALIDATE_HOURS: 24, DESKTOP_OFFLINE_GRACE_DAYS: 7, REVALIDATE_BATCH: 15, LS_VARIANT_IDS: [] });
    expect(licenceConfigured(c)).toBe(false);
    expect(isScatteritProduct(c, 1, 10)).toBe(false);
    expect(licenceConfigured(getConfig({ LS_STORE_ID: '', LS_PRODUCT_ID: '', SESSION_SECRET: '' }))).toBe(false);
  });

  it('parses vars', () => {
    const c = getConfig({ LS_STORE_ID: '1', LS_PRODUCT_ID: '10', LS_VARIANT_IDS: '5, 6', SESSION_SECRET: 'x'.repeat(32), MAX_WEB_SESSIONS: '5' });
    expect(licenceConfigured(c)).toBe(true);
    expect(c.MAX_WEB_SESSIONS).toBe(5);
    expect(isScatteritProduct(c, 1, 10, 5)).toBe(true);
    expect(isScatteritProduct(c, 1, 10, 7)).toBe(false);
    expect(isScatteritProduct(c, 1, 20, 5)).toBe(false);
    expect(isScatteritProduct(c, 2, 10, 5)).toBe(false);
  });

  it('rejects bad values and short session secrets', () => {
    expect(() => getConfig({ LS_VARIANT_IDS: 'abc' })).toThrow(/LS_VARIANT_IDS/);
    expect(() => getConfig({ SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    expect(() => getConfig({ MAX_WEB_SESSIONS: '0' })).toThrow(/MAX_WEB_SESSIONS/);
    expect(() => getConfig({ REVALIDATE_BATCH: '36' })).toThrow(/REVALIDATE_BATCH/); // Free plan: 50 subrequests
    expect(getConfig({ REVALIDATE_BATCH: '35' }).REVALIDATE_BATCH).toBe(35);
    expect(() => getConfig({ ALLOW_TEST_WEBHOOKS: 'yes' })).toThrow(/ALLOW_TEST_WEBHOOKS/);
    expect(getConfig({}).ALLOW_TEST_WEBHOOKS).toBe(false);
    expect(getConfig({ ALLOW_TEST_WEBHOOKS: 'true' }).ALLOW_TEST_WEBHOOKS).toBe(true);
  });

  it('wrangler.toml keeps secrets out and ships placeholder LS IDs', () => {
    expect(toml).toMatch(/^LS_STORE_ID = ""$/m);
    expect(toml).toMatch(/^LS_PRODUCT_ID = ""$/m);
    expect(toml).not.toMatch(/^\s*(LS_API_KEY|LS_WEBHOOK_SECRET|SESSION_SECRET)\s*=/m);
    expect(toml).toMatch(/binding = "DB"\ndatabase_name = "xpost"\nmigrations_dir = "worker\/migrations"/);
    expect(toml).not.toMatch(/^database_id\s*=/m); // automatic provisioning
  });
});
