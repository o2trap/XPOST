# xpost: Step 0 research and plan

Date: 2026-11-14. Status: **draft for owner approval. No code has been written.**

Source reports (copied verbatim): `docs/step0/research/`
- `xlistit.md`: XLISTit repo analysis (`/home/user/marketplace-crosslister`, read-only)
- `tiktok_youtube.md`
- `instagram_facebook.md` (its top "verification update" section overrides older text in that file)
- `x_snapchat.md` (its `[LIVE]` items override older text in that file)
- `cloudflare_bridges.md`

How to read the labels:
- **[LIVE]** / **[DIRECT]**: checked against the live official page on 2026-11-14.
- **[search]**: from search-result summaries of official pages, not read word for word.
- **UNVERIFIED**: no official source found. Settle it before relying on it (section J).
- **Assumption**: a number I chose to make an estimate work. Not from research.

---

## 0. Summary

xpost can be built on the planned stack: Cloudflare for the whole backend, GitHub, and Lemon Squeezy. XLISTit's licence Worker code ports almost unchanged.

The main findings:
- **Only YouTube and X can publish automatically to real users on day one.** YouTube dropped its "unaudited means private" rule on 2026-11-02, but all xpost users share 100 uploads a day. X needs no review, but every post costs xpost money.
- **TikTok, Instagram and Facebook need approvals first.** TikTok needs scope review for inbox drafts and an audit for automatic public posts. Meta needs App Review plus Business Verification. **Snapchat's posting API is allowlist-only**, through a Snap contact.
- **Assisted fill is forbidden on all six platforms**, either by their terms or because sign-in is blocked. I recommend not building M8.
- **Handoff works everywhere** and is the fallback for every platform.
- **Your request for "bring your own X keys" conflicts with X's Developer Agreement and Policy.** I propose an xpost-owned X app with a per-licence spending cap instead.
- **A real domain is needed earlier than planned.** TikTok photo pulls need a verified domain. Google verification needs a verified-domain homepage. Meta review needs public privacy, terms and data-deletion URLs (a domain is strongly advisable). Email codes need a sending domain. Cloudflare Workers Paid ($5/month) is needed from M1.
- **Scheduling:** I recommend D1 as the source of truth, a cron sweep every minute, and one Workflow per target, with no Queue.

### What changed vs your expected constraints

| # | Your expected constraint | Verdict | Evidence |
|---|---|---|---|
| 1 | TikTok: an unaudited app can only post privately | **CONFIRMED** | "Unaudited API clients can only post contents in SELF_ONLY viewership." https://developers.tiktok.com/docs/en/content-posting-api-get-started |
| 2 | TikTok: few users on an unaudited app | **CONFIRMED, made specific** | Up to **5 users per 24 h**, and each account must be set to private. Same page; also https://developers.tiktok.com/doc/content-posting-api-reference-direct-post |
| 3 | TikTok: public posting needs an audit | **CONFIRMED** | The audit is a "Terms of Service compliance" audit. The sandbox gives no public posting. https://developers.tiktok.com/docs/en/add-a-sandbox |
| 4 | TikTok: inbox draft has a lower bar | **CONFIRMED [LIVE], with a caveat** | It needs `video.upload` scope approval (app review with a demo video), not the audit. Cap: **5 pending shares per 24 h**. The Photo reference has an ambiguous "unaudited → private" line, so confirm with a sandbox test. https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content , https://developers.tiktok.com/doc/content-posting-api-reference-upload-video |
| 5 | YouTube: uploads from an unaudited project are locked private | **CHANGED [LIVE]** | Revision history, 2026-11-02: unverified projects "are no longer restricted to private viewing mode". https://developers.google.com/youtube/data/revision_history |
| 6 | YouTube: upload quota is per project and shared | **CONFIRMED; units CHANGED [LIVE]** | Since 2026-06-01, uploads use their own bucket: **100 `videos.insert` calls per day per project**, for all xpost users combined. https://developers.google.com/youtube/v3/docs/videos/insert , https://developers.google.com/youtube/data/guides/quota_and_compliance_audits |
| 7 | Instagram: professional accounts only | **CONFIRMED [DIRECT]** | Business and Creator accounts only. https://developers.facebook.com/documentation/instagram-platform/overview |
| 8 | Instagram: App Review needed | **CONFIRMED, with nuance** | Advanced Access needs App Review **and Business Verification**. Without them, only people with a role on the app can connect. https://developers.facebook.com/documentation/instagram-platform/app-review |
| 9 | Facebook: Pages only | **CONFIRMED** | Personal profiles: `publish_actions` was removed in 2018. Groups API removed in 2024. [search] |
| 10 | Facebook: App Review needed | **CONFIRMED** | Same rules as Instagram. |
| 11 | X: pay per use | **CONFIRMED [LIVE]** | No contracts, no minimum spend, prepaid credits. https://docs.x.com/x-api/getting-started/pricing |
| 12 | X: posts with links cost more | **CONFIRMED [LIVE]** | $0.015 per post; **$0.200 with a URL** (about 13x). Same page. |
| 13 | X: web intent is free | **CONFIRMED [LIVE]** | `https://x.com/intent/tweet` takes text, url, hashtags, via, related and in_reply_to. **No media.** https://docs.x.com/x-for-websites/post-button/guides/web-intent |
| 14 | Snapchat: posting goes through the Public Profile API | **CONFIRMED [LIVE]** | Story, Spotlight and Saved Story endpoints. https://developers.snap.com/marketing-api/Public-Profile-API/ProfileAssetManagement |
| 15 | Snapchat: public profiles only | **CONFIRMED** | Endpoints sit under `/public_profiles/{id}`. Only profile Admins can post. |
| 16 | Snapchat: approval may be needed | **CHANGED: stricter [LIVE]** | "The Public Profile API is currently allowlist only." You need a Snap Business Account, an OAuth app made in **Ads Manager** (not the Developer Portal), and a Snap contact. https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted |
| 17 | Snapchat: a web uploader exists | **CONFIRMED** | profile.snapchat.com, my.snapchat.com and snapchat.com/spotlight. The help pages disagree on which one is canonical. |
| 18 | Terms restrict automation outside the APIs | **CONFIRMED for all six** | Meta: "Platform APIs are the only allowable means… The use of scripts… to automate actions… outside of the Platform APIs is not allowed" [DIRECT]. TikTok global ToS: no "automated scripts to… interact with the Services". YouTube ToS: no "automated means". Snap ToS [search]: no "automated or semi-automated means". |
| 19 | X bans scripting its website | **CONFIRMED [LIVE]** | Automation Rules ban "scripting the X website". Developer Guidelines: "No scraping, browser automation… permanent suspension." https://docs.x.com/developer-guidelines |
| 20 | Google blocks embedded sign-in | **CONFIRMED [LIVE policy text]** | "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent." https://developers.google.com/identity/protocols/oauth2/policies |
| 21 | TikTok and Instagram need media-URL domain verification | **Half CHANGED** | TikTok PULL_FROM_URL: **CONFIRMED** (verify the domain or URL prefix; https; no redirects). Instagram: **no verification documented** (UNVERIFIED). It only needs a public HTTPS URL. |
| 22 | Instagram Login has no PKCE | **CONFIRMED [DIRECT]** | Only the `client_secret` exchange is documented, and long-lived token calls "must be made in server-side code". |

### New findings you did not list
- **YouTube:** the private lock was removed on 2026-11-02 [LIVE]. Uploads now have their own **100/day** bucket [LIVE]. Without OAuth verification there is a 100-user cap and a warning screen, and Testing-mode refresh tokens die after 7 days.
- **TikTok:** max 5 posting users per 24 h while unaudited. Max **5 pending inbox drafts per 24 h**. Access tokens last **2 h** and refresh tokens **180 d**, and refresh tokens rotate [LIVE]. "An app that copies arbitrary contents from other platforms to TikTok" is not acceptable, so position xpost as "write once, post everywhere".
- **Instagram:** Instagram Login needs **no Facebook Page** and no business portfolio. Carousels now take **up to 20 items** [DIRECT]. Meta's docs disagree on the daily cap (50 vs 100), so read `content_publishing_limit` at runtime and design for 50. There is also a cap of **400 containers per 24 h**. **Resumable upload works only with Facebook Login for Business**, so Instagram Login apps must let Meta pull media from a public URL. A third setup, "Unified Login", is now recommended by Meta, but it requires a business portfolio.
- **Facebook:** Reels are capped at **30 per Page per 24 h** [DIRECT]. The Share Dialog has a new `hashtag` parameter, but no text parameter.
- **X:** **bring-your-own-keys is forbidden** by the Developer Agreement and Policy [LIVE]. Media-upload pricing is not published (UNVERIFIED). A $20 credit incentive exists.
- **Snapchat:** API video runs **5–300 s** and images are allowed on Stories [LIVE]. Spotlight posts go through **per-post review** (SUBMITTED, then LIVE or REJECTED). Media must be **AES-256-CBC encrypted** before upload. Creative Kit for Web needs no review, but it shares **URLs only**.
- **Cloudflare:** new projects should use **Workers with Static Assets, not Pages**. Workflow step and storage billing started 2026-08-10. The Rate Limiting binding is approximate.
- **Bridge report correction:** `cloudflare_bridges.md` says bridges are needed because YouTube locks unaudited uploads to private. That is **out of date** since 2026-11-02.

