# xpost Step 0 research: Cloudflare platform + hosted posting "bridge" APIs

Research date: 2026-11-14.

## How this was sourced (read first)

- **Cloudflare:** `developers.cloudflare.com` was **blocked by this session's network allowlist** (DNS fail). The same pages were read as **MDX source from Cloudflare's official docs repo** (`github.com/cloudflare/cloudflare-docs`, `production` branch, via raw.githubusercontent.com). That repo is what developers.cloudflare.com is built from. The copies are current: they cite changelog entries dated 2026-09-10, 2026-10-30 and 2026-11-04. Each citation below gives the public developers.cloudflare.com URL that matches the source file I read.
- **Bridge vendors:** WebFetch could not reach any vendor site (also blocked), so Part 2 rests on **WebSearch result summaries**. Many of those come from the vendors' own pages or from competitor blogs. Prices and terms in Part 2 are **vendor-reported or third-party, not checked against a live pricing page**, and are marked accordingly. Confirm them before committing.
- To read the vendor sites directly, allow these hosts in the session network settings: `developers.cloudflare.com`, `ayrshare.com`, `zernio.com`/`docs.zernio.com`, `upload-post.com`, `bundle.social`, `outstand.so`, `postproxy.dev`, `blotato.com`, `postiz.com`, `publer.com`, `buffer.com`.

---

# PART 1 — Cloudflare

## 1. Workers

Source: https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/workers/platform/pricing/

| Item | Workers Free | Workers Paid |
|---|---|---|
| Requests | 100,000/day | No limit |
| CPU time per HTTP request | 10 ms | default 30 s, configurable up to **5 min** (`limits.cpu_ms: 300000`) |
| CPU time per Cron Trigger | 10 ms | 30 s if the interval is under 1 hour; 15 min if the interval is 1 hour or more |
| CPU per Queue consumer / Workflow step | 10 ms | default 30 s, configurable to 5 min (the pricing page says max 15 min CPU for Cron/Queue consumer invocations) |
| Memory | 128 MB per isolate (shared by concurrent requests in that isolate) | 128 MB |
| Subrequests per invocation | 50 (1,000 to CF services) | 10,000 by default, configurable up to 10M |
| Simultaneous connections waiting for headers | 6 | 6 |
| Worker size | 64 MiB uncompressed | 64 MiB |
| Startup time | 1 s | 1 s |
| Workers per account | 100 | 500 |
| Cron Triggers per account | 5 | 250 |
| Env vars | 64 per Worker, 5 KB each | 128 per Worker, 5 KB each |

**Inbound request body size** depends on the zone's Cloudflare plan, not the Workers plan: Free 100 MB, Pro 100 MB, Business 200 MB, Enterprise up to 5 GB (self-serve). Larger requests get a 413. No response body limit. URL 16 KB; request and response headers 128 KB each. (limits page)

> Implication for xpost: videos must not go through a Worker on a Free/Pro zone. Upload them **browser → R2 directly via presigned URLs** (multipart for anything large).

**Duration (wall clock)** (limits page; wall-time partial):
- HTTP: no hard limit while the client stays connected. `ctx.waitUntil()` adds at most 30 s after the response or a disconnect.
- Cron Trigger: 15 min. Queue consumer: 15 min. DO alarm: 15 min.
- Workflows: each step has **unlimited wall time** and is bound only by the CPU limit.
- During runtime updates, existing requests get up to 20 min to drain. Long work must tolerate interruption and retry.

