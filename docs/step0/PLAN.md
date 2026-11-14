# xpost: Step 0 research and plan

Date: 2026-11-14. Status: **draft for owner approval. No code has been written.**
Revision: 2026-11-14 (b). Applies the owner's **no-API decision** (see the box below).

Source reports (copied verbatim): `docs/step0/research/`
- `xlistit.md`: XLISTit repo analysis (`/home/user/marketplace-crosslister`, read-only)
- `tiktok_youtube.md`
- `instagram_facebook.md` (its top "verification update" section overrides older text in that file)
- `x_snapchat.md` (its `[LIVE]` items override older text in that file)
- `cloudflare_bridges.md`

How to read the labels:
- **[LIVE]** / **[DIRECT]**: checked against the live official page on 2026-11-14.
- **[search]**: from search-result summaries of official pages, not read word for word.
- **[3P]**: third-party or community source only.
- **UNVERIFIED**: no official source found. Settle it before relying on it (section J).
- **Assumption**: a number I chose to make an estimate work. Not from research.
- **Research fact**: true about a platform's API, but not used by the plan (xpost uses no platform APIs).

---

> ### Owner decisions (2026-11-14)
> 1. **No platform APIs.** "Do not use any API, as they cost money." The owner chose "Drop all APIs" after being told only X charges, and that this means nothing ever posts automatically.
>    - No X API, no TikTok Content Posting API (not even inbox drafts), no YouTube Data API, no Instagram/Facebook Graph API, no Snapchat Public Profile API.
>    - No platform sign-in connections, no platform tokens stored, no platform developer accounts, no app reviews.
> 2. **Assisted fill on all six platforms** (desktop only, off by default, opt-in per platform after a plain risk warning). Details in section E and decision I-3.
>
> **What this means, in plain words:**
> - **Nothing posts automatically.** A person presses Post every time, on every platform.
> - **No approvals are needed** from TikTok, Meta, Google, X or Snap. xpost can serve real users as soon as M3 ships.
> - **X costs nothing.** X API spend is $0. Free X web intents are links, not API calls.
> - **Scheduling means reminders.** Each scheduled item becomes a reminder with a one-click action.
> - **The desktop app is the most capable client**, because assisted fill lives there.
> - Personal Instagram and Facebook profiles work the same as business ones (no API account-type limits apply).

---

## 0. Summary

xpost can be built on the planned stack: Cloudflare for the whole backend, GitHub, and Lemon Squeezy. XLISTit's licence Worker code ports almost unchanged.

**Plan after the owner decisions:**
- **Three modes, all "you press Post":**
  - **Intent / share link** (free, no keys, just a link the user opens): X web intent, Facebook sharer, Snapchat share link.
  - **Handoff** (all six): open the upload page in the user's normal browser, copy the caption, hand over the file. On phones, the Web Share API share sheet.
  - **Assisted fill** (desktop, opt-in, all six): xpost fills the platform's own upload form in an in-app window; the user signs in and presses Post.
- **Mode preference per platform:** desktop = assisted fill (if opted in and sign-in works) > intent/share (where it exists and fits the post) > handoff. Web = intent > handoff.
- **Scheduling** = a reminder scheduler: D1 as the source of truth, a cron sweep every minute, web push plus desktop notifications, optional email.
- **No Workflows, no Queues, no Durable Objects** are needed (section C).
- **Domain:** no longer needed for platform verification. Still recommended for email sign-in codes, the update feed and branding. Not required until launch; workers.dev works for development.
- **Cost:** Cloudflare usage is cents per 1,000 posts; the $5/month Workers Paid base absorbs it at MVP scale (section F).

**Research findings that still matter** (all true facts; the API ones no longer affect the plan):
- **All six platforms' terms restrict automation outside their APIs.** This is why assisted fill is opt-in with a plain warning (row 18–19 below).
- **Google blocks sign-in in embedded browsers** (row 20). YouTube assisted fill will likely fail its sign-in test and fall back to handoff.
- **Meta blocks Facebook Login in embedded browsers** (section B). Instagram/Facebook website sign-in in an app window is UNVERIFIED; the M8 test settles it.
- **Free intent routes exist** for X (text, links, hashtags; no media), Facebook (links) and Snapchat (URLs only).
- **Handoff works everywhere.**
- **API-only findings are now moot:** approvals, audits, the YouTube 100/day quota, X per-post pricing, Snap's allowlist, the "bring your own X keys" conflict, TikTok media-domain verification.

### What changed vs your expected constraints

These are research verdicts. They are still true. Rows 1–12, 14–16 and 21–22 are about platform APIs, so under the no-API decision they **no longer affect the plan**. Rows 13 and 17–20 still shape it.

| # | Your expected constraint | Verdict | Evidence |
|---|---|---|---|
| 1 | TikTok: an unaudited app can only post privately | **CONFIRMED** | "Unaudited API clients can only post contents in SELF_ONLY viewership." https://developers.tiktok.com/docs/en/content-posting-api-get-started |
| 2 | TikTok: few users on an unaudited app | **CONFIRMED, made specific** | Up to **5 users per 24 h**, and each account must be set to private. Same page; also https://developers.tiktok.com/doc/content-posting-api-reference-direct-post |
| 3 | TikTok: public posting needs an audit | **CONFIRMED** | The audit is a "Terms of Service compliance" audit. The sandbox gives no public posting. https://developers.tiktok.com/docs/en/add-a-sandbox |
| 4 | TikTok: inbox draft has a lower bar | **CONFIRMED [LIVE], with a caveat** | It needs `video.upload` scope approval (app review with a demo video), not the audit. Cap: **5 pending shares per 24 h**. https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content , https://developers.tiktok.com/doc/content-posting-api-reference-upload-video |
| 5 | YouTube: uploads from an unaudited project are locked private | **CHANGED [LIVE]** | Revision history, 2026-11-02: unverified projects "are no longer restricted to private viewing mode". https://developers.google.com/youtube/data/revision_history |
| 6 | YouTube: upload quota is per project and shared | **CONFIRMED; units CHANGED [LIVE]** | Since 2026-06-01: **100 `videos.insert` calls per day per project**. https://developers.google.com/youtube/v3/docs/videos/insert , https://developers.google.com/youtube/data/guides/quota_and_compliance_audits |
| 7 | Instagram: professional accounts only | **CONFIRMED [DIRECT]** (API only) | Business and Creator accounts only. https://developers.facebook.com/documentation/instagram-platform/overview |
| 8 | Instagram: App Review needed | **CONFIRMED, with nuance** | Advanced Access needs App Review **and Business Verification**. https://developers.facebook.com/documentation/instagram-platform/app-review |
| 9 | Facebook: Pages only | **CONFIRMED** (API only) | Personal profiles: `publish_actions` was removed in 2018. Groups API removed in 2024. [search] |
| 10 | Facebook: App Review needed | **CONFIRMED** | Same rules as Instagram. |
| 11 | X: pay per use | **CONFIRMED [LIVE]** | No contracts, no minimum spend, prepaid credits. https://docs.x.com/x-api/getting-started/pricing |
| 12 | X: posts with links cost more | **CONFIRMED [LIVE]** | $0.015 per post; **$0.200 with a URL**. Same page. |
| 13 | X: web intent is free | **CONFIRMED [LIVE]** — **used by the plan** | `https://x.com/intent/tweet` takes text, url, hashtags, via, related and in_reply_to. **No media.** https://docs.x.com/x-for-websites/post-button/guides/web-intent |
| 14 | Snapchat: posting goes through the Public Profile API | **CONFIRMED [LIVE]** | https://developers.snap.com/marketing-api/Public-Profile-API/ProfileAssetManagement |
| 15 | Snapchat: public profiles only | **CONFIRMED** (API only) | Endpoints sit under `/public_profiles/{id}`. |
| 16 | Snapchat: approval may be needed | **CHANGED: stricter [LIVE]** | "The Public Profile API is currently allowlist only." https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted |
| 17 | Snapchat: a web uploader exists | **CONFIRMED** — **used by the plan** | profile.snapchat.com, my.snapchat.com and snapchat.com/spotlight. The help pages disagree on which one is canonical. |
| 18 | Terms restrict automation outside the APIs | **CONFIRMED for all six** — **drives the assisted-fill warning** | Meta: "Platform APIs are the only allowable means… The use of scripts… to automate actions… outside of the Platform APIs is not allowed" [DIRECT]. TikTok global ToS: no "automated scripts to… interact with the Services". YouTube ToS: no "automated means". Snap ToS [search]: no "automated or semi-automated means". |
| 19 | X bans scripting its website | **CONFIRMED [LIVE]** — **drives the assisted-fill warning** | Automation Rules ban "scripting the X website". Developer Guidelines: "No scraping, browser automation… permanent suspension." https://docs.x.com/developer-guidelines |
| 20 | Google blocks embedded sign-in | **CONFIRMED [LIVE policy text]** — **affects YouTube assisted fill** | "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent." https://developers.google.com/identity/protocols/oauth2/policies |
| 21 | TikTok and Instagram need media-URL domain verification | **Half CHANGED** (API only) | TikTok PULL_FROM_URL: CONFIRMED. Instagram: no verification documented (UNVERIFIED). |
| 22 | Instagram Login has no PKCE | **CONFIRMED [DIRECT]** (API only) | Only the `client_secret` exchange is documented. |

