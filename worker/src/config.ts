/**
 * Worker configuration from vars and secrets (adapted from XLISTit website/lib/config.ts).
 * Unlike XLISTit, missing Lemon Squeezy IDs do not throw: the Worker still serves the site, and licence routes
 * fail closed (every sign-in refused, webhooks 503) until LS_STORE_ID and LS_PRODUCT_ID are set.
 */
import { z } from 'zod';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalId = z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional());
const int = (def: number, min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).default(def));
const secret = z.preprocess(blankToUndefined, z.string().min(1).optional());

const Env = z.object({
  /** xpost's Lemon Squeezy store (shared with XLISTit) and product (xpost only). Not secret. */
  LS_STORE_ID: optionalId,
  LS_PRODUCT_ID: optionalId,
  /** Optional comma-separated allowed variant IDs. Empty = any variant of LS_PRODUCT_ID. */
  LS_VARIANT_IDS: z.preprocess(blankToUndefined, z.string().optional()).transform((s, ctx) => {
    if (s === undefined) return [] as number[];
    const ids = s.split(',').map((x) => x.trim()).filter(Boolean);
    if (!ids.every((x) => /^\d+$/.test(x))) {
      ctx.addIssue({ code: 'custom', message: 'LS_VARIANT_IDS must be comma-separated numbers' });
      return z.NEVER;
    }
    return ids.map(Number);
  }),
  LS_API_BASE: z.preprocess(blankToUndefined, z.string().url().default('https://api.lemonsqueezy.com')),

  /** Secrets (Cloudflare dashboard, or .dev.vars locally). */
  LS_API_KEY: secret,
  LS_WEBHOOK_SECRET: secret,
  /** Keys the CSRF tokens and the hashes used for rate-limit keys and audit IPs. At least 32 characters. */
  SESSION_SECRET: z.preprocess(blankToUndefined, z.string().min(32).optional()),

  /** "true" to process Lemon Squeezy test-mode webhooks (staging only). Default: test-mode events are ignored. */
  ALLOW_TEST_WEBHOOKS: z.preprocess(blankToUndefined, z.enum(['true', 'false']).optional()).transform((v) => v === 'true'),
  MAX_WEB_SESSIONS: int(3, 1, 50),
  MAX_DESKTOP_DEVICES: int(2, 1, 50),
  SESSION_TTL_DAYS: int(30, 1, 365),
  REVALIDATE_HOURS: int(24, 1, 24 * 30),
  /** Licences re-validated per cron run. Each one is one Lemon Squeezy request (Free plan: 50 subrequests per run;
   *  max 35 leaves room for refund disable retries, which the cron also caps by counting requests). */
  REVALIDATE_BATCH: int(15, 1, 35),
  DESKTOP_OFFLINE_GRACE_DAYS: int(7, 0, 90),
});
export type Config = z.output<typeof Env>;

const cache = new WeakMap<object, Config>();

/** Throws a descriptive error naming bad vars (logged server-side, never sent to clients). */
export function getConfig(env: object): Config {
  let c = cache.get(env);
  if (!c) {
    const parsed = Env.safeParse(env);
    if (!parsed.success) throw new Error('xpost config is invalid: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    c = parsed.data;
    cache.set(env, c);
  }
  return c;
}

/** True when sign-in can work at all: product IDs and the session secret are set. Otherwise fail closed. */
export const licenceConfigured = (c: Config) => c.LS_STORE_ID !== undefined && c.LS_PRODUCT_ID !== undefined && c.SESSION_SECRET !== undefined;

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