---

## A. XLISTit findings

Source: `research/xlistit.md`. All paths below are in `/home/user/marketplace-crosslister`.

### Cloudflare
- One Worker with Static Assets, one KV namespace and Rate Limiting bindings (`website/wrangler.toml`). **No D1, R2, Queues, Durable Objects, Cron or Pages.**
- Deploys go through Cloudflare's Git integration (Workers Builds) on every push. **No GitHub Action deploys it.**
- Secrets are set in the dashboard. `keep_vars = true`.

### GitHub
- `ci.yml` runs tests on Ubuntu and Windows on every push. **There is no macOS CI job.**
- `release.yml` (sign, notarise, publish) exists but has **never been used**.
- Real releases are built **unsigned** on the owner's Mac and uploaded **by hand** to `o2trap/xlistit-releases`. electron-updater reads that repo's Releases.

### Lemon Squeezy
- **All licence decisions already happen in the Worker.** It uses Web Crypto and Zod (`website/lib/licence.ts`, `lemonsqueezy.ts`, `webhook.ts`, `token.ts`).
- The product check is enforced: store, product and variant IDs (`licence.ts:178-185`).
- Device binding uses the fingerprint inside the LS instance name.
- The app verifies an Ed25519 token offline. It has a 7-day offline grace, re-validates every 24 h, and has a clock-rollback guard.
- The webhook verifies its HMAC signature. **It handles only `order_refunded`.** Cancellation and expiry are left to the daily validate.

### Shell and updater
- Electron 45, React 19, Vite 8 (renderer only; main is built with esbuild), Tailwind 4, Zod 4, better-sqlite3.
- Strong defaults: sandbox on, context isolation on, permissions denied by default, a Zod-checked IPC allow-list, and a CSP.
- Updater UX: Download, Later, Skip; it never restarts mid-post; and a minimum-version block.
- **Mac builds are unsigned, so Mac auto-update is off.**

### Assisted mode
- Uses a `BrowserWindow`, persistent partitions, an isolated-world script, real input events, and CDP file attach.
- Selector JSON ships signed from the Worker.
- **There is no per-marketplace kill switch.**
- **The cookie-encryption fuse is off**, so marketplace sessions are not keychain-protected. The XLISTit handover doc wrongly says they are.

### Reuse list
| What | From | How |
|---|---|---|
| Licence logic (activate, validate, deactivate, devices) | `website/lib/licence.ts` | Fork. Remove the ambassador branches. Change the instance-name prefix and plan strings. |
| LS client | `website/lib/lemonsqueezy.ts` | Copy as is. It includes the `fetch` wrap for Workers. |
| Webhook HMAC check | `website/lib/webhook.ts` | Copy, then extend (see the next list). |
| Token signing | `website/lib/token.ts` | Copy with **new prefixes** and a **new key**. |
| Config, rate limiting, error codes | `website/lib/config.ts`, `rate-limit.ts`, `codes.ts` | Copy. |
| Desktop licence client | `src/main/licence/*`, `src/shared/licence*.ts` | Copy for xpost's Electron main process. Change the fingerprint salt and error codes. |
| Test harnesses | `website/test/fake-ls.ts`, `tests/e2e/licence-stack.ts`, `tests/unit/licence-harness.ts` | Copy. They run the real Worker code against a fake LS. |
| Electron shell | `src/main/index.ts` security setup, preload, IPC contract, updater service and card | Copy, then split the 400-line `index.ts`. |
| Discipline | error-code registry, log scrubbing, DB backup before migrations, signed remote config, `no-secrets` test | Copy. |
| UI system | Tailwind `@theme` tokens, utilities, brutalist style | Mirror it with xpost's own logo and colour. |

### "Fix, don't copy" list
1. **One key signs everything** in XLISTit. xpost gets its own keys: one for licence tokens and a separate one for config feeds. Desktop releases get a separate signing identity from XLISTit.
2. **Turn on the `enableCookieEncryption` fuse** from xpost's first release.
3. **Webhook:** make the store check mandatory. Add the `subscription_*` events (cancelled, expired, and so on; confirm the exact names against LS docs in M2). Add an idempotency store.
4. **LS error mapping** relies on matching message text. Prefer status fields where LS provides them.
5. **Deploy from GitHub Actions** with `wrangler deploy` and a scoped API token, not dashboard Git builds. You asked for Actions deploys.
6. **Signed releases from CI**: Apple Developer ID plus Windows signing. Publish to Releases automatically and add a macOS CI job.
7. **Add a per-platform kill switch.** XLISTit only has a global minimum version.
8. **IPC sender check**: use a custom `app://` scheme and an exact-origin check, not `startsWith('file://')`.
9. **Do not copy** the ambassador, sponsors, market prices, tax, eBay or proxy features.
10. Add ESLint. Do not commit `tsbuildinfo`.

---

## B. Platform research tables

### Table 1: access and routes

| | TikTok | Instagram | YouTube | X | Facebook | Snapchat |
|---|---|---|---|---|---|---|
| **Posting API and content** | Content Posting API. Direct Post (`video.publish`) or Upload to inbox (`video.upload`). Video; photo carousel up to 35 images. | Graph API: container, then `media_publish`. Image, Reel, carousel (up to 20), Story. No link posts. | Data API `videos.insert`. Video; Shorts are automatic (3 min or less, vertical or square). No community posts via API (UNVERIFIED). | `POST /2/tweets`. Text, up to 4 images or 1 GIF or 1 video, threads via replies. | Pages API: feed (text, link), photos, video, Reels (`/video_reels`), Page Stories. | Public Profile API: Story (video or image), Spotlight (video), Saved Story. |
| **Access needed** | App review for each scope (demo video, sandbox first). Audit for public Direct Post. | Meta app, App Review (Advanced Access), Business Verification. User needs a professional account. | Cloud project, OAuth verification (sensitive scope assumed, UNVERIFIED). Quota audit for more than 100 uploads/day. | Developer account and app, prepaid credits. No review. | Meta app, App Review, Business Verification. User needs the CREATE_CONTENT task on the Page. | **Allowlist** via a Snap contact. Business Account, and an OAuth app made in Ads Manager. |
| **Unapproved app can** | Sandbox. Direct Post SELF_ONLY for up to 5 users/24 h, private accounts only. | Publish for app-role users only (admins, developers, testers). | **Public uploads** (since 2026-11-02). 100-user cap and warning screen until verified. | Everything, subject to cost and rate limits. | Publish to Pages for app-role users only. | Nothing for posting. Read-only public endpoints only. |
| **Unapproved app cannot** | Post publicly; serve real users at scale. | Serve real users. | Exceed 100 uploads/day for the whole project. | n/a | Serve real users. Post to profiles or groups (ever). | Post at all. |
| **Draft / share / intent route** | **Inbox draft** (Upload mode). The user posts in TikTok. Share Kit is mobile SDK only. | None on the web (UNVERIFIED negative). On phones, the Web Share API sheet goes to the IG app. No API drafts. | No intent (UNVERIFIED negative). Closest: upload as **private** or with `publishAt`; the user publishes in Studio. | **Web intent** `x.com/intent/tweet` (text and links, free, no media). | **Share Dialog** (`facebook.com/dialog/share`): links only, profile, new `hashtag` param. API drafts: Reel `video_state=DRAFT`, feed `published=false`. | **Share link** `snapchat.com/share?link=` or Creative Kit Web button: URLs only, no review. |
| **Web upload page** | `tiktok.com/tiktokstudio` then Upload (`/tiktokstudio/upload` UNVERIFIED) | `instagram.com` (Create); `business.facebook.com` | `studio.youtube.com` then Create | `x.com/compose/post` (path UNVERIFIED) or `x.com/home` | `facebook.com`; Business Suite (deep link UNVERIFIED) | `my.snapchat.com`, `profile.snapchat.com`, `snapchat.com/spotlight` |
| **Sign-in in an app window** | No official statement (UNVERIFIED). Desktop OAuth must use the system browser. | FB Login blocked in embedded browsers; App Review rejects it. IG web sign-in UNVERIFIED. | **Blocked.** OAuth policy plus the embedded-framework block since 2019. | UNVERIFIED. Passkeys reported to hang; Google SSO is blocked. | **Blocked** in embedded browsers; rejected in review. | UNVERIFIED. |
| **Terms on automation** | Global ToS bans "automated scripts to… interact with the Services". | Meta ADC [DIRECT]: APIs are the only allowed means; scripting actions is banned. | ToS bans "automated means". Developer Policies ban scraping. | Automation Rules ban "scripting the X website". Guidelines: permanent suspension. | Same as Instagram (Meta ADC, ToU 3.2.3). | ToS bans "automated or semi-automated means" and unapproved third-party apps. |
| **Media ingest** | Video: FILE_UPLOAD chunks (5–64 MB, last up to 128 MB) **or** PULL_FROM_URL (verified domain, https, no redirects, 1 h timeout). Photos: **pull only**. | IG Login: **pull only** (`video_url` / `image_url`, public HTTPS). FB Login for Business: resumable push to `rupload.facebook.com`. | **Push only.** Resumable upload, chunks in multiples of 256 KB. | **Push only.** Chunked INITIALIZE, APPEND (5 MB or less), FINALIZE, STATUS. | Reels: push to `rupload` or a `file_url` header. Page video: resumable handle or `file_url`. Photos: `url` or upload. | **Push only.** Client-side AES-256-CBC, chunks up to 32 MB, up to 1 GB, media expires after 24 h. |