### Other research findings (facts; mostly moot under the no-API decision)
- **YouTube:** the private lock was removed on 2026-11-02 [LIVE]. Uploads have their own **100/day** project bucket [LIVE]. Moot.
- **TikTok:** API posting and draft caps (5 users / 5 pending drafts per 24 h) are moot. Still relevant: "An app that copies arbitrary contents from other platforms to TikTok" is not acceptable to TikTok, so position xpost as "write once, post everywhere".
- **Instagram:** carousels take **up to 20 items** [DIRECT] (API limit; web may differ, UNVERIFIED). API caps and login types are moot.
- **Facebook:** the Share Dialog has a `hashtag` parameter but no text parameter. It needs an `app_id` (see section E).
- **X:** "bring-your-own-keys" is forbidden by the Developer Agreement and Policy [LIVE]. **Moot**: xpost uses no X API at all.
- **Snapchat:** Creative Kit for Web needs no review and shares **URLs only**. The web uploader takes .mp4, 5–60 s, at least 540x960 (businesshelp).
- **Cloudflare:** new projects should use **Workers with Static Assets, not Pages**. Cron changes take up to 15 min and runs can be missed.
- **Bridge report correction:** `cloudflare_bridges.md` says bridges are needed because YouTube locks unaudited uploads to private. Out of date since 2026-11-02, and moot anyway (section G).

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
- The app verifies an Ed25519 licence token offline. It has a 7-day offline grace, re-validates every 24 h, and has a clock-rollback guard.
- The webhook verifies its HMAC signature. **It handles only `order_refunded`.** Cancellation and expiry are left to the daily validate.

### Shell and updater
- Electron 45, React 19, Vite 8 (renderer only; main is built with esbuild), Tailwind 4, Zod 4, better-sqlite3.
- Strong defaults: sandbox on, context isolation on, permissions denied by default, a Zod-checked IPC allow-list, and a CSP.
- Updater UX: Download, Later, Skip; it never restarts mid-post; and a minimum-version block.
- **Mac builds are unsigned, so Mac auto-update is off.**

### Assisted mode
- Uses a `BrowserWindow`, persistent partitions, an isolated-world script, real input events, and CDP file attach.
- Captures the live listing URL when the site navigates to it.
- Selector JSON ships signed from the Worker.
- **There is no per-marketplace kill switch.**
- **The cookie-encryption fuse is off**, so marketplace sessions are not keychain-protected. The XLISTit handover doc wrongly says they are.

### Reuse list
| What | From | How |
|---|---|---|
| Licence logic (activate, validate, deactivate, devices) | `website/lib/licence.ts` | Fork. Remove the ambassador branches. Change the instance-name prefix and plan strings. |
| LS client | `website/lib/lemonsqueezy.ts` | Copy as is. It includes the `fetch` wrap for Workers. |
| Webhook HMAC check | `website/lib/webhook.ts` | Copy, then extend (see the next list). |
| Licence token signing | `website/lib/token.ts` | Copy with **new prefixes** and a **new key**. |
| Config, rate limiting, error codes | `website/lib/config.ts`, `rate-limit.ts`, `codes.ts` | Copy. |
| Desktop licence client | `src/main/licence/*`, `src/shared/licence*.ts` | Copy for xpost's Electron main process. Change the fingerprint salt and error codes. |
| Test harnesses | `website/test/fake-ls.ts`, `tests/e2e/licence-stack.ts`, `tests/unit/licence-harness.ts` | Copy. They run the real Worker code against a fake LS. |
| Electron shell | `src/main/index.ts` security setup, preload, IPC contract, updater service and card | Copy, then split the 400-line `index.ts`. |
| Assisted-fill engine | XLISTit assisted mode (partitions, isolated world, CDP file attach, URL capture, signed selectors) | Port for M8. Add per-platform kill switch and cookie-encryption fuse. |
| Discipline | error-code registry, log scrubbing, DB backup before migrations, signed remote config, `no-secrets` test | Copy. |
| UI system | Tailwind `@theme` tokens, utilities, brutalist style | Mirror it with xpost's own logo and colour. |

### "Fix, don't copy" list
1. **One key signs everything** in XLISTit. xpost gets its own keys: one for licence tokens and a separate one for config/selector feeds. Desktop releases get a separate signing identity from XLISTit.
2. **Turn on the `enableCookieEncryption` fuse** from xpost's first release.
3. **Webhook:** make the store check mandatory. Add the `subscription_*` events (cancelled, expired, and so on; confirm the exact names against LS docs in M1). Add an idempotency store.
4. **LS error mapping** relies on matching message text. Prefer status fields where LS provides them.
5. **Deploy from GitHub Actions** with `wrangler deploy` and a scoped Cloudflare API token, not dashboard Git builds. You asked for Actions deploys.
6. **Signed releases from CI**: Apple Developer ID plus Windows signing. Publish to Releases automatically and add a macOS CI job.
7. **Add a per-platform kill switch.** XLISTit only has a global minimum version.
8. **IPC sender check**: use a custom `app://` scheme and an exact-origin check, not `startsWith('file://')`.
9. **Do not copy** the ambassador, sponsors, market prices, tax, eBay or proxy features.
10. Add ESLint. Do not commit `tsbuildinfo`.

---

## B. Platform research tables

**Read this as research facts.** Tables 1 and 2 describe what each platform offers, including its APIs. **xpost uses none of the APIs** (owner decision). The rows the plan still uses are: draft/share/intent route, web upload page, sign-in in an app window, terms on automation, and media/caption limits. Table 3 lists the limits xpost actually validates against.

### Table 1: access and routes (research facts)

