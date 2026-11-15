import type { Config } from './config';
import type { LemonSqueezy } from './lemonsqueezy';
import type { RateLimiter } from './rate-limit';

export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  DB: D1Database;
  APP_NAME?: string;
  LS_STORE_ID?: string;
  LS_PRODUCT_ID?: string;
  LS_VARIANT_IDS?: string;
  LS_API_BASE?: string;
  LS_API_KEY?: string;
  LS_WEBHOOK_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOW_TEST_WEBHOOKS?: string;
  MAX_WEB_SESSIONS?: string;
  MAX_DESKTOP_DEVICES?: string;
  SESSION_TTL_DAYS?: string;
  REVALIDATE_HOURS?: string;
  REVALIDATE_BATCH?: string;
  DESKTOP_OFFLINE_GRACE_DAYS?: string;
  RL_SIGNIN?: RateLimiter;
  RL_SIGNIN_EMAIL?: RateLimiter;
  RL_API?: RateLimiter;
  RL_UPSTREAM?: RateLimiter;
}

/** Everything a handler needs for one request or cron run. */
export interface Ctx {
  env: Env;
  cfg: Config;
  db: D1Database;
  ls: LemonSqueezy;
  now: number;
  ip: string;
}
