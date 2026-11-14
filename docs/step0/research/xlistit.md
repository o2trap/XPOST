# XLISTit research for xpost (Step 0, read-only)

Source: `/home/user/marketplace-crosslister` (shallow clone, 1 commit `a6b745c`, branch `claude/compassionate-keller-sv2lg2` is the only/default branch: `CLAUDE.md:8`). Nothing in that repo was modified. All paths below are relative to that repo root.

## TL;DR for xpost

- Stack is as expected: Electron 45.2.3, TypeScript 7.0.2, React 19.3.1, Vite 8.3.6, Tailwind 4.3.5 (`@tailwindcss/vite`), electron-updater 6.8.11, electron-builder 26.18.0, better-sqlite3 13.0.3, Zod 4.6.7, Vitest 5.1.0, Playwright 1.65.0 (`package.json:24-57`, versions resolved from `package-lock.json`). Main/preload are bundled with **esbuild** (not Vite) via `scripts/build-main.mjs:4,17-18`; only the renderer uses Vite.
- **Licensing is already server-side.** The Lemon Squeezy calls, product/variant checks and token signing live in a Cloudflare Worker (`website/lib/licence.ts`, `website/lib/lemonsqueezy.ts`), which is pure Web Crypto + Zod and already runs on Workers. The app only verifies an Ed25519 token offline (`src/main/licence/service.ts`, `src/shared/licence-token.ts`). Nothing has to be "moved to a Worker"; xpost should fork the Worker modules and parameterise brand strings.
- **Signing is not in use.** The owner bought no Apple/Windows certificates (`docs/HANDOVER.md:11,33,63-67`). `release.yml` (sign + notarize + publish) exists but is effectively unused. Real releases are built on the owner's Mac with signing off, then **uploaded by hand** to the public GitHub repo `o2trap/xlistit-releases` (`docs/LAUNCH-CHECKLIST.md:110-126`). Mac builds are ad-hoc signed and **cannot auto-update** (`src/main/updater/mac-signing.ts`). Windows signing has no Azure Trusted Signing config, only a comment (`electron-builder.yml:62`, `docs/M6.md:32`).
- **No Cloudflare Pages, D1, R2 or Queues.** It is one Worker with Static Assets, one KV namespace and Rate Limiting bindings (`website/wrangler.toml`). Cloudflare deploys it through its own Git integration (Workers Builds) on every push. No GitHub Action deploys it.
- **Assisted mode** uses `BrowserWindow` (not `WebContentsView`) with `persist:assisted-<mp>` partitions, an isolated-world page script, real input events and CDP `DOM.setFileInputFiles`. Selector JSON is bundled with the app **and** served signed from the Worker, so fixes ship without an app release. There is no per-marketplace kill switch; the kill switch is a global "minimum app version" that blocks all posting.

---

## 1. Cloudflare

### Services used
| Service | Where | Notes |
|---|---|---|
| Workers (with Static Assets) | `website/wrangler.toml:4-18` | One Worker named `xlistit`, `main = "worker.ts"`, `[assets] directory = "./dist"`, binding `ASSETS`, `run_worker_first = true` (every request goes through the Worker for the https redirect and security headers). `workers_dev = true`, `preview_urls = false`, `keep_vars = true` (keeps dashboard vars across deploys). |
| KV | `website/wrangler.toml:21-24` | One binding, `XLISTIT_KV`, with no id ("automatic resource provisioning"). Holds admin data, announcements, min version, coming-soon flag, policies, trial-per-fingerprint records (`trial:<fp>`, `website/lib/licence.ts:64,161`), ambassador records (AES-GCM encrypted, `website/lib/secure-kv.ts:1-23`) and download counts. |
| Rate Limiting API | `website/wrangler.toml:26-57`, `website/lib/rate-limit.ts:29-74` | `RL_LICENCE` 10/min, `RL_EBAY` 20/min, `RL_ADMIN_LOGIN` 10/min, `RL_ADMIN` 60/min, `RL_PUBLIC` 60/min, `RL_UPSTREAM` 300/min for all users combined, per upstream. There is also an in-memory fallback limiter. The webhook and eBay deletion routes have no per-IP limit (`rate-limit.ts:47`). |
| HTMLRewriter | `website/worker.ts:32-65,107-121` | Injects checkout and download links, price, support email and the analytics beacon at request time. |
| Web Analytics | `docs/HANDOVER.md:102-107` | Optional `CF_WEB_ANALYTICS_TOKEN`. |
| Custom domain | `docs/HANDOVER.md:30`, `website/worker.ts:67-79` | `xlist-it.co.uk` (Worker Custom Domain). The old `*.workers.dev` host and `www` redirect pages with a 301, but `/api/*` and `/ebay-callback` are still answered on every host. |
| **Not used** | – | Pages, D1, R2, Queues, Durable Objects, Cron Triggers. There is no database: customer data stays on the device, and licence state lives in Lemon Squeezy (`docs/M2.md:11`, `docs/HANDOVER.md:111-115`). |