| | TikTok | Instagram | YouTube | X | Facebook | Snapchat |
|---|---|---|---|---|---|---|
| **Posting API and content** (not used) | Content Posting API. Direct Post or Upload to inbox. Video; photo carousel up to 35 images. | Graph API: container, then `media_publish`. Image, Reel, carousel (up to 20), Story. | Data API `videos.insert`. Video; Shorts automatic (3 min or less, vertical or square). | `POST /2/tweets`. Text, up to 4 images or 1 GIF or 1 video. | Pages API: feed, photos, video, Reels, Page Stories. | Public Profile API: Story, Spotlight, Saved Story. |
| **API access needed** (not used) | App review per scope; audit for public Direct Post. | Meta app, App Review, Business Verification. | Cloud project, OAuth verification; quota audit above 100 uploads/day. | Developer account, prepaid credits. | Meta app, App Review, Business Verification. | **Allowlist** via a Snap contact. |
| **Draft / share / intent route** | Share Kit is mobile SDK only. No web intent. | None on the web (UNVERIFIED negative). On phones, the Web Share API sheet goes to the IG app. | No intent (UNVERIFIED negative). | **Web intent** `x.com/intent/tweet` (text and links, free, no media). | **Share Dialog** (`facebook.com/dialog/share`, needs `app_id`; `hashtag` param) or legacy **`sharer.php?u=`** (no app ID) [3P]. Links only. | **Share link** `snapchat.com/share?link=` or Creative Kit Web button: URLs only, no review. |
| **Web upload page** | `tiktok.com/tiktokstudio` then Upload (`/tiktokstudio/upload` UNVERIFIED) | `instagram.com` (Create); `business.facebook.com` | `studio.youtube.com` then Create | `x.com/compose/post` (path UNVERIFIED) or `x.com/home` | `facebook.com`; Business Suite (deep link UNVERIFIED) | `my.snapchat.com`, `profile.snapchat.com`, `snapchat.com/spotlight` |
| **Sign-in in an app window** | No official statement (UNVERIFIED). | FB Login blocked in embedded browsers. IG web sign-in UNVERIFIED. | **Blocked.** OAuth policy plus the embedded-framework block since 2019. | UNVERIFIED. Passkeys reported to hang; Google SSO is blocked. | **Blocked** in embedded browsers (FB Login). Website sign-in UNVERIFIED. | UNVERIFIED. |
| **Terms on automation** | Global ToS bans "automated scripts to… interact with the Services". | Meta ADC [DIRECT]: APIs are the only allowed means; scripting actions is banned. | ToS bans "automated means". | Automation Rules ban "scripting the X website". Guidelines: permanent suspension. | Same as Instagram (Meta ADC, ToU 3.2.3). | ToS bans "automated or semi-automated means" and unapproved third-party apps. |

### Table 2: API limits, tokens and review demands (research facts; API-only rows are moot)

| | TikTok | Instagram | YouTube | X | Facebook | Snapchat |
|---|---|---|---|---|---|---|
| **API media limits** | MP4/WebM/MOV; max 4 GB; 23–60 fps; 360–4096 px; 3, 5 or 10 min. Photos: JPEG or WebP, 20 MB, up to 35. | Image: JPEG only, 8 MB, 4:5 to 1.91:1. Reel: 3 s–15 min, **300 MB**. Story video: 3–60 s, 100 MB. | Max 256 GB. 15 min unless the channel is verified. Shorts: 3 min or less. | Image 5 MB; GIF 15 MB; video 20 min / 8 GB (Premium: 125 min / 16 GB). | Reels: 9:16, min 540x960, 24–60 fps, **3–90 s**. File size UNVERIFIED. | MP4, 5–300 s, up to 1 GB; images on Stories. |
| **API caption limits** | Video caption 2,200. Photo title 90, description 4,000. | 2,200 chars, 30 hashtags, 20 @ tags. | Title 100 chars (no `<` or `>`). Description 5,000 bytes. | 280 weighted chars (URL = 23; emoji/CJK = 2). Premium: 25,000. | About 63,206 (UNVERIFIED). | Spotlight description 160. Caption 1–250, no emoji. |
| **Rate limits / caps** (moot) | ~15 posts/day per creator; 5 pending drafts/24 h. | 50 posts/24 h (docs also say 100). | 100 uploads/day per project. | 100/15 min per user. | Reels 30 per Page per 24 h. | UNVERIFIED. |
| **Token lifetimes / OAuth** (moot) | Access 2 h; refresh 180 d, rotates. | Long-lived 60 d; no PKCE. | Refresh 7 days in Testing. | Access 2 h; refresh rotates. | Long-lived about 60 d. | Access 1 h. |
| **Approval UX demands** (moot) | Required post screen (privacy dropdown, no default, etc.). | Screencast per permission. | Show YouTube ToS; delete within 30 days of revoke. | Consent per user. | Same as Instagram, plus data-deletion callback. | Describe use to Snap contact. |

### Table 3: limits xpost validates against

The user still uploads to each platform (by hand or assisted), so limits matter. Where the research found **web-upload** limits, xpost uses them. Where only API limits were researched, they are labelled **"API limits; web upload limits may differ (UNVERIFIED)"** and are kept in remote config so they can be corrected without a release. Validation **warns**; it does not block (the platform has the final word).