### Table 2: limits, tokens and review demands

| | TikTok | Instagram | YouTube | X | Facebook | Snapchat |
|---|---|---|---|---|---|---|
| **Media limits** | MP4/WebM/MOV; H.264, H.265, VP8, VP9; max 4 GB; 23–60 fps; 360–4096 px; duration from `max_video_post_duration_sec` (3, 5 or 10 min). Photos: JPEG or WebP, 1080p or less, 20 MB, up to 35. | Image: JPEG only, 8 MB, 4:5 to 1.91:1, width 320–1440. Reel: MOV/MP4 with moov atom first, H.264/HEVC, 23–60 fps, 3 s–15 min, **300 MB**. Story video: 3–60 s, 100 MB. | Max 256 GB. 15 min unless the channel is verified (12 h is UNVERIFIED). Shorts: 3 min or less. | Image 5 MB; GIF 15 MB; video 20 min / 8 GB (Premium: 125 min / 16 GB). | Reels: 9:16, min 540x960, 24–60 fps, **3–90 s**. Reels file size UNVERIFIED (500 MB per third parties). Page video 10 GB / 240 min UNVERIFIED. | API: MP4, 5–300 s, up to 1 GB; images on Stories. Captions/links may force 9:16. Web uploader: 5–60 s, at least 540x960. |
| **Caption limits** | Video caption 2,200 UTF-16 runes. Photo title 90, description 4,000. | 2,200 chars, 30 hashtags, 20 @ tags. Up to 3 collaborators. Alt text 1,000. | Title 100 chars (no `<` or `>`). Description 5,000 **bytes**. Tags 500 chars total. You may not set shorter limits (RMF). | 280 weighted chars (URL counts as 23; emoji and CJK count 2). Premium: 25,000. | Post text about 63,206 (UNVERIFIED). | Spotlight description 160 chars. Story/Spotlight caption 1–250 chars, Latin/Greek/Cyrillic, no emoji. Link sticker text 40. |
| **Rate limits / caps** | 6 req/min per user token on init. About **15 posts/day per creator** (Direct Post, shared across all apps). **5 pending drafts/24 h**. Active-creator cap set at audit. | **50** posts/24 h (docs also say 100; read live). 400 containers/24 h. BUC limits (header `X-Business-Use-Case-Usage`). | **100 uploads/day per project** (all users). 10,000 units/day for other calls. Unpublished per-channel daily limit. | `POST /2/tweets`: 100/15 min per user, 10,000/24 h per app. Media INIT/APPEND/FINALIZE: 1,875/15 min per user; STATUS: 1,000/15 min. | Reels: **30 per Page per 24 h**. BUC limits. | Not documented (UNVERIFIED). |
| **Token lifetimes** | Access 2 h; refresh 180 d, **rotates** [LIVE]. Auth code 5 min, single use. | IG Login: short 1 h; long-lived 60 d, refresh after 24 h. Unified Login: set by config. | Access about 1 h. Refresh long-lived in Production; **7 days in Testing**. | Access 2 h; refresh with `offline.access`, single use, **rotates**. | User short-lived 1–2 h; long-lived about 60 d; Page token "at least 60 days". | Access 1 h; refresh token issued. Auth code 10 min. |
| **OAuth / PKCE** | Web: server-side secret exchange; redirect URIs https, static, no query, up to 10. Desktop: PKCE required, loopback. | IG Login: **no PKCE**, server-side secret exchange, exact redirect match. | PKCE supported ("Always use PKCE" for desktop). Loopback for desktop. | PKCE required (public or confidential). Exact callback match. | PKCE supported but marked "still in testing"; Strict Mode exact redirects. | Secret exchange; PKCE not mentioned (UNVERIFIED). |
| **Approval UX demands** | creator_info query first; show nickname and avatar; privacy dropdown with **no default**; Comment/Duet/Stitch off by default; commercial disclosure; music-usage consent; preview; send only after explicit consent. | One screencast per permission; visible branded login button; consent before publishing; captions editable. | Show and link YouTube ToS and Google Privacy Policy; easy revoke; delete data within 30 days of revoke; title and privacy picker required. | Express consent per user; show exactly what will post; no identical posts across multiple accounts. | Same as Instagram, plus privacy policy, terms and a data-deletion callback. | Describe intended use to your Snap contact. Web uploader asks for Creator Terms per post (API requirement UNVERIFIED). |

---

## C. Cloudflare limits and hosting