**Outbound fetch streaming (R2 → third-party PUT):**
- `fetch()` accepts a `ReadableStream` body. Waiting on I/O does not count as CPU time, so streaming a large object costs little CPU. (limits page, CPU section)
- **Content-Length:** an ordinary stream body is sent with chunked encoding. Pipe the body through a **`FixedLengthStream(length)`** to have the runtime send `Content-Length` instead. Writing too many or too few bytes raises an error. (https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/#fixedlengthstream)
  - Pattern: `const obj = await env.BUCKET.get(key, {range:{offset, length}}); const {readable, writable} = new FixedLengthStream(len); obj.body.pipeTo(writable); await fetch(uploadUrl, {method:'PUT', body: readable, headers:{'Content-Range': ...}})`.
- R2 `get()` supports **ranged reads** (`range: {offset, length}` or `suffix`), which suit chunked or resumable uploads (TikTok FILE_UPLOAD chunks, YouTube resumable). (https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- R2 `put()` with a stream needs a known length: a request body with Content-Length, or a FixedLengthStream. (same page)
- **UNVERIFIED:** whether an R2 object body passed straight to `fetch()` already carries a known length, making FixedLengthStream unnecessary. Use FixedLengthStream to be safe.
- **Outbound body limit:** Cloudflare documents a **100 MiB per-request outbound body limit** for **Durable Objects and Containers**. Streaming and chunked encoding do not get around it. (https://developers.cloudflare.com/durable-objects/platform/limits/#outbound-http-request-body-size) No such limit is documented for plain Workers or Workflows. **UNVERIFIED** whether one applies. Design choice that holds either way: upload to platforms in chunks of 100 MiB or less (TikTok chunked upload, YouTube resumable chunks, Meta resumable).

**Static assets vs Pages:** Cloudflare now tells you to **start new projects with Workers**: "Workers supports most Pages use cases and offers a broader feature set… It is Cloudflare's primary platform for building applications. Start new projects with Workers." (Pages overview note, https://developers.cloudflare.com/pages/ ; migration guide https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- SPA support: `assets.not_found_handling: "single-page-application"`. (migration guide)
- Static asset requests are **free and unlimited**. Limits: 20,000 files per version (Free) or 100,000 (Paid); 25 MiB per file. (pricing and limits pages)
- One Worker can serve the React SPA and the API together.

**Workers pricing (Standard, Paid):** $5/month minimum. 10M requests/month included, then $0.30 per million. 30M CPU-ms/month included, then $0.02 per million CPU-ms. No charge for duration or egress. Subrequests are not billed. (pricing page)

## 2. D1

Source: https://developers.cloudflare.com/d1/platform/limits/ and https://developers.cloudflare.com/d1/platform/pricing/

| Item | Free | Paid |
|---|---|---|
| Max DB size | 500 MB | **10 GB** |
| Storage per account | 5 GB | 1 TB (can be raised) |
| Databases | 10 | 1,000,000 (first 100,000 included, then $0.10/DB/month) |
| Queries per Worker invocation | 50 | 1,000 (a `db.batch()` counts as 1) |
| Time Travel (PITR) | 7 days | **30 days**; max 10 restores per 10 min per DB |
| Max row / string / BLOB | 2 MB | 2 MB |
| SQL statement length | 100 KB | 100 KB |
| Bound params per query | 100 | 100 |
| Columns per table | 100 | 100 |
| Max query duration | 30 s (also covers a whole batch) | 30 s |
| Max query result size | 50 MB (effective 2026-11-04) | 50 MB |

Pricing: Free gets 5M rows read/day, 100k rows written/day, 5 GB total. Paid gets 25B rows read/month included then $0.001 per million; 50M rows written/month included then $1.00 per million; 5 GB included then $0.75/GB-month. No egress charges. Indexes add a write row per write that touches the indexed column. (pricing partial)

## 3. R2

Sources: https://developers.cloudflare.com/r2/platform/limits/ , https://developers.cloudflare.com/r2/objects/upload-objects/ , https://developers.cloudflare.com/r2/api/s3/presigned-urls/ , https://developers.cloudflare.com/r2/buckets/cors/ , https://developers.cloudflare.com/r2/buckets/object-lifecycles/ , https://developers.cloudflare.com/r2/pricing/

- **Object size:** 4.995 TiB max. Single PUT up to 4.995 GiB.
- **Multipart:** parts 5 MiB to 5 GiB, **at most 10,000 parts**. **Every part except the last must be the same size.** Re-uploading a part number replaces it. Incomplete multipart uploads are **aborted after 7 days** by default; a lifecycle rule can change that.
- Key length 1,024 bytes; metadata 8,192 bytes. Writes to the same key are limited to 1 per second (more returns 429).
- **Presigned URLs:** expiry from 1 s to **7 days (604,800 s)**. Supported methods are GET, PUT, HEAD and DELETE. **POST form uploads are not supported.** Presigned URLs work only on the S3 endpoint `<account>.r2.cloudflarestorage.com`, **not on custom domains**. A signed Content-Type can be enforced. URLs can be reused until they expire. The S3 API supports CreateMultipartUpload, UploadPart, CompleteMultipartUpload, AbortMultipartUpload and ListParts. (https://developers.cloudflare.com/r2/api/s3/api/)
- **Browser direct multipart:** the docs do not show presigned UploadPart. **UNVERIFIED in docs, but standard S3 practice:** UploadPart is a PUT carrying `partNumber` and `uploadId` query params, so a Worker can sign one presigned PUT per part. The Worker starts and completes the upload with the R2 binding or the S3 API, and the browser PUTs the parts. Alternative: temporary scoped credentials (https://developers.cloudflare.com/r2/api/s3/temporary-credentials/).
- **CORS is required** for browser use. AllowedOrigins = the app origin; AllowedMethods include PUT; AllowedHeaders include Content-Type and whatever else is sent; **ExposeHeaders must include `ETag`** so the browser can collect part ETags for CompleteMultipartUpload. Expired presigned URLs return 403 **without** CORS headers, so JS cannot read the error. (cors page)
- **Lifecycle:** rules by prefix, such as delete after N days or move to Infrequent Access. 1,000 rules max. Objects are usually deleted within 24 h of expiry. This works for auto-deleting media after posting (e.g. a `tmp/` prefix kept 7 to 30 days).
- **Pricing (Standard):** $0.015/GB-month; Class A (PutObject, CreateMultipartUpload, **UploadPart**, CompleteMultipartUpload, ListObjects…) $4.50 per million; Class B (GetObject, HeadObject…) $0.36 per million. **Egress is free.** Free tier: 10 GB-month, 1M Class A, 10M Class B per month. Infrequent Access: $0.01/GB-month, Class A $9 and Class B $0.90 per million, $0.01/GB retrieval, 30-day minimum. (pricing page)
- The r2.dev public endpoint is rate-limited and not for production. Use a custom domain or Worker for public serving. Platforms such as Instagram and TikTok PULL_FROM_URL need a public URL; TikTok also needs a verified domain.

## 4. Queues

Sources: https://developers.cloudflare.com/queues/platform/limits/ , https://developers.cloudflare.com/queues/platform/pricing/

- Message size **128 KB**. Max consumer batch 100 messages. `sendBatch` takes 100 messages or 256 KB. Max batch wait 60 s.
- Throughput **5,000 messages/s per queue**. Backlog 25 GB per queue. Push consumers: 250 concurrent invocations.
- Retries: up to **100**, default 3. **Dead Letter Queue** supported. `delaySeconds` max **24 hours** on send or retry. Pull `visibilityTimeout` max 12 h.
- Retention: Free fixed at 24 h; Paid 4 days default, configurable up to 14 days.
- Consumer wall time 15 min; CPU configurable to 5 min.
- Pricing: Free 10,000 ops/day. Paid 1M ops/month included, then **$0.40 per million**. One operation = 64 KB written, read or deleted; a typical message costs 3 ops. Each retry is another read. 10,000 queues included.

## 5. Cron Triggers

Sources: https://developers.cloudflare.com/workers/configuration/cron-triggers/ ; limits page.
- Standard 5-field cron in **UTC**. The finest granularity is **every minute** (`* * * * *`).
- 5 per account (Free) or 250 (Paid). Wall time 15 min. CPU 30 s if the interval is under 1 h, 15 min if 1 h or more.
- Adding or changing a trigger can take **up to 15 min to propagate**, and runs can be missed in that window.
- Workflows also offer their own `schedules` (cron expressions on the binding): at most 100 per account, 256 characters each. On Paid, a cron-started Workflow instance gets 1 h per firing without using a concurrency slot. (https://developers.cloudflare.com/workflows/reference/limits/)

## 6. Workflows

Sources: https://developers.cloudflare.com/workflows/reference/limits/ , https://developers.cloudflare.com/workflows/reference/pricing/ , https://developers.cloudflare.com/workflows/build/workers-api/ , https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/ , https://developers.cloudflare.com/workflows/build/events-and-parameters/ , https://developers.cloudflare.com/workflows/build/rules-of-workflows/

| Item | Free | Paid |
|---|---|---|
| CPU per step | 10 ms | 30 s default, configurable to 5 min |
| Wall clock per step | unlimited | unlimited |
| Max steps per instance | 1,024 | **10,000** default, configurable to 25,000 (`sleep` steps don't count) |
| Step result (non-stream) | 1 MiB | 1 MiB (a `ReadableStream` return is allowed for larger output) |
| Event payload | 1 MiB | 1 MiB |
| Persisted state per instance | 100 MB | 1 GB |
| `step.sleep` / `sleepUntil` max | **365 days** | 365 days |
| `waitForEvent` timeout | 1 s to 365 days (default 24 h); **throws on timeout**, so wrap it in try/catch | same |
| Concurrent running instances per account | 100 | **50,000** (instances in `waiting` (sleeping, retry-wait, waitForEvent) **don't count**) |
| Per-Workflow concurrency cap | optional (`concurrency.limit`); the excess is queued, not rejected | same |
| Instance creation rate | 100/s | **300/s per account, 100/s per Workflow** (HTTP 429 when exceeded) |
| Queued instances max | 100,000 | 2,000,000 |
| Retries per step | up to 10,000 | up to 10,000 |
| Completed-state retention | 3 days | 7 days default, configurable to 30 |
| Instance ID | up to 100 chars, `^[a-zA-Z0-9_][a-zA-Z0-9-_]*$` | same |
| Subrequests per instance | 50 | 10,000 default, up to 10M |

- **Default step retry config:** `{retries:{limit:5, delay:10000, backoff:"exponential"}, timeout:"10 minutes"}`. Backoff can be constant, linear or exponential. `delay` can be a **function of the error**, which fits rate-limit and Retry-After backoff. Throwing `NonRetryableError` stops retries. Rollback (compensation) handlers are supported. Cloudflare advises keeping step timeouts at 30 min or less and using `waitForEvent` for longer waits.
- **Idempotency:** steps can be **retried**, and code outside steps can be **re-executed** if the engine restarts. Steps should be idempotent, side effects belong inside `step.do`, and step names must be **deterministic** because the name is the cache key. Before a non-idempotent call, check whether the action already happened. (rules-of-workflows)
- **Custom instance IDs give dedup:** `create({id})` **throws if the ID already exists** and is still within retention. `createBatch({instances:[...]})` **does not throw**; it reports error `10405` (exists) or `10415` (duplicate within the batch). IDs are unique per Workflow. To re-run, use `restart()` or a composite ID such as `target-<id>-v<n>`.
- **Instance control:** `status()`, `pause()`, `resume()`, `terminate()`, `restart({from:{name}})`, `sendEvent({type,payload})`, `deleteBatch` (1 to 100 IDs; deleting a running instance stops it with no rollback).
- **Pricing (Paid):** requests and CPU billed as Workers ($0.30 per million invocations beyond the shared 10M; $0.02 per million CPU-ms). **Steps:** 500,000/month included, then **$0.80 per 100,000**. **Storage:** 1 GB-month included, then $0.20/GB-month. Free plan: 3,000 steps/day, 1 GB-month. Step and storage billing started **10 Aug 2026**. Sleeping or idle instances incur no CPU charge. Retries and rollbacks are not counted as steps. Storage counts sleeping and completed instances until retention ends.

## 7. Durable Objects and the Rate Limiting binding

- **Durable Objects** (https://developers.cloudflare.com/durable-objects/platform/limits/ , /platform/pricing/): one single-threaded object per key, which suits a **per-social-account mutex or token bucket** (e.g. serialising TikTok's roughly 6 req/min posting cap or YouTube quota per channel). SQLite-backed storage is 10 GB per object. CPU is 30 s by default, configurable to 5 min. **Outbound HTTP body is capped at 100 MiB per request.** Paid pricing: 1M requests/month included, then $0.15 per million; 400,000 GB-s included, then $12.50 per million GB-s (billed while active and not hibernatable). SQLite rows are priced like D1. Alarms let a DO wake itself.
- **Rate Limiting binding** (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/): `env.RL.limit({key, delta?})` with `period` of **10 or 60 s only** and a limit **per Cloudflare location**. Counts are **eventually consistent and approximate**; Cloudflare says requests can exceed the limit. Fine for coarse API abuse protection on xpost's own endpoints. **Not suitable** for strict per-platform quotas; use a DO or a D1 counter for those. The binding page shows no separate price (**UNVERIFIED**).

## 8. Scheduling design recommendation

**Options:**
- **A. Cron sweep → Queue → one Workflow per target.**
- **B. Workflows only:** create an instance when the post is scheduled and call `step.sleepUntil(scheduledAt)`.
- **C (recommended): D1 as source of truth + a one-minute cron sweep → `createBatch` one Workflow per (post, target), skipping the Queue.**

**Reasoning:**
- **B** works (sleeps up to 365 days; sleeping instances don't use concurrency). Its costs:
  - **Cancel or reschedule** means `terminate()` plus a new instance with a new composite ID. Alternatively, sleep with `waitForEvent({timeout})` and send `reschedule` or `cancel` events, but a timeout throws and needs try/catch.
  - The state of long-sleeping instances keeps adding to Workflows storage.
  - Instances sleeping for weeks resume on whatever code is deployed at that point. **UNVERIFIED** how versioning interacts with sleeping instances. The determinism rules make code changes across long sleeps risky.
  - Two copies of the schedule (D1 and the Workflow) can drift apart.
- **C** keeps schedule edits as plain D1 updates.
  - Cron fires every minute and selects targets due within the next 1 to 2 minutes with status `scheduled`.
  - It then calls `createBatch` with `id = "<targetId>-<scheduleVersion>"`. Error 10405 gives **free dedup** if a sweep overlaps or repeats.
  - Each instance can `sleepUntil` the exact second, then **re-checks D1** in its first step (cancelled? rescheduled? version still current?) before publishing.
  - Each instance's retries, backoff and polling (e.g. TikTok or Instagram processing status) run as durable steps.
  - Creation rate is 100/s per Workflow, i.e. 6,000 targets per minute per sweep, far beyond MVP scale.
- **A's Queue** mainly buffers fan-out above the creation rate and adds a DLQ. Workflows already provide retries and durable failure state, and `createBatch` handles 429 and dedup. Add a Queue later only if a sweep must start more than about 100 instances per second, or to decouple slow fan-out.
- **Cost at MVP scale:** for 10k posts/month × 4 targets × about 8 steps = 320k steps, Workflows steps are **$0** (within 500k included). Cron at 1/min is about 43k invocations/month, negligible. On Free, the sweep's 10 ms CPU and 3,000 steps/day make it impractical. **Plan on Workers Paid ($5/month).**
- Caveat: cron changes take up to 15 min to propagate, and runs can occasionally be missed. The sweep window should therefore look back as well as ahead: it picks up overdue `scheduled` rows, and the ID dedup makes that safe.

## 9. Email (optional reminders)

Sources: https://developers.cloudflare.com/email-service/ , /email-service/platform/pricing/ , /email-service/platform/limits/
- **Cloudflare Email Service, Email Sending (Beta):** Workers binding (`send_email`), REST API or SMTP. **Workers Paid only** for sending to arbitrary recipients. **3,000 emails/month included, then $0.35 per 1,000.** Sending to *verified destination addresses* in your own account is free on all plans, but that does not help with end users.
- Requires onboarding a sending domain on Cloudflare. New accounts start with a conservative daily quota that rises with reputation. 50 recipients per email; 25 MiB message; must comply with CAN-SPAM, GDPR and CASL (unsubscribe).
- Email Routing (inbound) is free and unlimited.

---

# PART 2 — Hosted social posting APIs ("bridges")

**Caveat:** every figure here comes from WebSearch summaries of vendor pages and third-party or competitor blogs, not from fetching the vendors' current pricing pages. Read all prices as "reported as of late 2026". Everything should be confirmed before use. Snapchat in particular is supported by only a few vendors.

**General mechanics that apply to every bridge:**
- **TikTok:** unaudited Content Posting API clients may only post `SELF_ONLY` (private), with a cap of about 5 users per 24 h. Audited clients can post publicly. Bridges sell access through **their own audited app**. Posting rate is about 6 req/min per user token (reported). Sources: https://www.upload-post.com/tiktok-api/ , https://docs.postiz.com/providers/tiktok , https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post (third-party summaries).
- **YouTube:** uploads from unverified API projects created after 28 Jul 2020 are **locked private** until the project passes Google's YouTube API compliance audit. Bridges route uploads through their audited project. Source: https://developers.google.com/youtube/v3/docs/videos/insert (as summarised); Ayrshare claims an audited project at https://www.ayrshare.com/solutions/google-api-error-403-unverified-app-how-to-fix-the-audit-pipeline/
- **Branding (inference, UNVERIFIED per vendor):** a bridge's "white-label" connect page can carry your logo. The platform's own OAuth consent screen (TikTok, Google, Meta, Snap) still shows the **bridge's registered app name**, because the bridge's client ID is the one being authorised. End users are therefore granting the bridge, a third party, access to their accounts. The bridge holds the OAuth tokens.
- **Data handling:** posting media and captions, plus long-lived platform tokens, sit with the bridge. Its terms typically make you responsible for end-user content and for compliance with platform terms. E.g. Ayrshare's terms bind you to each platform's terms, including YouTube ToS, and include an indemnity for end-user content: https://ayrshare.com/terms . No SOC 2 or DPA details were verified for any vendor.

## Comparison table

| Provider | TikTok | IG | YT | X | FB | Snapchat | Pricing model (reported) | Multi-tenant / white-label / resale | Sources |
|---|---|---|---|---|---|---|---|---|---|
| **Ayrshare** | Yes (UNVERIFIED in my results) | Yes | Yes, via its audited project (vendor claim) | Yes | Yes | **Yes**: Stories, Saved Stories and Spotlight documented | Premium about $149/mo (1 profile); **Launch $299/mo (10 profiles)**; **Business $599/mo (30 profiles)**, then about $8.99/profile for 31–100, $3.49 for 101–500, $2.49 for 500+ (third-party); Enterprise custom. 28-day trial, no free plan | Business or Launch plan needed for "User Profiles" (one per end user), aimed explicitly at "platforms that manage several clients". White-label connect page with your logo; per-profile billing; Enterprise SLA. Tokens held by Ayrshare | https://www.ayrshare.com/docs/multiple-users/business-plan-overview ; https://www.ayrshare.com/docs/apis/post/social-networks/snapchat ; https://social-api.ai/blog/ayrshare-pricing-social-media-api-2026 ; https://www.postzen.dev/blog/best-white-label-social-media-apis ; https://ayrshare.com/terms |
| **Zernio (formerly Late / getlate.dev)** | Yes. Public only on TikTok *Business-app* connections (the default for new connections). Developer-app lane has a shared 24 h cap across all Zernio customers | Yes | Yes | Yes | Yes | **No**: docs say Snap has not approved its app yet | **Per connected account:** accounts 1–2 free, 3–10 $6 each, 11–100 $3, 101–2,000 $1; unlimited posts (per-account publishing caps apply). "Profiles" group accounts per client | Profiles per client are built in. White-label or resale terms **not found** | https://docs.getlate.dev/pricing ; https://docs.zernio.com/platforms/tiktok ; https://docs.zernio.com/platforms/snapchat |
| **Upload-Post** | Yes, own approved app; privacy options incl. PUBLIC_TO_EVERYONE. Free tier excludes TikTok | Yes | Yes | Yes | Yes | Not found | Free (10 uploads, 2 profiles); Basic $24/mo (5 profiles); **Professional $50/mo (25 profiles, white label included)**; Advanced $147 (75); Business $438 (225), then $1/profile. Annual cheaper. "Profile" = one account per platform | White label from Professional, no separate fee. A third-party comparison says its terms **explicitly allow your customers to connect their own accounts** (UNVERIFIED in ToS) | https://www.upload-post.com/pricing/ ; https://www.upload-post.com/whitelabel/ ; https://www.upload-post.com/tiktok-api/ ; https://socialmediascheduler.cc/blog/social-media-posting-api-comparison |
| **bundle.social** | Yes | Yes | Likely (claims 15 platforms; UNVERIFIED) | Yes; **X API usage passed through at X's rates** | Yes | **Yes**: Snapchat Public Profile API, Stories (1 image or MP4) and Spotlight | **Per post, unlimited accounts:** Free 20 posts/mo; Pro $100/mo (10k posts); Business $400/mo (100k posts); Enterprise custom | Pitched at "Social Media API for SaaS". White-label or resale terms UNVERIFIED | https://bundle.social/pricing ; https://bundle.social/social-media-api-for-saas ; https://info.bundle.social/api-reference/platforms/snapchat |
| **Outstand** | Yes (reported) | Yes | Yes | Yes | Yes | Not found | **Per post:** $19/mo includes 3,000 posts, then $0.007/post (to 10k) and $0.005 above; Business about $129/mo for 50k posts (third-party). 12 networks; "Managed Keys" (its approved apps) on 8 of 12, BYO keys otherwise | Unlimited accounts. Resale terms UNVERIFIED | https://www.outstand.so/ ; https://socialmediascheduler.cc/blog/social-media-posting-api-comparison |
| **Postproxy** | Yes | Yes | Yes | Yes (reported cap of 20 posts/account/24 h) | Yes | Not found | Free 10 posts/mo; Agentic $17/mo (5 profiles); **Business $49/mo per "profile group"** (aimed at SaaS and agencies, 20 groups included); Enterprise $399/mo. Unlimited posts on paid plans | Profile groups suit multi-tenant use. Resale terms UNVERIFIED | https://postproxy.dev/pricing/ ; https://postproxy.dev/blog/best-social-media-scheduling-apis-compared/ |
| **Blotato** | Yes | Yes | Yes | Yes | Yes | **No** (vendor rate card lists 9 platforms and says the list is exhaustive) | Starter $29/mo (about 20 accounts), Creator $97, Agency $499 (vendor); other sources list different tiers | Creator and agency focus. Multi-tenant SaaS resale terms not found | https://www.blotato.com/pricing.md ; https://www.blotato.com/blog/tiktok-api-pricing |
| **Postiz** (cloud API, or self-host AGPL) | Yes. Docs warn privacy is forced to SELF_ONLY until *your* app passes audit when self-hosting with your own keys | Yes | Yes | Yes | Yes | Not found | Cloud about $29/mo (5 channels) to $99/mo (100 channels) (third-party). Public API on all plans; create-post endpoint limited to about 100 req/h on cloud. Self-host free, **but you bring your own platform app approvals** | Self-hosting gives no shortcut on platform approvals. Cloud resale unclear | https://docs.postiz.com/public-api/introduction ; https://docs.postiz.com/providers/tiktok ; https://postiz.com/pricing |
| **Publer** | Yes | Yes | Yes | Yes | Yes | Not found | API **only for eligible Business (from about $10/account/mo) and Enterprise (quote)** customers; account connection is dashboard-only (accounts endpoint is read-only) | Built for one org's own accounts, a poor fit for end-user OAuth inside your app | https://publer.com/help/en/article/what-are-publers-plans-and-pricing-15h4yqh/ ; https://www.blotato.com/blog/publer-pricing |
| **Buffer** | Yes | Yes | Yes | Yes | Yes | No | API bundled with plans (about $5–6/channel/mo Essentials; per-key request caps reported). **Personal API keys only**; new third-party app registration closed on the legacy API | A third-party comparison says Buffer **forbids** end-customer reuse. Not a viable multi-tenant bridge | https://buffer.com/resources/social-media-api-multi-platform-posting/ ; https://socialmediascheduler.cc/blog/social-media-posting-api-comparison |
| *Others seen:* Post for Me | – | – | – | – | – | – | From $10/mo (1,000 successful posts, unlimited accounts) | Its white-label option **requires your own platform approvals** | https://socialmediascheduler.cc/blog/social-media-posting-api-comparison |

## Trade-offs (no recommendation)

- **Pricing shape:** per-profile or per-account (Ayrshare, Zernio, Upload-Post, Postproxy) scales with *connected end users*. Per-post (bundle.social, Outstand, Post for Me) scales with *activity*. For a free-tier crossposter with many low-activity users, per-post is cheaper. For a few heavy users, per-account is cheaper. Ayrshare's Business floor of about $599/mo is the highest entry cost. Zernio's free first 2 accounts and $1/account at scale are the lowest per-account.
- **Snapchat** is the scarcest platform: confirmed only for **Ayrshare** and **bundle.social**. Zernio says it is pending Snap approval; Blotato and Buffer do not support it.
- **TikTok public posting** through a bridge depends on the bridge's audited app and its lanes. Zernio documents a *shared* 24 h cap on its developer-app lane, so other customers' usage can affect yours. Each bridge's TikTok UX must still meet TikTok's rules (show the creator's privacy options, etc.). Your UI usually has to implement that, using the bridge's "get creator info / settings" endpoint (e.g. https://docs.upload-post.com/api/get-tiktok-settings).
- **Consent branding and trust:** end users see the bridge's app name on the platform consent screens, and the bridge holds their tokens. That brings vendor lock-in (users must reconnect if you migrate away), extra data processing to disclose in xpost's privacy policy, and a dependency on the bridge's platform standing. A revoked bridge app affects every customer at once.
- **Resale and multi-tenant legality** is clearly productised only by Ayrshare (Business/Launch "User Profiles" for platforms) and Upload-Post (white label from Professional). For the others it is unclear. Buffer and Publer are not designed for it.
- **Cloudflare compatibility:** every bridge is a plain HTTPS JSON API that a Worker or Workflow step can call. Media can be handed over as a **public or presigned R2 URL** instead of streamed. That avoids Worker body and outbound-size concerns, but means generating presigned GET URLs (max 7 days) that the bridge can fetch.
- **Self-host (Postiz)** removes vendor fees but **not** the need for your own TikTok, Google and Meta app reviews, so it gives no shortcut on approvals.
