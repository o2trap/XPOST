# SCATTERit

Write once, post everywhere. SCATTERit is a crossposter for TikTok, Instagram, YouTube, X, Facebook and Snapchat. It uses no social media APIs: manual intent links, handoff, and desktop assisted fill only. Plan: [docs/step0/PLAN.md](docs/step0/PLAN.md).

## Layout

- `web/` React 19 + Vite + Tailwind 4 app
- `worker/` Cloudflare Worker: `/api/*` and security headers; serves `web/dist` via the ASSETS binding
- `shared/` types and constants shared by web and worker
- `desktop/` placeholder (milestone M7)
- `wrangler.toml` at the repo root

## Commands

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run build` builds the web app, then typechecks the Worker
- `npm run dev` builds the web app and runs `wrangler dev` (http://localhost:8787); for hot reload run `npm run dev -w web` alongside it

## Deploy

Cloudflare Git integration (Workers Builds) on the Worker named `xpost`. Production branch `claude/great-lamport-krx9rg`; every push deploys. Dashboard build settings (Workers & Pages > xpost > Settings > Build):

- Root directory: `/` (blank)
- Build command: `npm run build`
- Deploy command: `npm run deploy`

`npm run deploy` runs `scripts/deploy.mjs`: it creates the D1 database `xpost` if it does not exist yet (first deploy only, location hint `weur`), applies the D1 migrations in `worker/migrations`, and only then runs `wrangler deploy`. If a migration fails, nothing is deployed; remote D1 does not promise to undo the statements of a migration that failed part-way, so recover with D1 Time Travel (`npx wrangler d1 time-travel restore xpost --timestamp=...`, 7 days back on the Free plan) and write migrations to be safe to re-run (`CREATE ... IF NOT EXISTS`). Migrations must stay backwards compatible (add columns and tables; don't rename or drop in the same release), because they go live a few seconds before the new code.

**One-time owner steps in the Cloudflare dashboard**

1. **Give the build token D1 access.** The token Workers Builds creates by default has Workers Scripts, KV and R2 permissions but not D1. Workers & Pages > xpost > Settings > Build > API token shows which token it uses; edit that token in My Profile > API Tokens and add **Account > D1 > Edit**. (Or create a token with that permission plus the defaults and select it there.) Without it the deploy stops with a message saying so.
2. **Change the Deploy command** to `npm run deploy` (above).
3. **Add the secrets** (Workers & Pages > xpost > Settings > Variables and Secrets > Add, type **Secret**): `SESSION_SECRET` (at least 32 random characters, e.g. `openssl rand -base64 48`), `LS_API_KEY` (Lemon Squeezy > Settings > API), `LS_WEBHOOK_SECRET` (see step 5). They are listed, without values, in `.dev.vars.example`.
4. **Set the Lemon Squeezy IDs** once the SCATTERit product exists in the store: `LS_STORE_ID`, `LS_PRODUCT_ID` and optionally `LS_VARIANT_IDS` (comma-separated). Either edit `[vars]` in `wrangler.toml` or set them as plain-text variables in the dashboard (`keep_vars = true` keeps dashboard values). **Until both IDs are set, every sign-in is refused** with "Sign-in isn't available yet", and webhooks get HTTP 503. This is deliberate: the store is shared with XLISTit, and an XLISTit key must never unlock SCATTERit.
5. **Add a Lemon Squeezy webhook** (Lemon Squeezy > Settings > Webhooks): URL `https://xpost.<your-subdomain>.workers.dev/api/webhooks/lemonsqueezy`, a signing secret of your choice (the same value goes in `LS_WEBHOOK_SECRET`), events: `order_refunded`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`, `subscription_resumed`, `subscription_payment_failed`, `subscription_payment_success`, `subscription_payment_recovered`, `subscription_payment_refunded`, `license_key_created`, `license_key_updated`. Test-mode events are ignored unless the variable `ALLOW_TEST_WEBHOOKS` is `true` (use that only on a staging copy). The existing XLISTit webhook can stay as it is; SCATTERit ignores events for other products.

CI (`.github/workflows/ci.yml`) typechecks, tests, builds, applies the migrations to a local D1 and runs `wrangler deploy --dry-run`; it never deploys. Secrets go in the Cloudflare dashboard or a local `.dev.vars` (ignored), never in the repo.

## Sign-in, sessions and licences (M1)

- **Sign-in** (`POST /api/auth/sign-in`): purchase email + Lemon Squeezy licence key. The Worker calls the LS License API `validate` (it does **not** activate an LS instance: instances are the desktop device slots used from M7) and requires store ID, product ID (and variant, if `LS_VARIANT_IDS` is set) to be SCATTERit's, the key to be active and unexpired, and the email to match the order's `customer_email` (case-insensitive). Failures share one generic message, except expired, refunded and disabled licences, which get their own plain-English reason. Licence logic is forked from XLISTit (`worker/src/licence.ts`, `lemonsqueezy.ts`, `webhook.ts`, `rate-limit.ts`, `log.ts`, `scrub.ts`).
- **Sessions**: random 256-bit token in `__Host-scatterit_session` (HttpOnly, Secure, SameSite=Lax, Path=/). D1 stores only its SHA-256. `MAX_WEB_SESSIONS` (default 3) per licence; the oldest is signed out. `GET /api/me`, `POST /api/auth/sign-out`, `DELETE /api/sessions/:id` (own sessions only).
- **CSRF**: every state-changing `/api` request (except the signed webhook) must be same-origin (`Origin` equal to the site, `Sec-Fetch-Site: same-origin` when sent) and carry `X-SCATTERIT-CSRF`. Before sign-in that header is the fixed value `sign-in` (a custom header forces a CORS preflight that SCATTERit never allows); after sign-in it must equal the HMAC token returned by sign-in and `GET /api/me`.
- **Rate limits**: per address and per email (Cloudflare Rate Limiting bindings plus a memory layer), a shared cap on Lemon Squeezy calls, and a strict D1 counter of 10 failed sign-ins per email per address per hour (so a stranger who knows a customer's email cannot lock them out).
- **Refunds**: a full refund of an SCATTERit order is recorded in `refunded_orders` (even if nobody has signed in with that key yet) and its keys are disabled in Lemon Squeezy, retried by LS's webhook retries and by the cron until it succeeds. Sign-in with a refunded order's key is refused.
- **Licence changes**: the webhook (subscription status, invoice events mapped through `ls_subscriptions`, licence key updates; late out-of-order events are ignored) and an every-15-minutes cron (re-validates up to `REVALIDATE_BATCH` licences older than `REVALIDATE_HOURS` through the LS API; a key that errors on its own is skipped until next time, while LS outages stop the run) update `licences.status`. A blocked licence keeps its sessions, so the user can read why in the app, but scheduled targets and pending reminders are paused (and restored when the licence is usable again). `worker/src/gate.ts` has the helper M2+ routes use to refuse new posts.
- **Config vars** (defaults in `worker/src/config.ts`): `MAX_WEB_SESSIONS` 3, `MAX_DESKTOP_DEVICES` 2, `SESSION_TTL_DAYS` 30, `REVALIDATE_HOURS` 24, `REVALIDATE_BATCH` 15, `DESKTOP_OFFLINE_GRACE_DAYS` 7.
- **Data**: D1 schema in `worker/migrations` (all times UTC epoch milliseconds). Local: `npm run db:migrate:local`, then `npm run dev` with a `.dev.vars` copied from `.dev.vars.example`.
- **Later** (not built): passkeys as an optional second factor, and emailed 6-digit codes once there is a domain and Email Service (Workers Paid).