### Deployment
- Cloudflare's dashboard Git integration does the deploy: Root directory `website`, build `npm run build`, deploy `npx wrangler deploy`, production branch `claude/compassionate-keller-sv2lg2` (`website/wrangler.toml:2`, `docs/M2.md:57-66`). A push deploys it (`CLAUDE.md:8`, `docs/LAUNCH-CHECKLIST.md:128-129`).
- GitHub Actions only **tests** the website (`.github/workflows/ci.yml:43-58`). No workflow runs `wrangler deploy` and there is no `CLOUDFLARE_API_TOKEN` secret.
- Secrets and vars are set in the Cloudflare dashboard. The names are in `website/.env.example:1-41`: runtime `XLISTIT_SIGNING_KEY`, `LS_STORE_ID`, `LS_PRODUCT_IDS`, `LS_VARIANTS`, `LS_API_KEY`, `LS_WEBHOOK_SECRET`, `MIN_APP_VERSION`, `MIN_APP_MESSAGE`, `EBAY_*`, plus `ADMIN_PASSWORD` and `ADMIN_TOTP_SECRET` (`docs/HANDOVER.md:57`, `docs/ADMIN.md`). Build-time vars: `FREE_CHECKOUT_URL`, `MONTHLY_CHECKOUT_URL`, `MONTHLY_PRICE`, `DOWNLOAD_MAC_URL`, `DOWNLOAD_WIN_URL`, `SUPPORT_EMAIL`.

### `website/` folder
- `website/worker.ts`: the router (268 lines). Static site plus API: `/api/v1/licence/{activate,validate,deactivate,devices}` (`:25-30,249-250`), `/api/v1/webhooks/lemonsqueezy` (`:251-253`), `/api/v1/app/config` (min version, support email, policyVersion, `:201-207`), `/api/v1/app/announcements` and `/api/v1/app/sponsors` (signed, `:209-226`), `/api/v1/selectors/(vinted|depop)` (signed selector feed, `:234-242`), `/api/v1/download/(mac|windows)` (counts, then a 302 to the GitHub "latest" asset, `:189-199`), eBay OAuth relay `/api/v1/ebay/{config,token,account-deletion}` (`:243-248`), admin `/api/admin/*`, ambassador `/api/ambassador/*`, market prices.
- `website/lib/`: handlers, licence, lemonsqueezy, webhook, token (signing), config (Zod env), rate-limit, admin (+ admin-security, TOTP), announcements, coming-soon, policies, sponsors, downloads, seo, analytics, secure-kv, ebay, market, ambassador.
- `website/site/`: hand-written static HTML, CSS and JS (no framework). `website/scripts/build-site.mjs` builds `dist/` (layout, SEO tags, sitemap, robots, `_headers`), and copies `config/selectors/*.json` into `dist/selectors/` (`build-site.mjs:85-88`).
- `website/scripts/gen-keys.mjs`: makes the Ed25519 keypair (`npm run keys`, `docs/M2.md:50-55`).
- Tests: `website/test/*.test.ts` with `fake-ls.ts`, a Lemon Squeezy imitation (`website/vitest.config.ts`).

### Lemon Squeezy proxy Worker
Yes, it is the same Worker. The app never calls Lemon Squeezy directly: `src/main/licence/provider.ts:236-273` POSTs to `${websiteUrl}/api/v1/licence/<action>`.

### Update feed hosting
- It is **not** on Cloudflare. electron-updater reads GitHub Releases on the public repo `o2trap/xlistit-releases` (`electron-builder.yml:25-30`).
- The Worker only redirects download buttons to `https://github.com/o2trap/xlistit-releases/releases/latest/download/XLISTit.dmg|XLISTit-Setup.exe` (`docs/LAUNCH-CHECKLIST.md:117-120`).
- Selector-config updates, min-version and announcements are served by the Worker (`docs/M6.md:5-11`).

---

## 2. GitHub