Source: `research/cloudflare_bridges.md` (read from Cloudflare's official docs repo, current to 2026-11-04).

| Service | Key limits (Workers Paid) | What it means for xpost |
|---|---|---|
| **Inbound request body** | Set by the zone plan: Free/Pro 100 MB, Business 200 MB. | **Never send video through a Worker.** Browsers upload straight to R2. |
| **Worker memory** | 128 MB per isolate (shared). | Stream everything. Never buffer a whole video. |
| **Worker CPU** | 30 s default, up to 5 min per request. I/O wait is not CPU. | Streaming R2 → platform costs little CPU. |
| **Worker wall time** | HTTP: unlimited while connected; `waitUntil` +30 s. Cron: 15 min. Queue consumer: 15 min. | Long work goes in Workflows. |
| **Subrequests** | 10,000 default (configurable). | Enough for chunked uploads. |
| **Outbound body** | 100 MiB per request is documented for Durable Objects and Containers. Not documented for Workers/Workflows (UNVERIFIED). | **Use chunks of 100 MiB or less everywhere.** |
| **Workflows** | Step CPU 30 s–5 min; step wall time unlimited; 10,000 steps per instance; step result 1 MiB; `sleepUntil` up to 365 days; 50,000 concurrent running (sleeping ones don't count); create 100/s per Workflow; custom IDs dedupe; retained 7–30 days. | One instance per target. ID-based dedupe. Durable retries and polling. |
| **Workflows pricing** | 500,000 steps/month included, then $0.80 per 100k. 1 GB-month storage included. | $0 at MVP scale. |
| **R2 multipart** | Parts 5 MiB–5 GiB, up to 10,000 parts, all parts except the last the same size. Incomplete uploads aborted after 7 days. Presigned URLs: 1 s–7 days, **S3 endpoint only (not custom domains)**, no POST forms. CORS must expose `ETag`. | Worker signs one presigned PUT per part. Fixed part size (10 MiB proposed). |
| **R2 pricing** | $0.015/GB-month; Class A $4.50/M; Class B $0.36/M; **egress free**. Free tier: 10 GB-month, 1M A, 10M B. Lifecycle rules by prefix. | Cheap. Lifecycle rule as a backstop for deletion. |
| **D1** | 10 GB per database; 1,000 queries per invocation; 30 s per query; 2 MB per row; 100 bound params; 30-day Time Travel. Paid: 25B reads and 50M writes per month included. | One database is fine. Tokens fit easily. |
| **Queues** | 128 KB messages; 5,000 msg/s; up to 100 retries; DLQ; delay up to 24 h; $0.40/M ops. | Not needed for scheduling (section D). |
| **Cron** | UTC; finest is every minute; changes take **up to 15 min** to propagate and runs can be missed. | The sweep looks back for overdue rows. |
| **Durable Objects** | One single-threaded object per key; 100 MiB outbound body. | Per-account lock and token bucket. |
| **Rate Limiting binding** | 10 s or 60 s periods, per location, **approximate**. | Coarse abuse protection only. Use a DO or D1 counter where precision matters. |
| **Email Service (Beta)** | Workers Paid; 3,000/month included, then $0.35 per 1,000. Needs an onboarded sending domain. | Optional email codes and reminders. **Needs the domain.** |

### Hosting recommendation
- **Use Workers with Static Assets, not Pages.** Cloudflare says: "Start new projects with Workers" (https://developers.cloudflare.com/pages/).
- One Worker serves the React SPA (`not_found_handling: "single-page-application"`) and the API. Static asset requests are free.
- The same Worker holds the cron handler, the Workflow classes and the Durable Object.
- Deploy with GitHub Actions (`wrangler deploy`). Use `xpost.<account>.workers.dev` for M1–M4. The domain is one config value (`APP_ORIGIN`).
- **Workers Paid ($5/month) is required.** The Free plan's 10 ms CPU and 3,000 Workflow steps a day do not work for the sweep.

---

## D. Architecture

### Components

```
 Phone / browser (React SPA)          Desktop (Electron, same React UI)
   |  HTTPS + httpOnly cookie            |  HTTPS + device token (Ed25519 licence token offline)
   |                                     |  local SQLite cache: drafts readable offline
   v                                     v
 +-------------------------- Cloudflare Worker "xpost" ---------------------------+
 |  Static assets (SPA)   API router   OAuth callbacks   LS webhook   Media route |
 |  Cron: * * * * * sweep;  daily: licence re-validate, token refresh, cleanup     |
 |  Workflow: PublishTarget (one instance per target)                             |
 |  Durable Object: AccountGate (per social account: refresh lock + rate bucket)  |
 +-----+--------------+--------------+---------------+--------------+------------+
       |              |              |               |              |
      D1             R2             KV          Email Service   Web Push
 (source of truth) (media, exports) (config cache)  (optional)    (browser notifications)
       |
       +--> Platform APIs: TikTok, Instagram/Facebook (Graph), YouTube, X, Snapchat
       +--> Lemon Squeezy License API + main API
```

### Request flows

**Sign-in (web)**
1. The user enters their purchase email and licence key.
2. The Worker rate-limits the request: the CF binding for coarse limits, plus a D1 counter per email and per key for strict limits.
3. The Worker calls LS `validate`. It checks status, store, product and variant (forked XLISTit code). It checks the email against the licence's order. Which LS field exposes the email is UNVERIFIED; settle it in M2.
4. **If email codes are on** (recommended, needs the domain): the Worker emails a 6-digit code via Email Service. The user enters it.
5. The Worker creates a `web_sessions` row and sets an httpOnly, Secure, SameSite=Lax cookie holding a random ID. Only the ID's hash is stored.
6. If the licence is over its web-session limit, the oldest session is revoked, or the user picks one to sign out.
7. All unsafe methods need a CSRF token (double-submit) plus an Origin check.

**Desktop activation**
- Same as XLISTit: LS `activate` with a fingerprint in the instance name. The Worker returns an Ed25519 token with xpost prefixes and an xpost key.
- Devices count against the LS activation limit. Settings, Devices lets the user deactivate.
- Offline grace is 7 days, as in XLISTit. Drafts stay readable offline.

**Connect a social account**
1. The client opens `GET /connect/:platform`. On desktop, this opens in the **system browser** and carries a one-time link code.
2. The Worker stores `oauth_states` (state, PKCE verifier encrypted, customer, expiry 10 min) and redirects to the platform.
3. The callback lands on an exact registered HTTPS URL on the Worker. The Worker exchanges the code server-side with the client secret from Worker secrets, and adds PKCE where supported.
4. Tokens are AES-GCM encrypted and stored in `social_accounts`. **Tokens never go to any client.**

**Upload**
1. The client asks `POST /media` with size, type and file name. The Worker creates an R2 multipart upload under an unguessable key: `m/<customerId>/<random 128-bit>`.
2. The client requests presigned PUT URLs for batches of parts, then PUTs 10 MiB parts straight to R2. It keeps the ETags so it can resume.
3. `POST /media/:id/complete` sends the ETags and the Worker completes the upload.
4. The client probes the file in the browser (duration, size, dimensions, codec where readable). The Worker stores the probe.
5. Validation runs against every selected platform's rules. Problems show as plain-English fixes, such as "Instagram Reels must be 15 minutes or shorter. Trim it or untick Instagram." **xpost never changes media without consent.**

**Schedule (and "post now")**
1. Saving writes `posts` and `targets` rows: UTC time plus the user's IANA timezone, status `queued` (automatic) or `waiting_for_you` (manual), and `schedule_version += 1`.
2. "Post now" calls `PUBLISH_WORKFLOW.create({id: "t-<targetId>-v<version>"})` straight away.
3. Editing or cancelling only updates D1 and bumps `schedule_version`. Any old instance will see it is stale and exit.

**Publish (engine)**
1. The cron runs every minute. It selects `queued` targets due in the next 2 minutes, plus overdue ones (look-back). It calls `createBatch` with ID `t-<targetId>-v<version>`. Errors `10405` and `10415` mean the instance already exists, which is fine.
2. Instance step `sleepUntil(scheduledAt)`.
3. Step `recheck`: re-read D1. Exit if the post was cancelled, the version changed, the licence is blocked, or the platform kill switch is on.
4. Step `claim`: a conditional UPDATE to `uploading`. Zero rows changed means exit.
5. Step `token`: refresh through the AccountGate DO if the token is near expiry.
6. Step `quota`: check the platform's caps (section D, rate limits). If a cap is hit, wait in a sleep step or fall back to manual with a reminder.
7. Steps `transfer-<n>`: chunked transfer (section D, media transfer).
8. Step `publish`: see Idempotency.
9. Steps `poll-<n>`: poll the status with `step.sleep` between polls until confirmed. Then store the post ID, URL and visibility, and set status `published`.

**Manual handoff**
1. When the target is due, its status shows "Waiting for you" and a reminder fires.
2. **One-click action:**
   - Desktop browser: copy the caption, download or reveal the file, and open the platform's upload page in a new tab.
   - Phone: `navigator.share({files, text})` opens the OS share sheet. The caption is copied first, because the share sheet may drop it.
3. Status becomes `handed_off`. **It is never marked posted on a guess.** The user pastes the post link (validated per platform) or presses "I posted it", which sets `confirmed_posted`.
4. **Intent variants:** X `x.com/intent/tweet`, the FB Share Dialog, and the Snap share link open prefilled. They follow the same status rules.

**Scheduled TikTok draft**
- This runs through the engine, because it is an API call. Its final status is `draft_sent`, not `published`.
- Then a reminder says "Open TikTok and press Post". The user confirms or pastes the link.

**Reminders**
- When a manual target falls due, the engine writes a `reminders` row.
- Web: Web Push to subscribed browsers. Desktop: OS notification. Email is optional (Email Service).
- Each reminder carries a deep link to the target's one-click action.
- iOS web push may need the app installed to the home screen. This was not covered in the research; check in M3.

**Licence webhook and re-validation**
1. `POST /webhooks/lemonsqueezy`: verify the HMAC (constant time) over the raw body. **Require** the store ID to match.
2. Write `webhook_events` (unique event key) so each event is handled once.
3. On refund, cancellation or expiry, update `licences.status`.
4. A daily cron re-validates active licences with LS. A blocked licence:
   - blocks new posts
   - sets future targets to `paused_licence`
   - shows a banner
   - sends one notification

### Engine choice: your cron → queue → workflow vs the research's cron → workflow

| | Option A: cron → Queue → Workflow (yours) | **Option C: D1 + cron sweep → Workflow (recommended)** |
|---|---|---|
| Duplicate safety | Needs its own dedup | Workflow ID `targetId-vN` dedupes for free |
| Retries and failure state | Queue retries plus a DLQ, **and** Workflow retries | Workflow retries and durable state only |
| Rescheduling | D1 update | D1 update (the instance re-checks) |
| Moving parts | 3 | 2 |
| Scale ceiling | Higher fan-out buffer | 100 creations/s per Workflow = 6,000 targets per sweep minute |
| Cost | Plus about $0.40 per million ops | none extra |

- **Recommendation: Option C.** Add a Queue later only if a sweep must start more than about 100 instances a second.
- Pure "Workflow sleeps from schedule time" (Option B) was rejected. It keeps two copies of the schedule that can drift. Rescheduling means terminate and recreate. And long sleeps resume on whatever code is deployed then (UNVERIFIED how versioning interacts).

### Idempotency (never post twice)
| Step | How it stays safe |
|---|---|
| Start | Workflow ID `t-<targetId>-v<scheduleVersion>`. Duplicate creates fail with 10405. |
| Recheck and claim | Conditional `UPDATE … WHERE status='queued' AND schedule_version=?`. Only one instance wins. |
| Token refresh | TikTok and X refresh tokens **rotate**. Refresh runs inside the AccountGate DO (one at a time per account) and **saves the new token before returning**. |
| Media transfer | Chunks are keyed by offset or segment: YouTube `Content-Range` (resume with `bytes */N`), X `segment_index`, TikTok chunk ranges, Meta `offset`. Re-sending a chunk is harmless. The upload session or container ID is saved to D1 **in the same step that creates it**, and reused on retry (IG containers last 24 h; Snap media 24 h). |
| **Publish call (not idempotent)** | 1) Save `publish_attempted_at` to D1 **before** the call. 2) Make the call in a step with **retries: 0**. 3) On success, save the platform ID (publish_id, media ID, video ID, tweet ID) in the step result **and** in D1. 4) On an unclear failure (timeout, 5xx, dropped connection), **never call again blindly**. Go to reconcile. |
| Reconcile | **TikTok:** fetch status by `publish_id`. **IG:** container `status_code` = PUBLISHED. **YouTube:** query the resumable session (it returns the video once complete). **FB:** check the video or Reel by its ID from the start phase. **X:** no idempotency key was found in the research, so mark `needs_check` and show "Check on X" (optionally one paid read at $0.005). **Snap:** `MEDIA_POSTING_ALREADY_IN_PROGRESS` signals a duplicate. If still unknown, set `needs_check` and ask the user. **Never auto-retry.** |
| Poll | Read-only. Sleep between polls (IG: once a minute, up to 5 min). |
| Retry button | "Retry" on a failed target bumps `schedule_version` and makes a new instance. It is **disabled while status is `needs_check`** until the user confirms the post did not appear. |