| Platform | Media | Caption | Source label |
|---|---|---|---|
| **TikTok** | **Web upload:** MP4/WebM, 720x1280 or higher, up to 30 min (Creator Academy says 60; conflict, UNVERIFIED), under 10 GB. Photos: API limits (JPEG/WebP, 20 MB, up to 35). | 2,200 | Video: web (support.tiktok.com). Photos and caption: **API limits; web upload limits may differ (UNVERIFIED)**. |
| **Instagram** | Image JPEG 8 MB, 4:5 to 1.91:1. Reel 3 s–15 min, 300 MB. Carousel up to 20. Story video 3–60 s. | 2,200 chars, 30 hashtags, 20 @ tags | **API limits; web upload limits may differ (UNVERIFIED).** |
| **YouTube** | 15 min unless the channel is verified (help 71673). Up to 15 files per batch in Studio. Max 256 GB (API page). Shorts 3 min or less. | Title 100 (no `<` `>`); description 5,000 bytes | Duration and batch: web (YouTube Help). Size and text: **API limits; web upload limits may differ (UNVERIFIED).** |
| **X** | Image 5 MB; GIF 15 MB; video 20 min / 8 GB (Premium 125 min / 16 GB). Up to 4 images or 1 video. | 280 weighted (Premium 25,000). Intent text over 280 needs editing by the user [LIVE]. | Media: **API limits; web upload limits may differ (UNVERIFIED)** (docs say limits follow the user's subscription, not the API plan). Text: platform rule. |
| **Facebook** | Reels 9:16, min 540x960, 3–90 s. File size UNVERIFIED. | About 63,206 (UNVERIFIED) | **API limits; web upload limits may differ (UNVERIFIED).** |
| **Snapchat** | **Web uploader:** .mp4, 5–60 s, at least 540x960. Story and Spotlight need two uploads. | Spotlight description 160; caption 1–250 | Media: web (businesshelp). Text: **API limits; web upload limits may differ (UNVERIFIED).** |

---

## C. Cloudflare limits and hosting

Source: `research/cloudflare_bridges.md` (read from Cloudflare's official docs repo, current to 2026-11-04).

| Service | Key limits (Workers Paid) | What it means for xpost |
|---|---|---|
| **Inbound request body** | Set by the zone plan: Free/Pro 100 MB, Business 200 MB. | **Never send video through a Worker.** Browsers and desktop upload straight to R2. |
| **Worker memory** | 128 MB per isolate (shared). | No media passes through the Worker, so this is not a concern. |
| **Worker CPU** | 30 s default, up to 5 min per request. Free plan: 10 ms. | Web push payload encryption and licence crypto fit easily on Paid. |
| **Worker wall time** | Cron: 15 min. | The minute sweep finishes in well under a second at MVP scale (Assumption). |
| **R2 multipart** | Parts 5 MiB–5 GiB, up to 10,000 parts, all parts except the last the same size. Incomplete uploads aborted after 7 days. Presigned URLs: 1 s–7 days, **S3 endpoint only (not custom domains)**, no POST forms. CORS must expose `ETag`. | Worker signs one presigned PUT per part. Fixed part size (10 MiB proposed). Handed-over file downloads use short-lived presigned GET URLs. |
| **R2 pricing** | $0.015/GB-month; Class A $4.50/M; Class B $0.36/M; **egress free**. Free tier: 10 GB-month, 1M A, 10M B. Lifecycle rules by prefix. | Cheap. Lifecycle rule as a backstop for retention. |
| **D1** | 10 GB per database; 1,000 queries per invocation; 30 s per query; 2 MB per row; 100 bound params; 30-day Time Travel. Paid: 25B reads and 50M writes per month included. | One database is plenty. |
| **Cron** | UTC; finest is every minute; changes take **up to 15 min** to propagate and runs can be missed. | The sweep looks back for overdue reminders. |
| **Rate Limiting binding** | 10 s or 60 s periods, per location, **approximate**. | Coarse abuse protection only. Use a D1 counter where precision matters. |
| **Email Service (Beta)** | Workers Paid; 3,000/month included, then $0.35 per 1,000. Needs an onboarded sending domain. | Optional email codes and reminders. **Needs the domain.** Costs money beyond the free tier, so it needs your approval (I-4, I-13). |
| **Workflows** | Durable multi-step jobs; step billing since 2026-08-10. | **Not used.** They existed to run long API uploads with retries. With no APIs, there is no long-running job. A reminder is one D1 update plus a few push sends. |
| **Queues** | 128 KB messages; $0.40/M ops. | **Not used.** The sweep sends at most a few reminders per minute at MVP scale; no fan-out buffer is needed. Revisit only if a sweep cannot finish within the cron wall time. |
| **Durable Objects** | One single-threaded object per key. | **Not used.** They were for per-account token-refresh locks and API rate buckets. No tokens, no API calls. |

### Hosting recommendation
- **Use Workers with Static Assets, not Pages.** Cloudflare says: "Start new projects with Workers" (https://developers.cloudflare.com/pages/).
- One Worker serves the React SPA (`not_found_handling: "single-page-application"`) and the API. Static asset requests are free.
- The same Worker holds the cron handlers (reminder sweep, licence re-validation, retention cleanup).
- Deploy with GitHub Actions (`wrangler deploy`). Use `xpost.<account>.workers.dev` for development. The domain is one config value (`APP_ORIGIN`).
- **Workers Paid ($5/month): keep it from M1.** The reason has changed: Workflows are gone. It is still needed because the Free plan's 10 ms CPU per request is tight for web push encryption and licence crypto, and Email Service requires Paid.

---

## D. Architecture

### Components

```
 Phone / browser (React SPA)          Desktop (Electron, same React UI)
   |  HTTPS + httpOnly cookie            |  HTTPS + device licence token (Ed25519, verified offline)
   |  Web Push (service worker)          |  local SQLite: drafts + reminders readable offline
   |                                     |  local OS notifications; assisted-fill windows
   |                                     |  (platform sessions stay on this device only)
   v                                     v
 +-------------------------- Cloudflare Worker "xpost" ---------------------------+
 |  Static assets (SPA)   API router   LS webhook   R2 upload/download signing     |
 |  Cron: * * * * * reminder sweep;  daily: licence re-validate, retention cleanup |
 |  Remote config + signed feed (kill switches, selector config for assisted fill)|
 +-----+--------------+--------------+---------------+--------------+------------+
       |              |              |               |              |
      D1             R2             KV          Email Service   Web Push services
 (source of truth) (media, exports) (config cache)  (optional)    (browser notifications)
       |
       +--> Lemon Squeezy License API + main API
   (No platform APIs. Platforms are reached only by the user's own browser or the desktop's in-app window.)
```

### Request flows

**Sign-in (web)**
1. The user enters their purchase email and licence key.
2. The Worker rate-limits the request: the CF binding for coarse limits, plus a D1 counter per email and per key for strict limits.
3. The Worker calls LS `validate`. It checks status, store, product and variant (forked XLISTit code). It checks the email against the licence's order. Which LS field exposes the email is UNVERIFIED; settle it in M1.
4. **If email codes are on** (recommended; needs the domain and Email Service): the Worker emails a 6-digit code. The user enters it.
5. The Worker creates a `web_sessions` row and sets an httpOnly, Secure, SameSite=Lax cookie holding a random ID. Only the ID's hash is stored.
6. If the licence is over its web-session limit, the oldest session is revoked, or the user picks one to sign out.
7. All unsafe methods need a CSRF token (double-submit) plus an Origin check.

**Desktop activation**
- Same as XLISTit: LS `activate` with a fingerprint in the instance name. The Worker returns an Ed25519 licence token with xpost prefixes and an xpost key.
- Devices count against the LS activation limit. Settings, Devices lets the user deactivate.
- Offline grace is 7 days, as in XLISTit. Drafts and reminders stay readable offline.

**Platforms & modes (replaces "connect a social account")**
- There is nothing to connect. The user picks which platforms they use and, optionally, an account label per platform (free text, e.g. "@mybrand").
- On desktop, each platform shows its mode and an **assisted fill opt-in** (with the risk warning). The opt-in is stored on the device.

**Upload**
1. The client asks `POST /media` with size, type and file name. The Worker creates an R2 multipart upload under an unguessable key: `m/<userId>/<random 128-bit>`.
2. The client requests presigned PUT URLs for batches of parts, then PUTs 10 MiB parts straight to R2. It keeps the ETags so it can resume. **Never proxied through the Worker.**
3. `POST /media/:id/complete` sends the ETags and the Worker completes the upload.
4. The client probes the file (duration, size, dimensions, codec where readable). The Worker stores the probe.
5. Validation runs against every selected platform's rules (Table 3). Problems show as plain-English fixes, such as "Snapchat's web uploader takes videos of 60 seconds or less. Trim it or untick Snapchat." **xpost never changes media without consent.**
6. On desktop, the original local file path is also remembered, so handoff and assisted fill can use it without downloading.

**Schedule (and "post now")**
1. Saving writes `posts` and `post_targets` rows: UTC time plus the user's IANA timezone, status `scheduled`, and `schedule_version += 1`. One `reminders` row is written per target per channel.
2. "Post now" skips the reminder: it runs the one-click action straight away.
3. Editing or cancelling updates D1, bumps `schedule_version`, and replaces or cancels pending reminders.

**Reminder scheduler (the engine)**
1. The cron runs every minute. It selects `reminders` with `status='pending' AND due_at <= now`, including overdue ones (look-back, because cron runs can be missed).
2. **Claim:** a conditional `UPDATE … SET status='sending' WHERE id=? AND status='pending'`. Zero rows changed means another run has it.
3. Skip and close the reminder if the target was cancelled, the version changed, or the licence is blocked (`paused_licence`).
4. **Send:**
   - Web push (VAPID) to each of the user's subscriptions. A 404/410 from the push service deletes that subscription.
   - Desktop: the app syncs upcoming reminders into local SQLite and fires a local OS notification at `due_at`, even offline. It dedupes by reminder ID.
   - Email (optional, if the user turned it on and you approved Email Service).
5. Set the target to `waiting_for_you`. Set the reminder to `sent`, or back to `pending` with a backoff on a transient error. After a set number of failures (Assumption: 5), mark it `failed`; it shows in the app and triggers an alert (M9).
6. Every reminder deep-links to the target's one-click action. The in-app **"Ready to post"** list always shows due targets, so a missed notification never loses a post.

**One-click action (per target, by mode)**
- **Intent / share** (web or desktop): open the prefilled URL (X intent, Facebook sharer, Snap share link) in the user's normal browser.
- **Handoff:**
  - Desktop browser: copy the caption, download the file (short-lived presigned R2 GET), and open the platform's upload page in a new tab.
  - Desktop app: copy the caption, reveal the file in Finder/Explorer (local copy, or downloaded first), and open the upload page in the user's default browser.
  - Phone: `navigator.share({files, text})` opens the OS share sheet. The caption is copied first, because the share sheet may drop it.
  - X with media: the handoff opens the X intent URL (caption prefilled) instead of the bare composer, and still hands over the file.
- **Assisted fill** (desktop only): see section E.

**Statuses (never marked published on a guess)**
- `scheduled` → `waiting_for_you` (due) → `handed_off` (one-click action used) → `confirmed_posted`.
- `confirmed_posted` needs either the user pressing "I posted it" (optionally pasting the post link, validated per platform), or assisted fill capturing the live post URL when the site navigates to it (as XLISTit does).
- Other states: `skipped`, `cancelled`, `paused_licence`.

**Licence webhook and re-validation** (unchanged)
1. `POST /webhooks/lemonsqueezy`: verify the HMAC (constant time) over the raw body. **Require** the store ID to match.
2. Write `webhook_events` (unique event key) so each event is handled once.
3. On refund, cancellation or expiry, update `licences.status`.
4. A daily cron re-validates active licences with LS. A blocked licence:
   - blocks new posts
   - sets future targets to `paused_licence` and stops their reminders
   - shows a banner
   - sends one notification

### Why no Queue or Workflow
- The earlier plan compared "cron → Queue → Workflow" with "cron → Workflow". Both existed to run API uploads with durable retries. **That work is gone.**
- A reminder is: one conditional D1 update, a few push requests, one more D1 update. It fits in the cron handler.
- Safety comes from the conditional claim and from statuses only moving forward on user action.
- A duplicate notification (worst case) is harmless: the action is still a person pressing Post.

### Quotas
- No platform caps or spend caps are needed: nothing calls a platform.
- Licence-based limits stay only where they still protect something:
  - **web sessions and desktop devices** (licence sharing)
  - **storage** (R2 GB held and media retention days)
  - **email reminders per month** (Email Service costs money beyond 3,000/month)
  - optional cap on scheduled reminders per month, as abuse protection only (Assumption).
- A monthly post quota is **not needed** for cost reasons any more. Use it only if you want plan tiers by volume.

### Retention
- `MEDIA_RETENTION_DAYS` config (7 proposed). A file is deleted when all its targets are final (`confirmed_posted`, `skipped`, `cancelled`) **and** the window has passed, or when the window plus a grace period passes regardless.
- The R2 lifecycle rule (retention + 7 days) is a backstop.
- Handed-over file downloads use presigned GET URLs that expire in minutes (Assumption: 15 min).

### D1 data model (key columns)

All times are stored as UTC epoch milliseconds. IDs are random (ULID or 128-bit).

| Table | Key columns | Indexes / notes |
|---|---|---|
| `licences` | id, ls_key_hash, ls_key_id, ls_order_id, product_id, variant_id, plan, **status** (`active`, `expired`, `disabled`, `refunded`, `cancelled`), expires_at, last_validated_at | unique(ls_key_hash) |
| `users` | id, licence_id, email, timezone, created_at, deleted_at | unique(email) |
| `plan_limits` | plan, max_web_sessions, max_devices, storage_gb, media_retention_days, email_reminders_monthly, scheduled_reminders_monthly (optional) | Editable without a release |
| `web_sessions` | id_hash, user_id, created_at, last_seen_at, expires_at, label, revoked_at | idx(user_id, revoked_at) |
| `login_codes` | id, email_hash, code_hash, expires_at, attempts | Delete after use |
| `auth_counters` | key (email/key/IP hash), window_start, count | Strict sign-in limits |
| `devices` | id, user_id, ls_instance_id, fingerprint_hash, label, activated_at, last_seen_at, deactivated_at | |
| `media` | id, user_id, r2_key, size, mime, duration_ms, width, height, fps, vcodec, acodec, **status** (`uploading`, `ready`, `deleted`), multipart_upload_id, delete_after | idx(status, delete_after) |
| `posts` | id, user_id, title, master_caption, master_fields_json, **status** (`draft`, `scheduled`, `active`, `done`, `cancelled`), scheduled_at, timezone, created_at, updated_at, deleted_at | idx(user_id, status, scheduled_at). Drafts are `status='draft'`. |
| `post_media` | post_id, media_id, position | pk(post_id, position) |
| `post_targets` | id, post_id, platform, account_label, **mode** (`assisted`, `intent`, `handoff`), override_json (caption, title, hashtags…), **status** (`scheduled`, `waiting_for_you`, `handed_off`, `confirmed_posted`, `skipped`, `cancelled`, `paused_licence`), schedule_version, scheduled_at, handed_off_at, confirmed_at, confirmed_url, confirmed_by (`user_confirm`, `user_link`, `assisted_capture`) | idx(post_id); idx(status, scheduled_at) |
| `target_events` | id, target_id, at, from_status, to_status, code | Status history |
| `reminders` | id, target_id, user_id, channel (`push`, `desktop`, `email`), due_at, **status** (`pending`, `sending`, `sent`, `failed`, `cancelled`), attempts, sent_at, last_error_code | idx(status, due_at) for the sweep |
| `push_subscriptions` | id, user_id, endpoint, keys_json, created_at | Public browser keys only; delete on 404/410 |
| `remote_config` | key, value_json, updated_at | Global: min desktop version, pause reminders. Per platform (`platform:<id>`): default mode for web and desktop, intent on/off, **assisted kill switch**, **selector config version**, message, limits overrides |
| `webhook_events` | event_key, type, received_at, processed_at | unique(event_key) |
| `audit_log` | id, user_id, at, kind (sign-in, session revoked, device deactivated, export, delete), ip_hash | Security events only; no captions |
| `data_exports` | id, user_id, status, r2_key, expires_at | |

**Removed vs the earlier draft:** `social_accounts`, `oauth_states`, platform token columns, `usage_counters`, `x_cost_ledger`, `platform_status` approval fields, Workflow IDs and publish/reconcile columns.

**UI mode labels** shown on every target:
- "You press Post" (intent and handoff)
- "Assisted — you press Post" (assisted fill)

**Feature coverage**
- **Drafts:** `posts.status='draft'`. Autosave is a PATCH with an `updated_at` check. Duplicate copies the post and its targets.
- **Filters:** by status, platform, mode and date, using the indexes above.
- **Export:** a JSON + CSV zip to R2, delivered as a short-lived link.
- **Delete data:** delete rows and R2 objects, and keep only the licence record LS needs. The desktop also offers "Sign out of all platforms on this device", which clears the assisted-fill partitions.

### Config, remote config and kill switches
- **Static config** (Worker vars): `APP_ORIGIN`, `MEDIA_RETENTION_DAYS`, LS IDs. **Secrets:** LS API key, webhook secret, licence signing key, config-feed signing key, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (presigned URLs), `VAPID_PRIVATE_KEY` (web push).
- **Remote config:** the `remote_config` table in D1, cached about 60 s in Worker memory or KV. You change default modes, limits and messages **without a release**.
- **Kill switches:**
  - per platform: assisted fill off (desktop falls back to intent or handoff)
  - per platform: intent off (if a platform changes its intent URL)
  - global: pause reminders
  - minimum desktop version
- Handoff cannot be switched off; it is the fallback for everything.
- A switched-off mode falls back with a plain-English message. Nothing is silently dropped.
- **Desktop** gets the same config, plus the assisted-fill **selector config**, as a signed versioned feed (Ed25519, its own key), as XLISTit does.

### Security checklist
- **Web:** httpOnly + Secure cookies, CSRF token + Origin check, and an ownership check (`user_id`) on every query.
- **Media:** unguessable R2 keys, short-lived presigned upload and download URLs, and CORS limited to `APP_ORIGIN`.
- **Rate limits:** on sign-in, codes and licence checks. The CF binding is coarse; D1 counters handle strict limits.
- **Logs:** route, status and error code only. **No licence keys, captions or emails.** Reuse XLISTit's scrubber.
- **Repo:** no secrets. Copy XLISTit's `no-secrets` test.
- **No platform credentials anywhere on the server.** No social passwords, cookies or tokens are ever sent to or stored by xpost's backend.
- **Desktop:** `enableCookieEncryption` fuse on. Assisted-fill sessions live in per-platform persistent partitions **on the device only**. Selector feed signature checked before use. Separate code-signing and licence keys from XLISTit.

### Adapter interface (sketch)

Each platform is **config plus manual actions**. There is no connect, refresh, publish or status polling.

```ts
export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'x' | 'facebook' | 'snapchat' | 'fake';
export type Mode = 'assisted' | 'intent' | 'handoff';
export type ClientKind = 'web' | 'phone' | 'desktop';

export interface PlatformAdapter {
  readonly platform: Platform;
  readonly label: string;
  readonly content: { video: boolean; image: boolean; carousel?: number; text: boolean; link: boolean; story?: boolean };
  readonly limits: MediaRules & CaptionRules;        // Table 3; remote config may override
  readonly limitsSource: 'web' | 'api_unverified_for_web';

  /** Plain-English warnings (Table 3). Never blocks; never edits media. */
  validate(t: TargetDraft, media: MediaProbe[]): ValidationIssue[];

  /** Caption text as this platform wants it (title/description split, hashtags, length trim warnings). */
  captionFormat(t: TargetDraft): { text: string; title?: string; hashtags?: string[] };

  /** Handoff target page (opened in the user's normal browser). */
  uploadPageUrl(t: TargetDraft): string;

  /** Free intent/share link, or null when the post does not fit (e.g. media on Snap/FB). */
  buildIntentUrl?(t: TargetDraft): string | null;

  /** Validates a pasted post link, and matches the URL assisted fill sees after posting. */
  parsePostUrl(url: string): { postId: string } | null;

  /** Desktop only. Field map keys; the selectors themselves come from the signed feed. */
  assistedFill?: {
    startUrl: string;
    fields: Array<'file' | 'caption' | 'title' | 'description' | 'hashtags'>;
    signInCheckUrl: string;                          // used by the M8 sign-in test
  };
}

/** Chooses the mode per target. Desktop: assisted > intent > handoff. Web/phone: intent > handoff. */
export function chooseMode(a: PlatformAdapter, t: TargetDraft, client: ClientKind,
  optedIn: boolean, cfg: RemotePlatformConfig): Mode;
```

- **A 7th platform** = a new adapter file + a `remote_config` entry (+ selector entries in the feed for assisted fill).
- **Fake adapter** (`platform: 'fake'`): a local test upload page and intent URL, an assisted-fill descriptor against a local test form, and configurable failures (form changed, sign-in blocked, post URL not captured). It drives the UI, scheduler and assisted-fill tests and the demo.
- **Tests:** every adapter gets tests for intent URL building, caption formatting, validation edge cases and post-URL parsing.

---

## E. Posting modes per platform

**A person presses Post every time, on every platform.**

Mode preference:
- **Desktop:** assisted fill (if the user opted in, the kill switch is off, and sign-in works) > intent/share (where it exists and fits the post) > handoff.
- **Web / phone:** intent/share (where it fits) > handoff.

**Assisted fill (owner approved all six, 2026-11-14):**
- Desktop only. Off by default. Opt-in per platform after a plain warning naming that platform's risk (last column).
- The user's own session in an in-app window. The user signs in and presses Post. **xpost never presses Post.**
- Sessions stay on the device; Electron cookie-encryption fuse on.
- Signed, versioned selector config via the updater/feed. Remote kill switch per platform.
- If a field cannot be filled, a plain-English message and fallback to handoff.
- M8 starts with a hands-on sign-in test per platform. Any platform that blocks in-app sign-in (likely YouTube, because of Google's embedded-browser block) uses handoff. **No workaround:** no user-agent spoofing, stealth, fingerprinting, proxies, CAPTCHA bypass or private endpoints.

| Platform | Intent / share (free link, "You press Post") | Handoff ("You press Post") | Web default | Desktop default | Assisted fill warning risk |
|---|---|---|---|---|---|
| **TikTok** | None on the web. | TikTok Studio (`tiktok.com/tiktokstudio`, then Upload); Web Share to the TikTok app on phones. | Handoff | Assisted if opted in, else handoff | Global ToS bans scripts that interact with the service. Embedded sign-in UNVERIFIED. |
| **Instagram** | None on the web (UNVERIFIED negative). | `instagram.com` (Create); Web Share to the IG app on phones. | Handoff | Assisted if opted in, else handoff | Meta ADC bans scripting actions; Meta has sued posting-automation tools. FB Login blocked in embedded browsers; IG website sign-in UNVERIFIED. |
| **YouTube** | None (UNVERIFIED negative). | `studio.youtube.com` (Create, Upload). | Handoff | Handoff unless the sign-in test passes (unlikely) | Google blocks embedded sign-in; ToS bans automated access. |
| **X** | **Web intent** `x.com/intent/tweet`: text, url, hashtags; **no media**. Free [LIVE]. | Composer (`x.com/compose/post`, UNVERIFIED path). For media posts, open the intent URL (caption prefilled) and hand over the file. | Intent (text/link); intent + file handover (media) | Assisted if opted in, else as web | "Scripting the X website" is banned (permanent suspension). |
| **Facebook** | **`sharer.php?u=`** for link posts (no app ID; works per [3P] reports). The Share Dialog (with `hashtag`) needs a Meta `app_id`, i.e. a Meta developer app; not used unless you approve (I-16). | `facebook.com` composer; Business Suite (deep link UNVERIFIED); Web Share on phones. | Sharer (link posts); handoff (media) | Assisted if opted in, else as web | Same Meta terms; embedded FB Login blocked. |
| **Snapchat** | **Share link** `snapchat.com/share?link=` (URLs only, no review). | `my.snapchat.com` / `profile.snapchat.com` / `snapchat.com/spotlight`; Web Share on phones. | Share link (link-only posts); handoff (media) | Assisted if opted in, else as web | ToS bans "automated or semi-automated means". |

**Rules in every mode**
- A person presses Post every time.
- Every scheduled item becomes a reminder with a one-click action. No exceptions.
- No server-side browser automation. No social passwords, cookies or tokens on the server.
- No CAPTCHA bypass, fingerprint spoofing, stealth, user-agent spoofing, proxies or private endpoints.
- Never mark a target posted on a guess.

---

## F. Cost per 1,000 posts

### Assumptions (all mine; adjust as needed)
- **1,000 posts.** Each post has one **50 MB** video and goes to **3 targets on average** (3,000 targets), so **3,000 reminders** (one push channel each).
- **Retention:** 7 days.
- **Worker requests:** about 150 per post (UI, autosave, part signing, one-click actions, confirmations).
- **Cron:** a sweep every minute (about 43,200 runs a month) plus two daily jobs. This is fixed, not per post. I count each run as a request (Assumption).
- **CPU:** 5 ms per request (Assumption).
- **R2:** 10 MiB browser parts, so about 7 Class A operations per upload. About 4 Class B reads per post (handed-over downloads and probes).
- **D1:** about 60 rows written and 10,000 rows read per post, plus about 10 rows read per sweep run.
- **Web push** sends are outbound requests to the browser vendors' push services. No fee was found for them (UNVERIFIED that none exists).
- Prices are list prices from the Cloudflare docs, **before** included allowances (worst case).

### Cloudflare (variable)
| Item | Quantity | Unit price | Cost |
|---|---|---|---|
| Workers requests | ~0.15 M + ~0.04 M cron | $0.30 / M | $0.06 |
| Workers CPU | ~1 M CPU-ms | $0.02 / M | $0.02 |
| D1 writes / reads | 0.06 M / ~10.4 M rows | $1.00 / M; $0.001 / M | $0.06 + $0.01 |
| R2 storage | 50 GB × 7/30 month = 11.7 GB-month | $0.015 / GB-month | $0.18 |
| R2 Class A | ~7,000 | $4.50 / M | $0.03 |
| R2 Class B | ~4,000 | $0.36 / M | < $0.01 |
| R2 egress (downloads) | — | free | $0.00 |
| Workflows, Queues, Durable Objects | not used | — | $0.00 |
| **Subtotal** | | | **≈ $0.36** |
| Email reminders (optional) | up to 3,000 | 3,000/month free, then $0.35 / 1,000 | $0 – $1.05 |

**Fixed: Workers Paid base $5/month.** It includes 10M requests, 30M CPU-ms, 25B D1 reads and 50M D1 writes. **At 1,000 posts/month, the $5 base covers everything above** except about 1.7 GB-month of R2 above the 10 GB free tier (≈ $0.03).

### Platform costs
| Item | Cost |
|---|---|
| X API | **$0** (not used) |
| X web intent, Facebook sharer, Snapchat share link | $0 (plain links, no keys) |
| TikTok, Instagram, YouTube, Facebook, Snapchat APIs | $0 (not used) |

**Bottom line:** about **$0.36 per 1,000 posts** at list price, all Cloudflare. At 1,000 posts/month the $5 base absorbs all but ≈ $0.03. The only optional variable cost is email (codes and reminders), which needs your approval.

---

## G. Hosted posting API ("bridge") comparison

**Moot under the no-API decision. A bridge is an API that costs money.** The table is kept as research only.

All vendor figures come from search summaries. None were confirmed against live pricing pages.

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

---

## H. What I need from you

Lead times are **not in the research** unless stated. No platform developer accounts, app reviews or API credits are needed.

| # | Item | Needed by | Lead time | Notes |
|---|---|---|---|---|
| 1 | **Cloudflare Workers Paid** ($5/mo), plus an API token for GitHub Actions (Workers, D1, R2 edit), **plus an R2 S3 API token** (Access Key ID + Secret, scoped to the xpost bucket) as Worker secrets | M1 | Minutes | See section C for why Paid. |
| 2 | **GitHub repo** (one repo: `/web`, `/worker`, `/desktop`, `/shared`) + a public releases repo for the updater, and Actions secrets | M1 | Minutes | |
| 3 | **Lemon Squeezy**: new xpost product and variants, store ID, product and variant IDs, API key, webhook secret, webhook URL set to the Worker | M1 | Hours | Plan names, prices, session/device/storage limits per plan. |
| 4 | **Domain** (recommend Cloudflare Registrar) | **Recommended; required by launch** | Hours, then DNS | For email sign-in codes, the update feed and branding. Not needed for any platform. workers.dev is fine for development. |
| 5 | **VAPID keypair** for web push | M4 | Minutes | We generate it; you store the private key as a Worker secret. |
| 6 | Support email address and brand assets (logo, colour) | M2 | — | |
| 7 | **Privacy policy, terms and data-deletion page** for xpost itself | M6 (before launch) | Days (writing) | Needed for Lemon Squeezy and customers, not for platforms. |
| 8 | **Apple Developer Program** (fee not researched; Assumption: ~$99/yr), Developer ID cert, notarytool API key | M7 | Days | Needed for Mac auto-update. |
| 9 | **Windows signing**: Azure Trusted Signing (recommended) or an OV/EV certificate | M7 | Days to weeks | Prices not researched. |
| 10 | **Approval for Email Service** (if you want email codes or email reminders) | M1 (codes) or M4 (reminders) | — | Free up to 3,000/month, then $0.35 per 1,000. Needs the domain. |
| 11 | Decisions in section I | Before M1 | — | |

---

## I. Decisions for you (with my recommendation)

Numbering is kept from the earlier draft so references stay stable.

**Decided**
- **3. Assisted fill (M8). DECIDED: all six platforms (owner, 2026-11-14).**
  - Desktop only, off by default, opt-in per platform after a plain warning naming that platform's risk (X: permanent suspension; Meta: legal action history).
  - The user's own session in an in-app window; the user logs in and presses Post. Sessions never leave the device; Electron cookie-encryption fuse on.
  - Versioned, signed selector config via the updater/feed; remote kill switch per platform; plain-English fallback to handoff when a field can't be filled.
  - Sign-in test first. If a platform blocks sign-in in the in-app window, it uses handoff. No workarounds (no UA spoofing, stealth, fingerprinting, proxies, CAPTCHA bypass, private endpoints).
- **15. No platform APIs. DECIDED (owner, 2026-11-14).** No posting APIs, no platform sign-in connections, no tokens, no developer accounts, no reviews. Nothing posts automatically.

**Still open**
- **4. Stronger sign-in.**
  - **Recommend:** licence key + purchase email + **emailed 6-digit code**. It needs the domain and Email Service (free up to 3,000/month, then about $0.35 per 1,000), so it needs your approval.
  - Add passkeys later as an optional upgrade (free, no email).
  - Until then, key + email only, plus strict rate limits.
- **6. Domain timing.**
  - **Recommend:** buy it before launch (earlier if you want email codes). Keep workers.dev for development and preview.
- **9. Signing budget.**
  - **Recommend:** Apple (Assumption: ~$99/yr) and Azure Trusted Signing at M7. Without them, Mac users cannot auto-update (as in XLISTit). This matters more now: desktop is where assisted fill lives.
- **12. Default limits.**
  - **Recommend** (assumptions; tune per plan): 3 web sessions, 2 desktop devices, 7-day media retention, 7-day desktop offline grace, a storage cap per plan.
- **13. Email reminders.**
  - **Recommend:** off by default, available per user, only if you approve Email Service (it costs money beyond 3,000/month).
- **16. Facebook Share Dialog app ID (optional, small).**
  - The Share Dialog adds a `hashtag` parameter but needs a Meta `app_id`, which means registering a Meta developer app (no review, no API calls).
  - **Recommend:** no. Use `sharer.php` (no app ID). Revisit only if you want the hashtag parameter.

**Moot under the no-API decision**
- 1. Bring-your-own X keys — moot (no X API).
- 2. X cost and link posts — moot (X intent is free; X spend is $0).
- 5. Queue in the engine — moot (no Queue or Workflow needed; section C).
- 7. Instagram login type — moot (no Meta API).
- 8. Bridge or not — moot (a bridge is a paid API; section G).
- 10. TikTok audit — moot.
- 11. YouTube quota — moot.
- 14. Facebook `publish_video` scope — moot.

---

## J. Risks and open UNVERIFIED items

| # | Risk / unknown | Impact | How to settle |
|---|---|---|---|
| 1 | **Assisted fill breaks when a platform changes its upload page** | Fields not filled; user confused | Signed versioned selector feed (fix without a release); per-platform kill switch; fallback to handoff with a plain message; fake-adapter tests for "form changed". |
| 2 | **Account risk to users** who opt in: all six platforms' terms restrict automation (X: permanent suspension; Meta: lawsuits against automation tools) | A user's account could be restricted | Off by default; opt-in per platform after a plain warning naming the risk; user presses Post; no stealth. Document in the README's known limits. |
| 3 | **Platforms that block in-app sign-in** (likely YouTube; Meta blocks FB Login in embedded browsers; TikTok, X, Snap UNVERIFIED) | Assisted fill unavailable there | M8 sign-in test per platform; blocked → handoff, no workaround. |
| 4 | **Web Share API with files** support varies by phone browser | Phone handoff falls back to download + copy | Feature-detect `navigator.canShare({files})`; device tests in M3. |
| 5 | **iOS web push** may need the app installed to the home screen | iPhone users miss push reminders | Device tests in M3/M4; in-app "Ready to post" list; optional email; desktop notifications. |
| 6 | Notifications denied or missed (cron runs can be missed) | Late reminders | Look-back sweep; "Ready to post" list; reminder failure alerts (M9). |
| 7 | Web upload limits differ from the researched API limits | Wrong warnings | Limits in remote config; validation warns, never blocks; check each platform's web uploader in M3. |
| 8 | TikTok web upload duration: 30 vs 60 min (sources conflict) | Wrong warning | Use the stricter value until checked. |
| 9 | Facebook `sharer.php` is legacy ([3P] reports only) | FB link sharing may break | Intent kill switch per platform; handoff fallback. |
| 10 | X intent path (`/intent/tweet` vs `/intent/post`) | Broken intent link | Use the [LIVE] documented `/intent/tweet`; intent kill switch. |
| 11 | Which LS field gives the purchase email for sign-in | Sign-in design | Check the LS API in M1. |
| 12 | FB/IG/YouTube/X web-upload page deep links (UNVERIFIED paths) | Handoff opens a generic page | Keep URLs in remote config; check in M3. |
| 13 | Web push has no fee (UNVERIFIED) | Cost estimate off | Check push-service terms in M4. |
| 14 | Platform policy changes | Modes change | Remote config and kill switches; re-check docs each milestone. |
| 15 | Licence-key or session leak | Unauthorised use | Hashed keys and session IDs, CSRF, rate limits, scrubbed logs, separate signing keys. |

---

## K. Milestones (your build order) and model routing

Routing rule: **Opus** for hard work (schema and migrations; licence, sessions and webhooks; the reminder scheduler; assisted fill; signing and updater; reviews). **Sonnet** for routine work (UI screens, fake adapter, handoff, reminders UI, simple CRUD, README, CI). Every milestone ends with an Opus review by an agent that did not write the code, then a stop for your sign-off.

| M | Scope (your plan) | What changed (no-API decision) | Tasks → model |
|---|---|---|---|
| **M1** Repo, CI, Cloudflare, schema, sign-in | Monorepo `/web` `/worker` `/desktop` `/shared`. CI tests. Actions deploy to workers.dev (Worker + Static Assets). D1 schema v1 + migrations. R2 bucket, CORS (expose `ETag`), lifecycle. Web sign-in: purchase email + licence key via Worker, forked from XLISTit licence code. LS webhook. Sessions, CSRF, rate limits, session/device limits in config. Daily re-validation. Remote config + kill switches. | **Unchanged.** Schema has no platform-account, token or publish tables. Emailed code added once the domain and Email Service are approved (I-4). | Schema, migrations, licence, sessions, webhook → **Opus**. Repo scaffolding, CI, config files → **Sonnet**. |
| **M2** Web UI on the fake adapter | **Platforms & modes** screen (no connections), composer (master + per-platform overrides + platform fields), R2 signed multipart uploads, per-platform validation, schedule (calendar), history and filters, drafts (autosave, duplicate). Light/dark, phone layout. | "Accounts" became "Platforms & modes": nothing to connect. Validation uses Table 3, kept in config. | Upload signing + validation rules → **Opus**. Fake adapter, screens, CRUD routes → **Sonnet**. |
| **M3** Handoff, intents, reminders, "Ready to post" — **the core product** | Handoff for all six. X web intent. Facebook sharer. Snap share link. Reminders. "Ready to post" list. Statuses: waiting for you, handed off, confirmed posted, paste link. | Now the core product, not a fallback. xpost is usable by real users from here, with no approvals. | Handoff, intents, reminders UI, list → **Sonnet**. Review → **Opus**. |
| **M4** Reminder scheduler | D1 source of truth, cron sweep each minute with look-back, conditional claim, web push (VAPID), desktop notification hook, optional email, licence pause, retention cleanup. | **Replaces the publishing engine.** No Workflows, Queues, Durable Objects, idempotent publish, reconcile, platform caps or spend caps. | Scheduler → **Opus**. Extra failure-case tests → **Sonnet**. Review → **Opus**. |
| **M5** API adapters | — | **REMOVED by owner decision** (no APIs). | — |
| **M6** Policy pages | xpost's own privacy policy, terms and data-deletion page. You publish. | **Reduced:** no platform demo scripts or approval pack. Needed for Lemon Squeezy and customers. | Drafts → **Sonnet**. Claims checked against the code → **Opus**. |
| **M7** Desktop app | XLISTit shell, activation + device binding, deactivate in settings, offline grace, offline drafts, local notifications, drag-and-drop, file reveal, update assistant, signed Mac/Win installers, Releases feed. | **Unchanged in scope; more important**, because assisted fill lives here. Cookie-encryption fuse on. New signing key. Signing in CI. Needs Apple + Windows certs (H-8, H-9). | Licence client, updater, signing pipeline → **Opus**. Shell wiring, desktop UI → **Sonnet**. |
| **M8** Assisted fill, all six | Step 1: hands-on in-app sign-in test per platform; blocked platforms (likely YouTube) use handoff, no workaround. Step 2: per-platform fillers, risk warnings and opt-in, kill switches, signed selector feed, post-URL capture, fallback to handoff. | Approved for all six (I-3). | All assisted-fill work → **Opus**. Warning copy, settings UI → **Sonnet**. Review → **Opus**. |
| **M9** Hardening | Monitoring, alerts on failed reminders and cron jobs, README with setup and known limits. | Also: export history, delete my data (if not done earlier), security review, sweep load test. No cost caps needed. | Security, alerts → **Opus**. README → **Sonnet**. |

**No approvals run alongside the build.** Nothing waits on TikTok, Meta, Google, X or Snap.
