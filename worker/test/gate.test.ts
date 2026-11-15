import { describe, expect, it } from 'vitest';
import { licenceBlock, licenceInfo, requireActiveLicence } from '../src/gate';
import { deriveStatus } from '../src/licence';

const row = (o: object) => ({ status: 'active' as const, status_reason: null, expires_at: null, key_last4: 'AB12', last_validated_at: 0, ...o });

describe('licence gate', () => {
  it('allows active licences, blocks everything else with a plain-English reason', async () => {
    expect(licenceBlock(row({}), 1000)).toBeNull();
    expect(licenceBlock(row({ status_reason: 'payment_failed' }), 1000)).toBeNull();
    expect(licenceBlock(row({ expires_at: 999 }), 1000)!.code).toBe('expired'); // expiry checked live, not only by cron
    for (const [status, reason, code] of [['refunded', 'refunded', 'refunded'], ['expired', 'expired', 'expired'], ['disabled', 'disabled', 'disabled'], ['inactive', 'subscription_paused', 'subscription_paused']] as const) {
      const b = licenceBlock(row({ status, status_reason: reason }), 1000)!;
      expect(b.code).toBe(code);
      expect(b.message.length).toBeGreaterThan(20);
    }
    const res = requireActiveLicence(row({ status: 'refunded', status_reason: 'refunded' }), 1000)!;
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, code: 'licence_blocked', reason: 'refunded' });
    expect(requireActiveLicence(row({}), 1000)).toBeNull();
  });

  it('licenceInfo shows warnings without blocking', () => {
    expect(licenceInfo(row({ status_reason: 'payment_failed' }), 0)).toMatchObject({ canPost: true, message: expect.stringMatching(/payment failed/) });
    expect(licenceInfo(row({ expires_at: 5 }), 10)).toMatchObject({ status: 'expired', canPost: false });
  });

  it('deriveStatus keeps refunds and pauses sticky', () => {
    expect(deriveStatus({ status: 'refunded', status_reason: 'refunded' }, { status: 'active', expiresAt: null }, 0).status).toBe('refunded');
    expect(deriveStatus({ status: 'inactive', status_reason: 'subscription_paused' }, { status: 'active', expiresAt: null }, 0).status).toBe('inactive');
    for (const reason of ['unpaid', 'payment_refunded']) {
      expect(deriveStatus({ status: 'inactive', status_reason: reason }, { status: 'active', expiresAt: null }, 0)).toEqual({ status: 'inactive', reason });
      expect(licenceBlock(row({ status: 'inactive', status_reason: reason }), 0)!.message).toMatch(/paused/);
    }
    expect(deriveStatus({ status: 'expired', status_reason: 'expired' }, { status: 'active', expiresAt: null }, 0)).toEqual({ status: 'active', reason: null });
    expect(deriveStatus(null, { status: 'inactive', expiresAt: null }, 0).status).toBe('active'); // LS "inactive" = valid, never activated
    expect(deriveStatus(null, { status: 'active', disabled: true, expiresAt: null }, 0).status).toBe('disabled');
    expect(deriveStatus(null, { status: 'active', expiresAt: 5 }, 10).status).toBe('expired');
  });
});