### Rate limits, caps and backoff
- **Backoff:** Workflow step retry delay is a function of the error. Honour `Retry-After` and `x-rate-limit-reset`. Errors like "invalid media" throw `NonRetryableError`.
- **Per account:** the AccountGate DO keeps a token bucket. Example: TikTok 6 init calls/min.
- **Daily caps** are kept in D1 `usage_counters`, checked before scheduling (a warning) and before publishing (enforced):
  - TikTok about 15 Direct Posts/day per creator, and 5 pending drafts/24 h
  - IG: read `content_publishing_limit` live, assume 50
  - FB Reels 30 per Page per 24 h
  - **YouTube 100 uploads/day for the whole project**, a global counter. When it runs out, targets switch to "You press Post" with a clear message.
  - X 100/15 min per user, 10,000/24 h per app
- **Per licence:** monthly post quota and **monthly X spend cap** (the `x_cost_ledger` table). Cost per post: $0.015, or $0.20 if the text contains a URL, as of 2026-04-20. Media-upload cost is UNVERIFIED; log it after the first test.

### Media transfer per platform (API mode)
| Platform | Method | Why |
|---|---|---|
| TikTok video | **FILE_UPLOAD**: Workflow streams R2 ranged reads in fixed 50 MiB chunks (`FixedLengthStream`) | No domain needed. The remainder goes in the final chunk, which TikTok allows up to 128 MB, so every chunk stays under our 100 MiB rule (my inference). |
| TikTok photos | **PULL_FROM_URL** from the media route on a **verified domain** | Pull is the only option for photos. Needs the domain (M5). |
| Instagram (IG Login) | **Pull** `video_url` / `image_url` from the media route | IG Login has no resumable upload. No domain verification is documented (UNVERIFIED). |
| Instagram (FB Login for Business, if chosen) | Resumable push to `rupload.facebook.com` | Push avoids exposing a URL. |
| YouTube | **Resumable upload**, chunks a multiple of 256 KB and no more than 100 MiB, streamed from R2 | There is no pull option. |
| Facebook | Reels: `rupload` push in chunks. Page video: resumable handle. Photos: `url` pull from the media route. | Push where available. |
| X | Chunked APPEND, 5 MB segments from R2 | Push only. |
| Snapchat | Encrypt AES-256-CBC, upload parts of 32 MB or less | Push only. Streaming CBC in Workers needs a spike: Web Crypto pads each call, so chaining across chunks may need a hand-written CBC (my inference). |

**Media route:** `https://media.<domain>/m/<token>/<name>`
- `token` = HMAC(mediaId, targetId, expiry).
- The Worker streams from the R2 binding and supports Range requests. It sends **no redirects**.
- Expiry: TikTok at least 1 h plus margin (2 h proposed); Meta 30 min.
- On a verified domain this meets TikTok's rules. Presigned R2 URLs cannot, because they only work on `*.r2.cloudflarestorage.com`, which you cannot verify.
- Whether TikTok accepts a token inside a verified prefix: path tokens are proposed because query-string handling is UNVERIFIED.

**Retention:** `MEDIA_RETENTION_DAYS` config (7 proposed). The file is deleted when all its targets are final **and** the window has passed. The R2 lifecycle rule (retention + 7 days) is a backstop.

### D1 data model (key columns)

All times are stored as UTC epoch milliseconds. IDs are random (ULID or 128-bit).

| Table | Key columns | Indexes / notes |
|---|---|---|
| `licences` | id, ls_key_hash, ls_key_id, ls_order_id, product_id, variant_id, plan, **status** (`active`, `expired`, `disabled`, `refunded`, `cancelled`), expires_at, last_validated_at | unique(ls_key_hash) |
| `customers` | id, licence_id, email, created_at, deleted_at | unique(email) |
| `plan_limits` | plan, monthly_posts, monthly_x_spend_cents, max_social_accounts, max_web_sessions, max_devices, email_reminders | Editable without a release |
| `web_sessions` | id_hash, customer_id, created_at, last_seen_at, expires_at, label, revoked_at | idx(customer_id, revoked_at) |
| `login_codes` | id, email_hash, code_hash, expires_at, attempts | Delete after use |
| `auth_counters` | key (email/key/IP hash), window_start, count | Strict sign-in limits |
| `devices` | id, customer_id, ls_instance_id, fingerprint_hash, label, activated_at, last_seen_at, deactivated_at | |
| `social_accounts` | id, customer_id, platform, platform_user_id, display_name, avatar_url, account_kind (IG business/creator, FB page…), **status** (`connected`, `expiring`, `needs_reauth`, `disconnected`), scopes, token_ct, refresh_ct, iv, **key_version**, access_expires_at, refresh_expires_at, last_refresh_at | unique(customer_id, platform, platform_user_id); idx(status, access_expires_at) |
| `oauth_states` | state, customer_id, platform, pkce_verifier_ct, client_kind (web/desktop), link_code, expires_at | TTL 10 min |
| `media` | id, customer_id, r2_key, size, mime, duration_ms, width, height, fps, vcodec, acodec, **status** (`uploading`, `ready`, `deleted`), multipart_upload_id, delete_after | idx(status, delete_after) |
| `posts` | id, customer_id, title, master_caption, master_fields_json, **status** (`draft`, `scheduled`, `in_progress`, `done`, `partial`, `failed`, `cancelled`), scheduled_at, timezone, created_at, updated_at, deleted_at | idx(customer_id, status, scheduled_at) |
| `post_media` | post_id, media_id, position | pk(post_id, position) |
| `targets` | id, post_id, social_account_id, platform, **mode** (`api`, `draft`, `intent`, `handoff`), override_json (caption, title, privacy, toggles…), **status**, schedule_version, scheduled_at, workflow_id, platform_ref (publish_id / container / session / video ID), publish_attempted_at, platform_post_id, post_url, **visibility** (`public`, `private`, `unlisted`, `self_only`, `friends`, `unknown`), confirmed_by (`api`, `user_link`, `user_confirm`), attempts, last_error_code, last_error_text, published_at | idx(status, scheduled_at) for the sweep; idx(post_id); idx(social_account_id, status); unique(post_id, social_account_id) |
| `target_events` | id, target_id, at, from_status, to_status, code | History and audit |
| `reminders` | id, target_id, channel (`push`, `desktop`, `email`), due_at, sent_at, status | idx(status, due_at) |
| `push_subscriptions` | id, customer_id, endpoint, keys_ct, created_at | |
| `usage_counters` | scope (`account`, `project`, `licence`), scope_id, platform, window_start, count | pk(scope, scope_id, platform, window_start) |
| `x_cost_ledger` | id, licence_id, target_id, kind (`post`, `post_url`, `read`, `media`), micro_usd, at | idx(licence_id, at) |
| `platform_status` | platform, mode, available, **approval** (`not_applied`, `pending`, `approved`, `rejected`), default_mode, **kill_switch**, message, updated_at | Remote config |
| `remote_config` | key, value_json, updated_at | e.g. min desktop version, global kill |
| `webhook_events` | event_key, type, received_at, processed_at | unique(event_key) |
| `data_exports` | id, customer_id, status, r2_key, expires_at | |

**Target status enums**
- **Automatic:** `queued`, `uploading`, `processing`, `published`, `failed`, `needs_check`, `cancelled`, `paused_licence`
- **Manual:** `waiting_for_you`, `draft_sent` (TikTok), `handed_off`, `confirmed_posted`, `skipped`

**UI mode labels** shown on every target:
- "Automatic" (API)
- "Draft in TikTok" (TikTok inbox draft)
- "You press Post" (intent and handoff)

**Feature coverage**
- **Drafts:** `posts.status='draft'`. Autosave is a PATCH with an `updated_at` check. Duplicate copies the post and its targets.
- **Filters:** by status, platform, account and date, using the indexes above.
- **Export:** a JSON + CSV zip to R2, delivered as a short-lived link.
- **Delete data:** revoke platform tokens where an API exists, delete rows and R2 objects, and keep only the licence record LS needs. This also meets YouTube's "delete within 30 days of revoke".
- **Disconnect** revokes and deletes tokens.