### Repo layout (`README.md:31-42`)
`src/shared` (types, Zod, IPC contract), `src/main` (Electron main: DB, services, IPC, licence, assisted, updater, adapters), `src/preload`, `src/renderer` (React), `website/` (Worker), `config/` (app.json, licence-public-key.pem, selectors/*.json), `build/` (icons, entitlements), `brand/`, `scripts/`, `tests/{unit,e2e,packaged,fixtures}`, `docs/`, `videos/explainroo` (install-guide video sources).

### Workflows
**`.github/workflows/ci.yml`**
- Triggers on every `push` and `pull_request` (`:2-4`).
- Job `app` runs on `ubuntu-latest` and `windows-latest` only. macOS was dropped to save minutes (`:10-11`). Steps: `npm ci` (root and `website`), typecheck, `npm test` (Vitest inside Electron's Node), build, then Playwright e2e (`xvfb-run` on Linux). On Linux it also runs `electron-builder --dir --linux --publish never` plus the packaged smoke test (`playwright.packaged.config.ts`) (`:27-31`). Test results are uploaded on failure.
- Job `website` installs root deps with `--ignore-scripts` (for shared-code compat tests), then runs typecheck, test and build (`:43-58`).
- No secrets.

**`.github/workflows/release.yml`**
- Trigger: push of tag `v*` (`:4-6`). Permissions: `contents: read`.
- Matrix: `macos-latest --mac --universal` and `windows-latest --win --x64` (`:13-18`).
- Checks the tag matches `package.json` (`:29-31`), runs the tests, installs sharp for both darwin architectures (`:36-40`) and decodes the Apple API key into a `.p8` (`:41-43`).
- Then `npm run build` and `electron-builder <target> --publish always -c.publish.releaseType=<release|prerelease>`. A tag containing `-` becomes a prerelease (beta channel) (`:53-57`). Installers are uploaded as artifacts.
- **Secret and var names:** vars `XLISTIT_WEBSITE_URL`; secrets `XLISTIT_LICENCE_PUBLIC_KEY`, `GH_RELEASES_TOKEN` (exposed as `GH_TOKEN`), `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` (`:20-24,43,48-52`; table in `docs/M6.md:21-30`). Env `XLISTIT_RELEASE=1` makes the build fail if the URL or public key is missing (`scripts/build-main.mjs:14-16`).
- **Status:** written but never proven. "The first tagged release is the real test" (`docs/M6.md:51-53`). In practice it isn't used, because there are no certificates and `GH_RELEASES_TOKEN` was never created ("No token is needed: you upload the installers yourself", `docs/LAUNCH-CHECKLIST.md:110`).

**`.github/workflows/test-build.yml`**
- `workflow_dispatch` with input `platform` = both | mac | windows (`:5-12`).
- Builds unsigned installers with `CSC_IDENTITY_AUTO_DISCOVERY=false`, `--publish never -c.mac.notarize=false -c.mac.identity=null` (`:22-23,37`), and uploads them as artifacts kept for 14 days.
- No secrets.

### How releases reach the releases repo (actual process)
1. Claude bumps the version and `src/shared/changelog.ts`, runs the tests, then builds on the owner's Mac: `npm ci && npm run build && npx electron-builder --mac dmg --publish never -c.mac.notarize=false -c.mac.identity=null` (`docs/HANDOVER.md:69-73`). The checklist says the Windows exe comes out of the same flow (`docs/LAUNCH-CHECKLIST.md:114`).
2. The owner creates release `vX.Y.Z` on github.com/o2trap/xlistit-releases by hand and drags in 8 files: `.dmg`, `-Setup.exe`, the `-universal-mac.zip`, `latest.yml`, `latest-mac.yml` and 3 `.blockmap` files (`docs/LAUNCH-CHECKLIST.md:122-126`).
3. Apps pick the release up through electron-updater's GitHub provider. Note: the task brief says `o2trap/XLISTit-RELEASES`; the config uses lowercase `xlistit-releases` (GitHub treats the two the same).

### Mac signing and notarization
- Configured: hardened runtime, `notarize: true` using `APPLE_API_KEY`/`_ID`/`_ISSUER` (notarytool API key), entitlements `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`, `network.client` (`electron-builder.yml:32-52`, `build/entitlements.mac.plist`). Universal build uses `mergeASARs` plus `x64ArchFiles` for sharp and better-sqlite3 prebuilds (`electron-builder.yml:49-52`, `docs/HANDOVER.md:146`).
- **Actual:** not signed and not notarized. Users press "Open Anyway" (`docs/HANDOVER.md:63-67`). Because macOS won't install updates into an unsigned app, `canSelfUpdate()` runs `codesign -dv` and looks for `Authority=Developer ID Application` (`src/main/updater/mac-signing.ts:229-236`). If it isn't there, "Download" opens the website instead (`src/main/index.ts:263-265`, `src/main/updater/service.ts:32-36,124-126`).

### Windows signing
- Configured: `signtoolOptions.publisherName: XLISTit`, with `.pfx` through `CSC_LINK`/`CSC_KEY_PASSWORD` (`electron-builder.yml:62-64`, `release.yml:48-49`).
- **Azure Trusted Signing is not configured.** It is only suggested, with no `azureSignOptions` (`docs/M6.md:32`).
- **Actual:** unsigned, so users see SmartScreen "More info, Run anyway" (`docs/HANDOVER.md:66`). Windows auto-update works even unsigned (`docs/HANDOVER.md:67`).
- NSIS settings: one-click, per-user, differential package (`electron-builder.yml:65-71`).

### Electron fuses
`runAsNode: false`, `enableNodeOptionsEnvironmentVariable: false`, `onlyLoadAppFromAsar: true` (`electron-builder.yml:16-19`). **`enableCookieEncryption` is deliberately left off** (`:12-15`). See §5 and §7.

---

## 3. Lemon Squeezy licensing

### Architecture (`docs/M2.md:3-13`)
```
App --POST /api/v1/licence/{activate,validate,deactivate,devices}--> Worker --> LS License API (+ LS main API with LS_API_KEY)
App <-- Ed25519-signed token "XLT1.<b64url payload>.<b64url sig>" --
```
All decisions are made on the server. The client only verifies the token offline and enforces time rules.

### Server side (Worker), fully portable (Web Crypto + Zod + fetch)
- **Request schemas:** key is `[A-Za-z0-9-]{8,100}`, fingerprint is 64 hex chars, plus label and instance id (`website/lib/licence.ts:19-27`).
- **Activate** (`licence.ts:47-72`):
  1. LS `validate(key)` with no instance, then `statusError` and `productError`. This runs **before** a seat is used.
  2. If `LS_API_KEY` is set, it lists the key's instances. An existing instance whose name carries this fingerprint is reused (handles reinstalls).
  3. For a free variant: the trial window is checked (LS `created_at` + 24 h) and so is the KV `trial:<fp>` one-trial-per-computer record.
  4. LS `activate(key, instance_name)`, with `instance_name = "XLISTit · <label> [<fp>]"` (`:30-34`).
  5. `issue()` signs the token.
- **Validate** (`licence.ts:74-83`): LS `validate(key, instanceId)`, then status, valid and product checks, then **instance binding**: the fingerprint parsed from the LS instance name must equal the request fingerprint (`:81`).
- **Deactivate** (`:85-92`) is idempotent (already gone counts as ok). **Devices** (`:94-110`) needs `LS_API_KEY` and uses `/v1/license-key-instances`.
- **Product check: yes.** `productError()` requires `meta.store_id === LS_STORE_ID`, `meta.product_id ∈ LS_PRODUCT_IDS` and `meta.variant_id ∈ LS_VARIANTS` (`licence.ts:178-185`). Keys from other stores or products get `wrong_product` without using a device slot (tested, `docs/M2.md:74`).
- **Status mapping:** `disabled` gives `suspended`, `expired` gives `expired` (`:171-176`). LS error strings are mapped by substring (`mapLsError`, `:188-196`). This is a little brittle.
- **Token payload:** `{v:1, iid, fp, ent: free|monthly|ambassador, lexp, iat, kh: first 16 hex of SHA-256(upper(key)), plan}` (`website/lib/token.ts:309-339`, `src/shared/licence-token.ts:370-385`). Free trial: `lexp` = trial end, so it is enforced offline (`licence.ts:153-169`).
- **LS client** (`website/lib/lemonsqueezy.ts`): License API as form-POST with a 15 s timeout. 5xx and 429 throw `LemonSqueezyError`, which becomes `server_error` (transient on the client). Main API uses a Bearer `LS_API_KEY`. `catalog()` backs the admin set-up helper, `disableLicenceKey()` handles refunds. `fetch` is wrapped to avoid the Workers "Illegal invocation" bug (`:216-217`, `docs/HANDOVER.md:142`).
- **Config:** Zod-validated env (`website/lib/config.ts:358-391`). `LS_VARIANTS` is `id:free,id:monthly`.

### Webhooks
- `POST /api/v1/webhooks/lemonsqueezy` (`website/worker.ts:251-253`). `handleWebhook` returns 503 unless both `LS_WEBHOOK_SECRET` and `LS_API_KEY` are set (`website/lib/handlers.ts:447-460`).
- **The signature is verified:** HMAC-SHA256 of the raw body against the `X-Signature` hex, using Web Crypto `verify` (constant time) (`website/lib/webhook.ts:280-286`).
- Only `order_refunded` with `status === 'refunded'` is handled: every licence key on that order is disabled. Partial refunds are ignored. Other stores are ignored, but only when `store_id` is present in the payload (`webhook.ts:294-304`).
- Subscription cancel and expiry are **not** handled by webhook. The design relies on LS setting the key to `expired`, which the daily validate picks up (`docs/HANDOVER.md:27`).
- There is no replay or idempotency store. That is harmless here because disabling is idempotent.

### Client side (app main process, Node-only)
- `LicenceService` (`src/main/licence/service.ts`):
  - `payload()` verifies the token signature with the embedded public key **and** checks `fp == this machine`, `kh == hash(stored key)` and `iid == stored instance` (`:51-58`).
  - `status()` implements the rules (`:67-107`):
    - suspended or expired comes from `last_error` or `lexp`
    - **clock guard:** `now + 1h` earlier than `last_seen_at` or `iat` means read-only (`:94-95`)
    - **offline grace** = 7 days after the token's `iat`, then read-only (`:84-85,96`; constants `src/shared/licence.ts:421-423`: `OFFLINE_GRACE_DAYS = 7`, `REVALIDATE_HOURS = 24`, `TRIAL_HOURS = 24`)
  - `activate()` re-verifies the new token before saving it, and releases the old key's seat when switching keys (`:109-129`).
  - `refreshDue()`: 24 h after `iat`, retrying hourly after a failure (`:131-140`). `doRefresh()` clears the token on `not_activated|invalid_key|wrong_product` (`:147-166`).
  - Enforcement: `assertCanEdit` / `assertCanView` / `assertCanPost` (`:206-218`), applied per IPC channel through `IPC_ACCESS` (`src/shared/ipc.ts:322-337`, `src/main/ipc/handlers.ts:367-369`).
- **Re-validation schedule:** the tick runs every 15 minutes (`touchClock` + `refreshDue`) (`src/main/index.ts:184-191`).
- `LemonSqueezyProvider` (`src/main/licence/provider.ts:240-273`): a thin HTTP client to the Worker (20 s timeout). A network failure becomes `network`.
- Fingerprint (`src/main/licence/fingerprint.ts`): macOS `ioreg IOPlatformUUID`, Windows registry `MachineGuid`, Linux `/etc/machine-id`, otherwise a random file in userData. Hashed as `sha256("xlistit-fp-v1:"+id)`. Device label is like `macOS · arm64`.
- Vault (`src/main/licence/vault.ts`): stores secrets as Electron `safeStorage` ciphertext in the SQLite `secrets` table (`src/main/db/migrations/0002_licence.sql:1-16`). It refuses to store anything if encryption is unavailable, and on Linux it refuses `basic_text` (`src/main/index.ts:119-129`).
- Public key: baked in at build time through esbuild `define` from `XLISTIT_LICENCE_PUBLIC_KEY`, falling back to `config/licence-public-key.pem` (committed; it is a public key) (`scripts/build-main.mjs:5-13`, `src/main/config.ts`). `website/lib/app-public-key.ts` copies it so `/admin` can check that the signing secret matches.

### What xpost should reuse, and how portable it is
| File | Runtime | Reuse for xpost |
|---|---|---|
| `website/lib/licence.ts` | Workers (Web Crypto, Zod) | Fork as is. Strip the ambassador branches (`:44-45,49,76,86,95-100,112-143`) unless wanted, and rename the `XLISTit · … [fp]` instance-name prefix (`:30-33`). **Brand string to parameterise.** |
| `website/lib/lemonsqueezy.ts` | Workers | Reuse verbatim. |
| `website/lib/webhook.ts` | Workers | Reuse. Consider adding `subscription_*` events and making the store check mandatory. |
| `website/lib/token.ts` | Workers / Node 22 | Reuse, but **change the prefixes** (`XLT1`, `XLSC1`, `XLSP1`, `XLAN1`) and use a **separate signing key**, so XLISTit and xpost tokens can't be swapped for each other. |
| `website/lib/config.ts`, `handlers.ts`, `codes.ts`, `rate-limit.ts` | Workers | Reuse. `codes.ts` mirrors `src/shared/licence-codes.ts` (a test keeps them in sync, `docs/HANDOVER.md:144`). |
| `src/main/licence/service.ts`, `provider.ts`, `vault.ts`, `fingerprint.ts`, `src/shared/licence-token.ts`, `src/shared/licence.ts` | **Node-only** (`node:crypto`, `child_process`, `fs`, better-sqlite3) | Client side, Electron main only. Fine as is for xpost's main process. Change the salt `xlistit-fp-v1` (`fingerprint.ts:318`) and the error codes `XL-2xx`. |
| `tests/unit/licence-harness.ts`, `tests/e2e/licence-stack.ts`, `website/test/fake-ls.ts`, `website/test/setup.ts` | Node | Very valuable. They run the real Worker code against a fake LS over HTTP. |

---

## 4. App shell and updater

### Stack (confirmed, with differences noted)
- Electron 45.2.3, TypeScript 7.0.2 (`tsconfig.json`: ES2022, Bundler resolution, strict, `noUncheckedIndexedAccess`), React 19.3.1, Vite 8.3.6 (renderer only, `vite.config.ts`, root `src/renderer`, `base: './'`), Tailwind 4.3.5 (CSS-first `@theme`, no `tailwind.config.js`), electron-updater 6.8.11, better-sqlite3 13.0.3 (WAL, foreign keys, busy_timeout, `src/main/db/connection.ts:5-11`), Zod 4.6.7, sharp, heic-decode, semver, qrcode, tar.
- **Differences from the expected stack:**
  - Main and preload are built with **esbuild** to CJS (`scripts/build-main.mjs:4,17-18`), not electron-vite.
  - There is **no router library** (a hand-rolled `Route` union, `src/renderer/App.tsx:31`) and no state library.
  - **No ESLint or Prettier** config is present.
  - Unit tests run inside Electron's Node (`ELECTRON_RUN_AS_NODE=1 electron vitest`, `package.json:16`) so the native ABI matches.
  - Node 22 is required (`README.md:19`).

### Process structure and security
- **Main:** `src/main/index.ts` (404 lines) wires everything: DB context, `LicenceService`, `SelectorConfigStore`, `UpdateService`, `AssistedManager`, eBay, queue, timers, tray, protocol (`:233-397`).
  - All permissions are denied by default except `clipboard-sanitized-write`, in every session (`:50-57`).
  - WebRTC is limited to `disable_non_proxied_udp` (`:49`).
  - Single-instance lock (`:61`). Custom `xlistit-photo://` protocol with a path-escape guard (`:59,347-353`).
- **Main window:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, preload `dist/preload/index.js` (`src/main/index.ts:197-210`). `setWindowOpenHandler` sends https links to the OS browser and denies everything else. `will-navigate` is blocked except for the dev URL (`:211-218`).
- **CSP:** `default-src 'self'; img-src 'self' xlistit-photo: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'` (`src/renderer/index.html:68`). The dev `ws://` entry is stripped at build (`vite.config.ts:32-36`).
- **Preload:** `contextBridge.exposeInMainWorld('xlistit', api)` with a single `invoke(channel, arg)` over an allow-list of about 120 channels, plus typed `on*` event subscriptions (`src/preload/index.ts:7-67`).
- **IPC contract:** `src/shared/ipc.ts`, where `IpcArgs` holds a Zod schema per channel, plus `IpcResults` and `IPC_ACCESS` ('open'|'view'|'edit').
  - `registerIpc` (`src/main/ipc/handlers.ts:358-380`) checks the sender frame URL starts with `file://` or the dev URL, enforces licence access, runs the Zod parse, then the handler.
  - Every result is wrapped as `{ok, value}` or `{ok:false, error}`, with plain-English errors that carry an `XL-xxx` code (`src/main/services/errors.ts:8-13`; registry `src/shared/error-codes.json`, kept in sync by `tests/unit/error-codes.test.ts`).
- **Local storage:** SQLite file in userData, SQL migrations `src/main/db/migrations/0001..0009`, backed up before migrating with automatic restore on failure (`src/main/db/migrate.ts:22-57`). Settings live in the DB (Zod `Settings`, `src/shared/domain.ts:108` theme etc.).

### Updater UX (`src/main/updater/service.ts`, `src/renderer/components/UpdateCard.tsx`, `src/renderer/useUpdates.ts`)
- **Check:** at launch and every 6 h (`service.ts:94-100`), plus Settings, Check for updates. In packaged builds the updater is the real `electron-updater` `autoUpdater`. Dev/test uses `FakeUpdater` driven by `XLISTIT_FAKE_UPDATE` (`src/main/index.ts:259-262`, `src/main/updater/fake.ts`).
- **Available:** the card shows version, size (sum of `files[].size`) and release notes as plain text, with HTML stripped by `notesToText` (`service.ts:41-47,61-66`). Buttons: Download, Later, Skip this version (`UpdateCard.tsx:18-24`).
- **Download:** a progress bar from `download-progress` (`service.ts:67-70`). Download errors show `XL-604`; failed background checks stay silent (`:75-80`).
- **Install:** "Restart to install" calls `quitAndInstall()`, but **never while posting**. If an assisted window or the queue is busy, it sets `installWhenFree` and installs when the last window closes (`service.ts:138-154`, `src/main/index.ts:268,283`). `autoInstallOnAppQuit = true` (`:57`).
- **Settings:** auto-download, channel stable/beta (`allowPrerelease`), skipped version (`service.ts:87-92`). `allowDowngrade = false`.
- **Minimum version:** `/api/v1/app/config` returns `minVersion`. If the app is too old, a red "Update required to keep posting" banner appears and posting is blocked (`service.ts:109-122`, `UpdateCard.tsx:34-40`, `src/main/assisted/manager.ts:432-433`).
- **Manual mode:** unsigned Mac builds open `${website}/#download` instead (`src/main/index.ts:264-265`).
- **What's new:** shown once after an update, from `src/shared/changelog.ts` (`src/main/index.ts:326-330`).
- **Feed config:** `publish: github o2trap/xlistit-releases` in `electron-builder.yml:26-30`. It is baked into `app-update.yml` at build time; no runtime `setFeedURL`.

---

## 5. Assisted mode (Vinted and Depop)

### Window and session
- **`BrowserWindow`, not `WebContentsView`.** `AssistedManager.newWindow()` (`src/main/assisted/manager.ts:236-246`) uses `partition: persist:assisted-<vinted|depop>` (`:23`) with `sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true`, **no preload**. Page-title changes are blocked. Pop-ups (for example Google sign-in) are allowed for https only, in the same partition.
- `harden()` refuses every permission except clipboard on that session (`:226-234`).
- One posting window per marketplace (`:436-437`). `busy()` is true while one is open (`:429`).

### Login
- Marketplaces, **Set up**, runs `connect(mp)`, which opens the marketplace home page and lets the user log in themselves. Closing the window marks the marketplace "set up" (`manager.ts:248-261`).
- Magic link: the user pastes the emailed link. It is accepted only on the marketplace's own domain or a subdomain, with the same scheme (`:274-283`).
- **Disconnect** runs `clearStorageData()` on the partition (`:421-426`).
- While posting, if a navigation hits `loginUrl` (a regex from the config), the state becomes `waiting_login`. After login it reloads the sell page (`:469-475`).

### Session storage: on device only, but NOT keychain-encrypted
- Sessions are Chromium cookies and storage in `userData/Partitions/assisted-<mp>`. They are never sent to XLISTit servers (`docs/M4.md:7`, `src/renderer/routes/Marketplaces.tsx:69-70`).
- **Correction to the docs:** `docs/HANDOVER.md:20` says marketplace sessions are only in the OS keychain. In fact the Electron fuse `enableCookieEncryption` is **not** enabled ("cookie encryption stays as it is", `electron-builder.yml:12-19`), so partition cookies are stored by Chromium without OS-keychain encryption. eBay OAuth tokens and the proxy login **are** in the safeStorage vault. xpost should turn on `enableCookieEncryption` from its first release, since it has no existing sign-ins to lose.

### Form filling
- **Driver** (`src/main/assisted/driver.ts`): `fillForm()` loops over the config's fields. Each field yields `filled`, `failed` ("Couldn't fill X, please set it manually.") or `skipped` (empty in the app). One field failing never stops the rest (`:265-287`).
- Step types: `text` (click, focus/select, then `insertText`, then a read-back check), `select` (native select: set the value and dispatch input/change), `files`, and `pick` (custom dropdown: open, optional search, click each path segment, wait for the option to stop moving, read back, one retry) (`:156-257`).
- **Page script** (`src/main/assisted/page-script.ts`): a self-contained `pageOp()` serialised with `toString()` and run through `webContents.executeJavaScriptInIsolatedWorld(1001, …)` (`manager.ts:43-46`).
  - It only finds elements: CSS first, then label/legend/aria-label/aria-labelledby/placeholder regex. It marks them with `data-xlistit-target`, returns their rects, and focuses or reads them.
- **Input:** real events through `webContents.sendInputEvent` (mouseMove/Down/Up) and `webContents.insertText` (`manager.ts:47-52`). This passes `isTrusted` checks (`docs/M4.md:126,136`).
- **Photos:** resized per marketplace, written to temp, then attached through the CDP debugger `DOM.setFileInputFiles` (`manager.ts:53-65,446-455`).
- **Posted detection:** a listing is recorded only when the marketplace navigates to a URL matching the `listing` regex (`manager.ts:469-471`). XLISTit never clicks Publish. The fallback is "I posted it myself": the user pastes the URL, which is validated against the regex (`capture`, `:576-587`).
- Price edits use the same mechanism on the `edit` URL (`:511-570`).
- Sold check, shop read and listing import use hidden windows in isolated worlds 1002 and 1003, and stop at login or challenge selectors (`:289-411`).

### Selector config format and versioning
- Zod schema `SelectorConfig` (`src/shared/assisted.ts:37-84`): `schema: 1`, `marketplace`, `version` (int; the highest wins), `verified` (bool, shown in the UI), `regions{UK,IE,FR,DE,US…: home, sell, listing regex, edit}`, `loginUrl` regex, `categories[]`, `fields{photos,title,description,category,brand,size,condition,colour,material,price,parcelSize: {steps: Step[]}}`, plus optional `shop` and `sold` sections with `challengeCss`. A finder is `{css[], label?}` (`:5-10`).
- Files: `config/selectors/vinted.json` (v6, verified) and `config/selectors/depop.json` (v6, verified).

### How selector config ships (both ways)
1. **Bundled:** copied to `dist/main/selectors` at build (`scripts/build-main.mjs:21`).
2. **Remote signed feed:** the Worker signs the JSON from `dist/selectors/` with Ed25519 over `XLSC1.<text>` (`website/worker.ts:234-242`, `website/lib/token.ts:342-344`).
   - The app fetches it at launch and every 6 h (`src/main/index.ts:331-337`) and verifies it with the embedded public key (`src/main/updater/remote.ts:180-183`).
   - It is then Zod-validated, and installed into `userData/selectors` only if `version` is greater than the current one (`remote.ts:201-221`).
   - `SelectorConfigStore` loads every folder and keeps the highest valid version, recording invalid files in `problems` (`src/main/assisted/config.ts:11-37`).
   - Fixing a selector means editing the JSON, bumping `version` and pushing; Cloudflare redeploys (`docs/M6.md:11`). Rolling back needs a **higher** version number.

### Kill switch
- **No per-marketplace kill switch.** The schema has no `enabled` flag.
- The global switch is the minimum app version (admin KV or `MIN_APP_VERSION`). It blocks **all** posting on older versions (`src/main/updater/service.ts:109-122`, `src/main/assisted/manager.ts:432-433`, `docs/ADMIN.md` "Minimum app version").
- Critical in-app announcements (signed, not dismissable) can tell users to stop (`docs/ADMIN.md`).
- xpost should add `enabled: false` plus a message per marketplace in the signed selector config.

### Fallbacks, warnings and opt-in
- Fallbacks:
  - per-field `failed` message
  - `XL-520` if the whole fill fails, while the window stays open for manual entry (`manager.ts:484-492`)
  - pre-flight list of missing fields before opening (`:442-444`, `src/main/assisted/plan.ts`)
- Warnings and opt-in:
  - a one-line explanation of Assisted mode on the Marketplaces page (`src/renderer/routes/Marketplaces.tsx:68-71`)
  - the `verified` flag is surfaced (`src/main/ipc/handlers.ts:50,143`)
  - sold-check is opt-in, off by default
  - the proxy is opt-in with a confirmation
- There is **no explicit marketplace-ToS risk warning or consent step** before the first assisted post.

---

## 6. UI conventions
- **Theme:** neo-brutalist, opens in **light** mode, with a `system|light|dark` setting (default `light`, `src/shared/domain.ts:108`). Dark mode is class-based (`@custom-variant dark (&:where(.dark, .dark *))`, `src/renderer/styles.css:2`), toggled by `useTheme` in `src/renderer/App.tsx:33-40`, and main sets `nativeTheme.themeSource` (`src/main/index.ts:193-195`). The website uses `data-theme` plus `theme.js` with localStorage (`website/site/theme.js`, `website/site/style.css:9-19`).
- **Tailwind 4, CSS-first** (`src/renderer/styles.css`):
  - `@theme` tokens: a purple-tinted `slate` ramp, `brand-50/500/600/700` (`#6366f1`/`#4f46e5`), `go` `#16a34a`, marketplace colours `mp-ebay` `#0064d2` / `mp-vinted` `#09b1ba` / `mp-depop` `#ff2300`, all radii 0, Inter font (`:15-42`).
  - `--ink` and `--shadow-ink` vars for light and dark (`:44-45`).
  - Utilities `input`, `label`, `btn`, `btn-primary`, `btn-ghost`, `btn-danger`, `card`, `status`, `dot` (`:54-63`).
  - Inter woff2 is bundled (offline, OFL).
- **Components:** `src/renderer/routes/*` (pages: Activation, Onboarding, Dashboard, Inventory, ItemEditor, Marketplaces, Queue, Insights, Tax, Settings) and `src/renderer/components/*` (UpdateCard, LicenceBanner, LicenceSettings, Devices, Toast, ErrorBoundary, SearchSelect, PostPanel, WhatsNew, Announcements, TermsAgreement, Logo…). Hooks: `useLicence.ts`, `useUpdates.ts`. API: `window.xlistit` typed by `XlistitApi` (`src/renderer/api.ts`). Styling is long inline Tailwind class strings in JSX (for example `App.tsx:84,92`).
- **Brand assets:** `brand/` (app icon SVG and 1024 PNG, dark icon, profile picture, sharing image 1200x630, tag logos light/dark, email template), `build/icon.png`, `build/tray.png`, `build/logo-mark.svg`, `src/renderer/assets/logo-mark.svg` and `logo-tag.svg`. All generated by `scripts/make-logo.mjs` (opentype.js + sharp, `:1-15`). The website has a matching palette in `website/site/style.css:9-15`. xpost can mirror the system (tokens, utilities, brutalist style) with its own logo and brand colour.

---

## 7. Other things to copy or avoid

### Copy
- **Test strategy:**
  - Vitest units run in Electron's Node (`vitest.config.ts`, pool forks, 30 s).
  - Playwright `_electron` e2e (`playwright.config.ts`, workers 1) against a **local fake marketplace sell page** (`tests/e2e/fixtures/fake-marketplace.ts`) and the **real Worker licence code over HTTP with fake LS** (`tests/e2e/licence-stack.ts:14-30`).
  - Packaged-app smoke test (`tests/packaged/packaged.spec.ts`, run in CI after `electron-builder --dir`).
  - Driver unit-tested with a simulated page (`tests/unit/driver-pick.test.ts`).
  - IPC contract test (`tests/unit/ipc-contract.test.ts`), `no-secrets.test.ts`, `error-codes.test.ts`.
  - Website ↔ app compat tests (`website/test/compat.test.ts`).
- Error-code discipline (`UserError('XL-xxx')` plus a JSON registry, which also generates the website's `/errors` page).
- Log scrubbing (`src/shared/scrub.ts`). DB backup before migrations. Never restart mid-post. Signed remote config. Clock-rollback guard.
- Packaged-only use of baked config: in packaged builds, env overrides are ignored (`src/main/config.ts`).
- Gotchas listed in `docs/HANDOVER.md:134-146`:
  - Zod 4 `.partial()` keeps defaults; use `patchOf()`
  - wrap `fetch` in Workers
  - in injected scripts, escape `'\\n'`
  - background windows throttle timers
  - universal mac `x64ArchFiles`

### Avoid or improve
1. **One signing key for everything.** `XLISTIT_SIGNING_KEY` signs licence tokens, selector configs, announcements and sponsors (prefix-separated), derives the KV encryption key (`website/lib/secure-kv.ts:15-23`) and keys admin cookies (`docs/ADMIN.md`). If it leaks, all of these are compromised. xpost should use its own keypair, and ideally separate keys for licences and for content feeds.
2. **Cookie encryption fuse off.** Marketplace sessions are not keychain-protected (`electron-builder.yml:12-19`), which contradicts `docs/HANDOVER.md:20`. Enable `enableCookieEncryption: true` in xpost from v1.
3. **IPC sender check** only tests `url.startsWith('file://')` (`src/main/ipc/handlers.ts:364-365`). That is acceptable because marketplace windows have no preload, but a custom `app://` scheme plus an exact-origin check is stronger.
4. **Unsigned releases:** Mac users can't auto-update, the release workflow is unproven, and uploads are manual. If xpost wants silent updates it needs an Apple Developer ID (notarytool API key) and Windows signing. Azure Trusted Signing would need `win.azureSignOptions`, which isn't written yet.
5. **CI has no macOS job.** Mac builds are only exercised by the manual Test build workflow or locally.
6. **No per-marketplace kill switch**, and selector rollback requires a version bump (see §5).
7. **Webhook** handles only `order_refunded`. The store check is skipped when the payload has no `store_id` (`website/lib/webhook.ts:296`). LS error mapping depends on message substrings (`website/lib/licence.ts:188-196`).
8. **Hard-coded brand and hosts** that a fork must change:
   - `SITE = 'https://xlist-it.co.uk'` and `OTHER_HOSTS` (`website/worker.ts:69-70`)
   - `EARLIER_SITE` (`src/main/index.ts:100`)
   - instance-name prefix (`website/lib/licence.ts:30-32`)
   - `plan:` strings (`licence.ts:166`)
   - fingerprint salt (`src/main/licence/fingerprint.ts:318`)
   - token prefixes
   - `com.xlistit.app`, `xlistit-photo://`, `window.xlistit`, `XLISTIT_*` env names
   - `publish.repo`
9. **Tech debt:**
   - `src/main/index.ts` is a 400-line god file
   - very long JSX class strings
   - no linter
   - `website/tsconfig.tsbuildinfo` is committed
   - scope creep that xpost shouldn't copy blindly: ambassador program, sponsors, market prices, tax, eBay, proxy
   - CSP allows `style-src 'unsafe-inline'`
10. **Committed secrets:** none found. The pattern scan over tracked files only matched dummy fixtures in `tests/unit/support.test.ts` and the pattern definitions in `tests/unit/no-secrets.test.ts`. `config/licence-public-key.pem` and `website/lib/app-public-key.ts` hold the **public** key (fine). Git history couldn't be scanned because the clone is shallow (1 commit).