### Config, remote config and kill switches
- **Static config** (Worker vars): `APP_ORIGIN`, `MEDIA_ORIGIN`, `MEDIA_RETENTION_DAYS`, LS IDs. **Secrets:** platform client secrets, `TOKEN_KEY_V1…`, LS API key, webhook secret, licence signing key, config-feed signing key, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (for presigned part URLs), `VAPID_PRIVATE_KEY` (web push).
- **Remote config:** the `platform_status` and `remote_config` tables in D1, cached about 60 s in Worker memory or KV. You change modes and defaults **without a release**.
- **Kill switches:**
  - global "pause all automatic posting"
  - per platform
  - per platform + mode
  - minimum desktop version
- A switched-off target becomes "You press Post" with a message. It is never silently dropped.
- **Desktop** gets the same config as a signed feed (Ed25519, its own key), as XLISTit does.

### Security checklist
- **Token encryption:** AES-GCM with a fresh IV per write. Keys live in Worker secrets with a `key_version` column, and a re-encrypt job runs on rotation.
- **OAuth:** `state` on every flow. PKCE where supported (YouTube, X, FB). **Server-side secret exchange for TikTok, IG Login and Snapchat.** Desktop uses the same Worker web flow in the system browser. Exact redirect URLs.
- **Web:** httpOnly + Secure cookies, CSRF token + Origin check, and an ownership check (`customer_id`) on every query.
- **Media:** unguessable R2 keys, short-lived presigned and media-route URLs, and CORS limited to `APP_ORIGIN`.
- **Rate limits:** on sign-in, codes and licence checks. The CF binding is coarse; D1/DO counters handle strict limits.
- **Logs:** platform, endpoint, status and error code only. No tokens, captions or emails. Reuse XLISTit's scrubber.
- **Repo:** no secrets. Copy XLISTit's `no-secrets` test.
- **Desktop:** `enableCookieEncryption` fuse on. Separate code-signing and licence keys from XLISTit. All OAuth runs in the system browser. The desktop never holds platform tokens.

### Adapter interface (sketch)

```ts
export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'x' | 'facebook' | 'snapchat' | 'fake';
export type Mode = 'api' | 'draft' | 'intent' | 'handoff';           // 'assisted' intentionally absent
// Rule: modes.draft.supported is true only for TikTok (the only manual mode allowed on a schedule).
export type Approval = 'not_applied' | 'pending' | 'approved' | 'rejected' | 'not_needed';

export interface AdapterConfig {
  platform: Platform;
  modes: Record<Mode, { supported: boolean; needsApproval: Approval; label: string }>;
  defaultMode: Mode;                       // overridable by remote config
  content: { video: boolean; image: boolean; carousel?: number; text: boolean; link: boolean; story?: boolean };
  limits: MediaRules & CaptionRules & { dailyPerAccount?: number; dailyPerProject?: number; perMinute?: number };
  transfer: 'push_chunked' | 'pull_url' | 'either';
  maxChunkBytes: number;                   // always <= 100 MiB
  oauth: { pkce: boolean; scopes: string[]; refreshRotates: boolean };
  uploadPageUrl: string;                   // handoff target
}

export interface PlatformAdapter {
  readonly config: AdapterConfig;

  connect: {
    authorizeUrl(ctx: Ctx, a: { state: string; codeChallenge?: string; redirectUri: string }): URL;
    exchange(ctx: Ctx, a: { code: string; codeVerifier?: string; redirectUri: string }): Promise<ConnectedAccount>;
  };
  refreshToken(ctx: Ctx, acct: AccountSecrets): Promise<TokenSet>;          // caller persists before use
  validate(target: TargetDraft, media: MediaProbe[], acct: AccountInfo): ValidationIssue[]; // plain-English fixes

  /** Resumable and idempotent per chunk. Returns refs to persist (session URI, container ID…). */
  transferMedia(ctx: Ctx, t: TransferInput, resume?: PlatformRef): AsyncIterable<TransferProgress>;

  /** NOT idempotent. Called once per attempt with retries: 0. 'unknown' => reconcile, never retry. */
  publish(ctx: Ctx, t: PublishInput): Promise<
    | { kind: 'accepted'; ref: PlatformRef }
    | { kind: 'rejected'; code: string; retryable: boolean; retryAfterMs?: number }
    | { kind: 'unknown'; ref?: PlatformRef }>;

  getStatus(ctx: Ctx, ref: PlatformRef): Promise<
    | { state: 'processing' }
    | { state: 'published' | 'draft_sent'; postId?: string; url?: string; visibility: Visibility }
    | { state: 'failed'; code: string }
    | { state: 'unknown' }>;

  disconnect(ctx: Ctx, acct: AccountSecrets): Promise<void>;                 // revoke where supported

  manual: {
    intentUrl?(t: PublishInput): string;                                     // X intent, FB Share Dialog, Snap share
    handoff(t: PublishInput): { openUrl: string; caption: string; fileName: string; webShare: boolean };
    parsePostUrl(url: string): { postId: string } | null;                    // validates pasted links
  };
}
```

- **A 7th platform** = a new adapter file + an `AdapterConfig` + a `platform_status` row.
- **Fake adapter** (`platform: 'fake'`): configurable latency, failures (429, 5xx, timeout before and after the publish call, processing failure) and `unknown` outcomes. It drives the engine tests and the demo.
- **Tests:** every real adapter gets mocked-response tests for success, 401 → refresh, 429 + Retry-After, 5xx, timeout, malformed response and cap reached.

---

## E. Posting modes per platform

**Assisted fill is excluded for all six platforms.** The terms forbid it everywhere, and sign-in is blocked on Google and Meta. See the last column.

| Platform | Available now (no approval) | After approval | Default mode | Why | Assisted fill |
|---|---|---|---|---|---|
| **TikTok** | Handoff (TikTok Studio / Web Share). Sandbox for testing. | After `video.upload` review: **Draft in TikTok**, schedulable. After the audit: Automatic (Direct Post). | **Draft in TikTok** once approved; handoff until then | No audit needed. The user presses Post in TikTok. 5 pending drafts/24 h. | **No.** Global ToS bans scripts that interact with the service. Embedded sign-in UNVERIFIED. |
| **Instagram** | Handoff (`instagram.com` / Web Share to the IG app). Automatic for app-role testers only. | Automatic for professional accounts (App Review + Business Verification). | **Automatic** for pro accounts; **handoff** for personal accounts | Personal accounts have no API. No web intent exists. | **No.** Meta ADC bans scripting actions; Meta has sued posting-automation tools. |
| **YouTube** | **Automatic** (public allowed since 2026-11-02), up to 100 uploads/day for the project; 100-user cap until verified. Handoff (Studio). | OAuth verification removes the user cap. The quota audit raises 100/day. | **Automatic**; handoff when the daily quota is used up. Option: "upload private, publish in Studio", sent only when the user presses Send now, never on a schedule. | Only real automatic route that needs no approval besides X. | **No.** Google blocks embedded sign-in; ToS bans automated access. |
| **X** | **Automatic** (paid per post). **Intent** (free, text and links). Handoff for media without the API. | n/a (no review) | **Automatic** within the licence's X cap. For link posts, recommend the **intent** default (decision I-2). | API cost is $0.015, or $0.20 with a link. | **No.** "Scripting the X website" is banned (permanent suspension). |
| **Facebook** | Share Dialog (links, profile). Handoff. Automatic for app-role users only. | Automatic for **Pages**. (Meta's API draft is not offered as a scheduled mode.) | **Automatic** for Pages; **Share Dialog / handoff** for profiles | The API cannot post to profiles or groups. | **No.** Same Meta terms; embedded login blocked. |
| **Snapchat** | Handoff (`my.snapchat.com` / `profile.snapchat.com` / Web Share). Share link for URLs. | After **allowlist**: Automatic for Public Profile admins. Spotlight shows "Submitted" until Snap reviews it. | **Handoff** | Allowlist access depends on a Snap contact, so it is uncertain. | **No.** ToS bans "automated or semi-automated means". |

**Rules in every manual mode**
- A person presses Post every time.
- Only TikTok drafts are sent on a schedule. Other manual targets become reminders with a one-click action.
- No server-side browser automation. No social passwords or cookies on the server.
- No CAPTCHA bypass, fingerprint spoofing, stealth, proxies or private endpoints.

---

## F. Cost per 1,000 posts

### Assumptions (all mine; adjust as needed)
- **1,000 posts.** Each post has one **50 MB** video and goes to **3 targets on average** (3,000 targets).
- **Platform mix:** TikTok 700 (draft API), Instagram 700, YouTube 500, Facebook 400, X 500 (all API), Snapchat 200 (handoff). That makes **2,800 API-mode targets and 200 manual**.
- **Retention:** 7 days.
- **Worker requests:** about 200 per post (UI, autosave, part signing, status).
- **CPU:** 5 ms per request; about 500 ms per API target's Workflow.
- **Workflow steps:** 15 per API target; 3 per manual target.
- **R2 parts:** 10 MiB browser parts, so 7 Class A operations per file. About 10 Class B reads per API target.
- **D1:** about 100 rows written and 10,000 rows read per post (indexes included).
- Prices are list prices from the Cloudflare docs, **before** included allowances (worst case).

### Cloudflare (variable)
| Item | Quantity | Unit price | Cost |
|---|---|---|---|
| Workers requests | ~0.2 M | $0.30 / M | $0.06 |
| Workers CPU | ~2.4 M CPU-ms | $0.02 / M | $0.05 |
| Workflow steps | ~42,600 | $0.80 / 100k | $0.34 |
| Workflow storage | small | 1 GB-month included | ~$0.00 |
| D1 writes / reads | 0.1 M / 10 M rows | $1.00 / M; $0.001 / M | $0.10 + $0.01 |
| R2 storage | 50 GB × 7/30 month = 11.7 GB-month | $0.015 / GB-month | $0.18 |
| R2 Class A | ~7,000 | $4.50 / M | $0.03 |
| R2 Class B | ~28,000 | $0.36 / M | $0.01 |
| R2 egress (platform pulls) | — | free | $0.00 |
| **Subtotal** | | | **≈ $0.78** |
| Queue (only if kept, option A) | ~9,000 ops | $0.40 / M | ≈ $0.004 |
| Email reminders (optional) | ~900 (manual + TikTok drafts) | 3,000/month free, then $0.35 / 1,000 | $0 – $0.32 |

**Fixed: Workers Paid base $5/month.** It includes 10M requests, 30M CPU-ms, 500k Workflow steps, 25B D1 reads and 50M D1 writes. **At 1,000 posts/month, the $5 base covers everything above** except about 1.7 GB-month of R2 above the 10 GB free tier (≈ $0.03).

### Paid APIs
| Item | Per 1,000 X posts | In the mix above (500 X posts) |
|---|---|---|
| X post, no URL | $15.00 | $7.50 |
| X post, with URL | $200.00 | $100.00 |
| X media upload | **UNVERIFIED.** A forum reports it billed as PostCreate; if so, up to +$15.00 | up to +$7.50 |
| X `users/me` | $0.010 once per connected account (deduped per day) | — |
| TikTok, Instagram, Facebook, YouTube | No paid tier found | $0 |
| Snapchat | No fee found (UNVERIFIED that it is free) | $0 |

**Bottom line:** X is the only real variable cost. Cloudflare usage is **≈ $0.78 per 1,000 posts** at list price. At 1,000 posts/month the $5 base absorbs all but ≈ $0.03. The YouTube share (500 uploads) only works if it stays at 100 or fewer per day across all users.

---

## G. Hosted posting API ("bridge") comparison

**All vendor figures come from search summaries. None were confirmed against live pricing pages.** No vendor site could be fetched. This is **not a recommendation to adopt. Any bridge needs your go-ahead.**

| Provider | TikTok | IG | YT | X | FB | Snap | Pricing (reported) | Resale / white-label | Trade-offs |
|---|---|---|---|---|---|---|---|---|---|
| Ayrshare | Yes (UNVERIFIED) | Yes | Yes | Yes | Yes | **Yes** | Launch $299/mo (10 profiles); Business $599/mo (30), then ~$8.99 → $2.49 per profile | **Productised** "User Profiles" for platforms; white-label connect page | Highest entry cost; holds the tokens; you indemnify for user content |
| Zernio (ex-Late) | Yes (public via its Business app; shared cap on developer lane) | Yes | Yes | Yes | Yes | No (pending Snap) | Per account: 2 free, then $6 → $1 | Terms not found | Cheapest per account; shared TikTok cap |
| Upload-Post | Yes (own app) | Yes | Yes | Yes | Yes | No | Professional $50/mo (25 profiles, white label) … Business $438 (225) | White label from Professional; customer connections reportedly allowed (UNVERIFIED) | Cheap white label |
| bundle.social | Yes | Yes | Likely | Yes (X cost passed through) | Yes | **Yes** | Per post: Pro $100/mo (10k posts); Business $400 (100k) | UNVERIFIED | Per-post pricing suits many light users |
| Outstand | Yes | Yes | Yes | Yes | Yes | No | $19/mo for 3,000 posts, then $0.007 → $0.005 per post | UNVERIFIED | Its "Managed Keys" cover only 8 of 12 networks |
| Postproxy | Yes | Yes | Yes | Yes (20/account/24 h reported) | Yes | No | Business $49/mo per profile group | UNVERIFIED | Low X cap |
| Blotato | Yes | Yes | Yes | Yes | Yes | No | $29 – $499/mo | Not found | Built for creators and agencies |
| Postiz | Yes (self-host = your own audit) | Yes | Yes | Yes | Yes | No | Cloud ~$29 – $99/mo; self-host free (AGPL) | Unclear | Self-host gives no approval shortcut |
| Publer / Buffer | Yes | Yes | Yes | Yes | Yes | No | Per account / channel | Not designed for it (Buffer reportedly forbids it) | Not viable for multi-tenant |

**What any bridge means for xpost**
- Users see the **bridge's app name** on the TikTok, Google and Meta consent screens.
- The bridge holds users' tokens. Users must reconnect if you leave it.
- If the bridge's app is revoked, every customer is affected at once.
- The bridge is an extra data processor, which must go in the privacy policy.
- It does **not** change the X bill (bundle.social passes X cost through).
- **Main upside:** immediate TikTok public posting and Snapchat (Ayrshare, bundle.social) without your own audit or allowlist.
- The bridge report's YouTube argument is **out of date**: YouTube no longer locks unaudited uploads to private.

---

## H. What I need from you

Lead times are **not in the research** unless stated. "Weeks" is my assumption. Start the slow ones at M1.

| # | Item | Needed by | Lead time | Notes |
|---|---|---|---|---|
| 1 | **Cloudflare Workers Paid** ($5/mo), plus an API token for GitHub Actions (Workers, D1, R2, Workflows edit), **plus an R2 S3 API token** (Access Key ID + Secret, scoped to the xpost bucket) as Worker secrets | M1 | Minutes | Free plan cannot run the engine. |
| 2 | **GitHub repo** (one repo: `/web`, `/worker`, `/desktop`, `/shared`) + a public releases repo for the updater, and Actions secrets | M1 | Minutes | |
| 3 | **Lemon Squeezy**: new xpost product and variants, store ID, product and variant IDs, API key, webhook secret, webhook URL set to the Worker | M1 | Hours | Plan names, prices, session and device limits per plan. |
| 4 | **Domain** (recommend Cloudflare Registrar) | **M1 (recommended)**; M5 at the latest | Hours, then DNS | Unlocks email codes, Google/Meta verification and the TikTok media domain. |
| 5 | Public **privacy policy, terms and data-deletion page** on the domain | M5–M6 | Days (writing) | Needed by Google, Meta and TikTok review. |
| 6 | **X developer account**, app, credits (+ $20 incentive), spending limit | M5 (X is first) | Same day | Callback URL is the Worker. |
| 7 | **Google Cloud project**, OAuth consent screen, YouTube Data API; then **OAuth verification** and the **YouTube Audit and Quota Extension Form** | M5 (submit early) | Weeks (assumption) | Verification needs a verified domain homepage and a demo video. |
| 8 | **TikTok developer app** (Login Kit + Content Posting), sandbox, `video.upload` review; later the **Direct Post audit** | M5 | Weeks (assumption) | Demo video required. Verify the media domain (DNS TXT). |
| 9 | **Meta Business** app; **Business Verification**; App Review screencasts for each permission | M5 (Meta adapters); verification started at M1 | Weeks (assumption) | Start Business Verification at M1. Needs company documents (Assumption). |
| 10 | **Snap Business Account**, OAuth app in **Ads Manager**, and a **Snap contact** for the allowlist | M5 (last adapter) | Unknown (depends on Snap) | Without a contact, Snapchat stays handoff only. |
| 11 | **Apple Developer Program** (fee not researched; Assumption: ~$99/yr), Developer ID cert, notarytool API key | M7 | Days | Needed for Mac auto-update. |
| 12 | **Windows signing**: Azure Trusted Signing (recommended) or an OV/EV certificate | M7 | Days to weeks | Prices not researched. |
| 13 | Support email address and brand assets (logo, colour) | M2 | — | |
| 14 | Decisions in section I | Before M1 | — | |

---

## I. Decisions for you (with my recommendation)

1. **Bring-your-own X keys.** X's terms forbid it. Its Developer Policy says you may not use "API keys or other access credentials owned by others" or ask users for their consumer key.
   - **Recommend:** one xpost-owned X app, OAuth per user, and a **monthly X spend cap per licence**.
2. **X cost and link posts.**
   - **Recommend:** each plan includes N automatic X posts a month.
   - Posts **with links** default to "You press Post" (free intent), with an opt-in to send automatically at $0.20.
   - Show the cost before sending.
3. **Assisted fill (M8).** Forbidden or blocked on all six platforms.
   - **Recommend: do not build M8.** Put the time into handoff polish.
4. **Stronger sign-in.**
   - **Recommend:** licence key + purchase email + **emailed 6-digit code** (Email Service, about $0.35 per 1,000 after 3,000 free each month). It needs the domain.
   - Add passkeys later as an optional upgrade (free, no email).
   - Until the domain exists, use key + email only, plus strict rate limits.
5. **Queue in the engine.**
   - **Recommend: no Queue** (option C). Revisit above about 100 instance starts a second.
6. **Domain timing.**
   - **Recommend: buy it now** at Cloudflare Registrar. Keep workers.dev for dev and preview.
7. **Instagram login type.**
   - **Recommend:** Instagram Login (no Page, no portfolio) for creators, plus Facebook Login for Business for Pages, both in **one Meta app**.
   - Add Unified Login later for business users.
8. **Bridge or not.**
   - **Recommend: no bridge now.** Revisit only if TikTok's audit or Snap's allowlist stalls after launch. Needs your go-ahead either way.
9. **Signing budget.**
   - **Recommend:** Apple (Assumption: ~$99/yr) and Azure Trusted Signing at M7. Without them, Mac users cannot auto-update (as in XLISTit).
10. **TikTok audit.**
    - **Recommend:** launch with "Draft in TikTok". Apply for the Direct Post audit once real usage exists, but build the required posting UX from day one.
11. **YouTube quota.**
    - **Recommend:** file the quota extension at M5. Show a "YouTube daily limit reached → You press Post" fallback.
12. **Default limits.**
    - **Recommend** (assumptions; tune per plan): 3 web sessions, 2 desktop devices, 7-day media retention, 7-day desktop offline grace.
13. **Email reminders.**
    - **Recommend:** off by default, available per user.
14. **Facebook `publish_video` scope.**
    - **Recommend:** request it only if Page video fails without it. Meta's docs conflict.

---

## J. Risks and open UNVERIFIED items

| # | Risk / unknown | Impact | How to settle |
|---|---|---|---|
| 1 | TikTok Photo reference says unaudited content is private; does that apply to inbox drafts? | Draft mode could be weaker than expected | Sandbox test in M5. |
| 2 | TikTok and Meta approvals can be refused or slow | Automatic posting delayed | Apply early. Handoff works from day one. |
| 3 | YouTube 100 uploads/day shared by all users | YouTube automation caps out fast | Quota form at M5. Global counter + handoff fallback. |
| 4 | Snap allowlist may be unreachable | No Snapchat API | Ask Snap; default to handoff. |
| 5 | X media-upload cost not published | Cost estimate off | One test upload; read the Developer Console usage. |
| 6 | X per-user daily write caps reported lower on pay-per-use | Failed X posts | Read `x-rate-limit-*` headers; surface clearly. |
| 7 | IG cap 50 vs 100 | Over-posting errors | Read `content_publishing_limit` live. |
| 8 | IG pull: domain verification really not needed? Does a workers.dev URL work? | IG blocked before the domain | Test with an app-role account in M6. |
| 9 | TikTok: query-string tokens under a verified prefix | Media route design | Use path tokens; test in M5. |
| 10 | Workers/Workflows outbound body limit | Large chunks fail | Keep chunks at 100 MiB or less (design already does). |
| 11 | `FixedLengthStream` needed with an R2 body? | Missing Content-Length | Use it always; test in M4. |
| 12 | Streaming AES-256-CBC for Snapchat in Workers | Snap adapter design | Spike in M7. |
| 13 | Which LS field gives the purchase email for sign-in | Sign-in design | Check the LS API in M2. |
| 14 | Long-sleeping Workflow instances and code versions | Bugs after deploys | Option C keeps sleeps short (minutes). |
| 15 | `youtube.upload` sensitive vs restricted | Verification cost and time | Check in Google Cloud console at M5. |
| 16 | FB Reels / Page video size limits; post text length | Validation rules | Read live docs before M6; keep limits in config. |
| 17 | Meta Business Suite deep link; how API drafts appear there | FB draft-mode UX | Test in M6. |
| 18 | Web Share API with files, and iOS web push | Phone handoff and reminders | Device tests in M3. |
| 19 | Embedded sign-in on TikTok, X and Snap | Moot (no assisted fill) | No action. |
| 20 | Bridge prices and terms | Only if a bridge is considered | Read live vendor pages. |
| 21 | Token leak or key compromise | User accounts exposed | AES-GCM, key versioning, rotation job, scrubbed logs, separate keys. |
| 22 | Platform policy changes (as YouTube's on 2026-11-02) | Modes change | Remote config and kill switches; re-check docs each milestone. |

---

## K. Milestones (your build order) and model routing

Routing rule: **Opus** for hard work (research and planning; tokens, OAuth, sessions, licences, webhooks; publishing engine; API adapters and media transfer; schema and migrations; reviews). **Sonnet** for routine work (UI screens, fake adapter, unit tests for existing code, handoff mode, reminders, simple CRUD, README, config, CI tweaks). Every milestone ends with an Opus review by an agent that did not write the code, then a stop for your sign-off.

| M | Scope (your plan) | Changes from Step 0 findings | Tasks → model |
|---|---|---|---|
| **M1** Repo, CI, Cloudflare, schema, sign-in | Monorepo `/web` `/worker` `/desktop` `/shared`. CI tests. Actions deploy to workers.dev (Worker + Static Assets). D1 schema v1 + migrations. R2 bucket, CORS (expose `ETag`), lifecycle. Web sign-in: purchase email + licence key via Worker, forked from XLISTit licence code. LS webhook. Sessions, CSRF, rate limits, session/device limits in config. Daily re-validation. | Deploy via Actions (XLISTit uses Cloudflare Git builds). Webhook also handles cancelled/expired subscriptions. Emailed code added once the domain exists (I-4). Remote config + kill switches set up now. | Schema, migrations, licence, sessions, webhook → **Opus**. Repo scaffolding, CI, config files → **Sonnet**. |
| **M2** Web UI on the fake adapter | Accounts, composer (master + per-platform overrides + platform fields), R2 signed multipart uploads, per-platform validation, schedule (calendar, queue), history and filters, drafts (autosave, duplicate). Light/dark, phone layout. | Validation rules use the verified limits (IG carousel 20, Snap video 5–300 s, etc.), kept in config. | Upload signing + validation rules → **Opus**. Fake adapter, screens, CRUD routes → **Sonnet**. |
| **M3** Handoff, X intent, reminders | Handoff for all six. X web intent. Reminders (browser notifications). "Ready to post" list. Manual statuses: waiting for you, handed off, confirmed posted, paste link. | Also FB Share Dialog (links) and Snap share link (URLs only), found in Step 0. xpost is usable with no approvals. | Handoff, intents, reminders, list → **Sonnet**. Review → **Opus**. |
| **M4** Publishing engine on the fake adapter | Scheduling, retries with backoff, 429 handling, idempotency, quotas, spend caps, licence pause. | Design: D1 source of truth, cron sweep each minute, one Workflow per target, no Queue (I-5). Per-account limits enforced by a Durable Object. Global YouTube daily counter. | Engine → **Opus**. Extra failure-case tests → **Sonnet**. Review → **Opus**. |
| **M5** API adapters, easiest access first | One at a time; each works in private/test mode before any approval (except Snapchat, which cannot post at all until allowlisted). | Suggested order by access: **X** (no review, pay per use) → **YouTube** (public allowed since 2026-11-02; 100 uploads/day shared) → **TikTok draft** (`video.upload` review; sandbox first) → **Instagram + Facebook** (app-role testers until App Review) → **Snapchat** (only if allowlisted). YouTube, TikTok and Meta need the domain. | All adapters, OAuth, media transfer → **Opus**. Platform-specific UX screens (e.g. TikTok's required post screen) → **Sonnet**. |
| **M6** Approval pack | Privacy policy, terms, data-deletion page, demo script per platform, prepared as each adapter works. You submit. | Meta data-deletion callback endpoint. Start Meta Business Verification at M1 (long lead). | Drafts → **Sonnet**. Claims checked against the code → **Opus**. |
| **M7** Desktop app | XLISTit shell, activation + device binding, deactivate in settings, offline grace, offline drafts, notifications, drag-and-drop, file reveal, update assistant, signed Mac/Win installers, Releases feed. | Turn on Electron cookie-encryption fuse. New signing key (not XLISTit's). Signing in CI (XLISTit never did). Needs Apple + Windows certs (H-11, H-12). | Licence client, updater, signing pipeline → **Opus**. Shell wiring, desktop UI → **Sonnet**. |
| **M8** Assisted fill | Only for platforms you approve. | **Recommend: approve none.** Terms forbid it on all six; Google and Meta block embedded sign-in (I-3). | **Opus**, only if you approve a platform. |
| **M9** Hardening | Cost caps, monitoring, alerts on failed jobs, README with setup and known limits. | Also: export history, delete my data (if not done earlier), security review, sweep load test. | Security, cost caps, alerts → **Opus**. README → **Sonnet**. |

**Approvals run in parallel with the build:**
- Submit Meta Business Verification at M1.
- Submit Google verification, the YouTube quota form and the TikTok `video.upload` review as soon as the domain and policy pages exist.
- Until each approval lands, that platform uses handoff, so xpost works for real users from M3.
