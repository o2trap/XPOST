# xpost Step 0 research: TikTok and YouTube

Date: 2026-11-14

## How this was researched (read first)

- **Pass 1** used WebSearch extracts from official domains only.
- **Pass 2 (re-verification, 2026-11-14)** used curl to download the live official pages and grep them. Items tagged **[LIVE]** were checked word for word against the page; the quotes are exact. Page dates seen: TikTok Manage OAuth Access Tokens "Last updated November 5, 2026"; TikTok Direct Post and Photo refs "October 27, 2026"; TikTok Get Started, Upload, Media Transfer Guide and Content Sharing Guidelines "August 4, 2026".
- **Starred (\*) items were not re-checked live.** Items marked UNVERIFIED had no official source.

### Pass 2 verified quotes (exact)
1. **YouTube revision history, "November 2, 2026"** [LIVE] (https://developers.google.com/youtube/data/revision_history):
   > "Videos uploaded through the videos.insert method from unverified API projects are no longer restricted to private viewing mode. This change reverses the policy announced on July 28, 2020, which restricted videos uploaded from unverified API projects created after that date to private viewing mode until the project completed an audit."
   - The videos.insert page agrees (https://developers.google.com/youtube/v3/docs/videos/insert): "Videos uploaded from unverified API projects are not restricted to private viewing mode."
2. **YouTube upload quota** [LIVE]:
   - Revision history, "June 1, 2026": "API calls to the videos.insert and search.list methods will be charged to their own respective quota buckets. API calls to all other methods will be charged to the existing quota bucket."
   - videos.insert: "Quota impact: 100 calls per day. A call to this method has a quota cost of 1 unit in the Video Uploads quota bucket."
   - Quota & Compliance Audits page (https://developers.google.com/youtube/data/guides/quota_and_compliance_audits): "Projects that enable the YouTube Data API have a default quota allocation of 100 search.list calls, 100 videos.insert calls, and 10,000 units per day combined for all other endpoints."
   - Revision history, "December 4, 2025": the upload cost changed "from approximately 1600 units to approximately 100 units". This was superseded by the June 2026 bucket.
3. **TikTok token lifetimes** [LIVE] (https://developers.tiktok.com/doc/oauth-user-access-token-management, updated Nov 5 2026): the table lists "Access token 2 hours expires_in" and "Refresh token 180 days refresh_expires_in". It also says "Use them to schedule refreshes rather than hard-coding the lifetimes" and "A refresh request will return a different refresh_token from the one you sent."
   - **Resolution:** 2 h / 180 d is current. The 24 h / 365 d figures come from older Silent Login and legacy pages. Always read `expires_in`.
4. **TikTok `video.upload`** [LIVE]:
   - Get Started - Upload (https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content): "Your app must be approved for the video.upload scope. The target TikTok user must have authorized your app for the video.upload scope."
   - Neither the Upload page nor the Upload reference contains the word "audit" (grep count 0). The private-only and audit text appears only on the Direct Post, Get Started - Direct Post, Photo and Content Sharing Guidelines pages, and those passages describe Direct Post.
   - Upload ref (https://developers.tiktok.com/doc/content-posting-api-reference-upload-video), error `spam_risk_too_many_pending_share`: "There may be at most 5 pending shares within any 24-hour period." The Photo ref repeats this.
   - Caveat: the Photo ref (shared page for DIRECT_POST and MEDIA_UPLOAD) says "All content posted by unaudited clients will be restricted to private viewing mode." Inbox drafts are posted by the user inside TikTok, so I read this as Direct Post only. That reading is inference; confirm with a test in the sandbox.
5. **TikTok PULL_FROM_URL ownership** [LIVE] (https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide):
   - Verification: "add your Domain or URL Prefix property to your application in the URL properties widget … You must have manage or write access to the property."
   - "The media URL must use "https" and should not redirect to another URL."
   - The download "times out one hour after the download task is initiated."
   - Domain: "To verify domain ownership, it is recommended that you add a signature string to the domain's DNS records. Once the ownership of a domain is verified, all paths under that domain or its subdomains are considered owned".
   - URL prefix: "https:// + host + path + /. The host must be a domain and should not be an IP address. Redirections are not followed."
   - The Content Sharing Guidelines add: "The supplied URL must be under the path of a domain or URL prefix API Clients have ownership on."
   - **Cloudflare (inference; TikTok never mentions Cloudflare):**
     - **Yes** for a custom domain on a Cloudflare zone we control, such as `media.xpost.app` as an R2 custom domain or a Worker route. Verify the domain via a DNS TXT record in Cloudflare DNS, or the URL prefix by serving TikTok's signature file from the Worker.
     - **No** for `*.r2.dev` or `*.r2.cloudflarestorage.com` presigned hosts, because we can't add DNS records there.
     - Make sure no 3xx occurs, for example via an R2 redirect rule or a trailing-slash redirect.
     - Whether query-string signed URLs are accepted under a verified prefix is UNVERIFIED. Prefer opaque, unguessable paths, or a Worker that checks a token in the path.

---

## Expected constraints: verdicts

| # | Expected constraint | Verdict | Evidence |
|---|---|---|---|
| T1 | Posts from an unaudited TikTok app stay private (SELF_ONLY) | **CONFIRMED** | "Unaudited API clients can only post contents in SELF_ONLY viewership". Posting to a public account returns 403 `unaudited_client_can_only_post_to_private_accounts`. https://developers.tiktok.com/docs/en/content-posting-api-get-started , https://developers.tiktok.com/doc/content-posting-api-reference-direct-post |
| T2 | Few users can post through an unaudited TikTok app | **CONFIRMED, made specific** | "Unaudited API clients can allow up to 5 users to post in a 24 hour window", and each account must be **set to private** at posting time. Same pages as T1. |
| T3 | Public direct posting needs TikTok's audit | **CONFIRMED** | Lifting the restriction "requires an audit of the client for Terms of Service compliance". The sandbox gives no public posting. https://developers.tiktok.com/docs/en/content-posting-api-get-started , https://developers.tiktok.com/docs/en/add-a-sandbox |
| T4 | Draft upload to the TikTok inbox has a lower bar | **CONFIRMED [LIVE]** (needs scope approval, no audit; 5 pending per 24 h) | Upload mode only needs the app approved for the `video.upload` scope. The creator then finishes and posts in the TikTok app, picking privacy there. [LIVE] The Upload pages never mention an audit; the private-only text is on the Direct Post pages (see Pass 2 #4). App review still applies, including a demo video and a ban on personal or internal-use tools. Uploads also cap at **5 pending shares per 24 h**. https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content , https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post , https://developers.tiktok.com/docs/en/getting-started-faq |
| Y1 | Uploads from an unaudited Google project created after July 2020 are locked private | **CHANGED [LIVE]** | The YouTube Data API revision history, entry dated **2 November 2026**, says videos uploaded through `videos.insert` from unverified API projects are **no longer restricted to private viewing mode**. This reverses the 28 July 2020 policy. [LIVE] The videos.insert page agrees. https://developers.google.com/youtube/data/revision_history , https://developers.google.com/youtube/v3/docs/videos/insert |
| Y2 | YouTube upload quota is per project, so all customers share it | **CONFIRMED, but the units CHANGED [LIVE]** | Quota is still per Cloud project. Since **1 June 2026**, `videos.insert` draws on its own **"Video Uploads" bucket**: **1 unit per call, default 100 calls/day per project**. Before that it was about 1600 units, then about 100 units from Dec 2025, out of the shared 10,000/day. Everything else stays in a 10,000-unit/day bucket. **All xpost users together get about 100 uploads/day** until an audit raises the limit. [LIVE] https://developers.google.com/youtube/v3/docs/videos/insert , https://developers.google.com/youtube/data/revision_history , https://developers.google.com/youtube/data/guides/quota_and_compliance_audits |
| Y3 | Google blocks sign-in from embedded or automated browsers | **CONFIRMED [LIVE policy text]** | OAuth policy: the developer "must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control" (error `403 disallowed_useragent`, fully enforced since 30 Sep 2021). Separately, Google has blocked **account sign-in from embedded browser frameworks such as CEF** since June 2019, because it cannot tell those sign-ins apart from MITM phishing. Electron is Chromium-embedded, so treat it as blocked. That Electron is detected specifically is my inference, not stated in an official source. https://developers.google.com/identity/protocols/oauth2/policies , https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/ , https://security.googleblog.com/2019/04/better-protection-against-man-in-middle.html , https://support.google.com/accounts/answer/16668185 |

---

## TikTok

### 1. Posting APIs and content types
- **Content Posting API** has two modes ([product page](https://developers.tiktok.com/products/content-posting-api/)):
  - **Direct Post** (`video.publish` scope) publishes straight to the profile. Video: `POST /v2/post/publish/video/init/`. [Direct Post ref](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
  - **Upload** (`video.upload` scope) sends the media to the creator's TikTok inbox as a draft. The creator opens the notification, edits and posts. Video: `POST /v2/post/publish/inbox/video/init/`. [Upload ref](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video)
- **Photo / carousel:** `POST /v2/post/publish/content/init/` with `media_type=PHOTO` and `post_mode` set to `DIRECT_POST` or `MEDIA_UPLOAD` (inbox). Up to **35 images** in `photo_images`. Photos accept **PULL_FROM_URL only**. MEDIA_UPLOAD needs TikTok app version 31.8 or later. [Photo ref](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post)
- **Status polling:** `POST /v2/post/publish/status/fetch/`. States include `SEND_TO_USER_INBOX` and `PUBLISH_COMPLETE`. [Get Post Status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)
- The old Share Video API (web) reached end of life on **10 Sep 2023** and was replaced by Content Posting. [Migration notice](https://developers.tiktok.com/bulletin/migration-notice-share-video-api/)

### 2. Access needed
- Register the app, add the Content Posting API product with Login Kit, and pass **app review** for the scopes. Review needs a demo video of the full flow (max 5 videos, 50 MB each). A first-time app must demo in a **sandbox**. [App Review FAQ](https://developers.tiktok.com/docs/en/getting-started-faq), [App Review Guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines)
- The app must serve a wide audience. "A utility tool to help upload contents to the account(s) you or your team manages" is listed as unacceptable. [Developer Guidelines](https://developers.tiktok.com/docs/en/our-guidelines-developer-guidelines)
- **Public Direct Post** additionally needs the **Content Posting audit**, a Terms of Service compliance audit (T3).
- The API itself has no paid tier. Personal and business accounts are not distinguished in what I found (UNVERIFIED).

### 3. Unaudited app: what it can and cannot do
- Direct Post: SELF_ONLY only, up to **5 posting users per 24 h**, and target accounts must be private (T1, T2).
- Posts made while unaudited stay private after the audit. Only a secondary source says this ([adaptlypost](https://adaptlypost.com/blog/why-does-my-app-need-approval-post-tiktok)); UNVERIFIED officially.
- Upload (draft) mode: no private-only rule found, and the user chooses privacy inside TikTok\*. There is a pending-share cap of 5 per 24 h ([Photo ref](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post)).
- `reached_active_user_cap` error: the client's daily quota of active publishing users is reached. [Direct Post ref](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)

### 4. Official draft/share route where the user presses Post
- **Yes.** Content Posting **Upload** mode (video) and **MEDIA_UPLOAD** (photo) put a draft in the creator's TikTok inbox. The user taps the notification, edits in TikTok's own flow and presses Post. TikTok advises telling users to check the inbox notification. [Get Started - Upload](https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content)
- **Share Kit** exists only as mobile SDKs (iOS and Android). The Share Kit product page points web apps to the Content Posting API. [Share Kit](https://developers.tiktok.com/products/share-kit)
- This is the best non-audited production path for xpost: draft to inbox, user posts from the phone.

### 5. Web upload page and embedded sign-in
- Upload via **TikTok Studio**: `https://www.tiktok.com/tiktokstudio`, then Upload. The direct path `https://www.tiktok.com/tiktokstudio/upload` is commonly used but UNVERIFIED in official docs. Web upload allows MP4/WebM, 720x1280 or higher, up to 30 min (Creator Academy says 60), under 10 GB. Sources: https://support.tiktok.com/en/using-tiktok/creating-videos/creator-tools-on-tiktok and https://support.tiktok.com/en/using-tiktok/creating-videos/making-a-post
- **Embedded sign-in:** I found **no official TikTok statement** that blocks or allows tiktok.com login in an embedded window (UNVERIFIED). Login Kit for Desktop uses the system browser with a loopback redirect. [Login Kit Desktop](https://developers.tiktok.com/doc/login-kit-desktop/)

### 6. Terms on automation outside the API
- **US ToS §3.4:** users may not "scrape, crawl, export or otherwise extract any data or content … from the Platform using any automated system or software, including automated 'bots,' except as approved in writing." https://www.tiktok.com/legal/page/us/terms-of-service/en
- **Global/ROW ToS:** users may not "use automated scripts to collect information from or otherwise **interact with** the Services". https://www.tiktok.com/legal/page/global/terms-of-service/en , https://www.tiktok.com/legal/page/row/terms-of-service/en
- **EEA ToS:** bans extracting data with any automated system "not provided by TikTok or approved in writing". https://www.tiktok.com/legal/page/eea/terms-of-service/en
- **Developer Terms:** automated means are allowed only against the Developer Services, "as described" in the documentation. Reverse engineering and circumventing access restrictions are banned. https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en
- **Takeaway:** a script that fills TikTok's web upload form is "automated scripts … interact with the Services" under the global ToS. Pressing Post yourself does not clearly cure that. The US wording is narrower, covering extraction only. Treat assisted fill as **not allowed** without legal sign-off.

### 7. How media gets in
- **PULL_FROM_URL:** the URL must be https with no redirects (3xx is invalid) and stay reachable for the whole download, which **times out 1 h** after start. You must **verify ownership of the domain or URL prefix** in the developer portal. Domains use a DNS TXT signature and cover all subdomains and paths. URL prefixes use an uploaded signature file and cover that exact prefix. Unverified URLs return 403 `url_ownership_unverified`. [Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
  - For xpost, serve media from a **dedicated verified domain** such as `media.<xpost-domain>`, for example an R2 custom domain, with no redirects and signed URLs valid for at least 1 h. Presigned R2 URLs on `*.r2.cloudflarestorage.com` cannot be verified as yours (inference).
- **FILE_UPLOAD (video only):** init returns `upload_url`, then PUT chunks. Chunks are **5–64 MB**, the final one up to 128 MB, with 1–1000 chunks. Files under 5 MB go up in one piece. [Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
- Photos: PULL_FROM_URL only.

### 8. Limits
- **Video:** MP4 (recommended), WebM, MOV. Codecs H.264 (recommended), H.265, VP8, VP9. **Max 4 GB**. API max duration 10 min, but the per-creator limit comes from `max_video_post_duration_sec` in creator_info. All creators get 3 min; some get 5 or 10. [Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide), [Get Started - Upload](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content)
- **Photo:** JPEG or WebP, max 1080p, max 20 MB each, up to 35 images. [Photo ref](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post)
- **Text:** [LIVE] photo title "maximum length for photo posts is 90 in UTF-16 runes" and description "4000 in UTF-16 runes" (Photo ref). Video `title` (the caption) in Direct Post: "The maximum length is 2200 in UTF-16 runes." (Direct Post ref).
- **Video frame and size** [LIVE, Media Transfer Guide]: 23–60 FPS, 360–4096 px for both height and width. Files over 64 MB must be chunked, and chunks are uploaded sequentially. TikTok's ingress for pulls reaches 100 Mbps.
- **Rate limit:** 6 requests/min per user access_token on the init endpoints, a 1-min sliding window, then HTTP 429 `rate_limit_exceeded`. [Direct Post ref](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), [Rate Limits](https://developers.tiktok.com/docs/en/tiktok-api-v2-rate-limit)
- **Per-creator cap:** "typically around **15 posts per day** per creator account, shared across all API Clients using Direct Post". Hitting it returns `spam_risk_too_many_posts`, and creator_info returns that code with HTTP 200, so check the field. [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
- **Tokens:** [LIVE, resolved] the current page (updated 5 Nov 2026) gives an **access token of 2 h and a refresh token of 180 days**. Older Silent Login and legacy pages say 24 h / 365 d and are outdated. Use `expires_in` and `refresh_expires_in` from the response. **Refresh tokens rotate**, so store the new one on every refresh. Auth codes are single use and expire in 5 min. [Token mgmt](https://developers.tiktok.com/docs/en/oauth-user-access-token-management), [Legacy guide](https://developers.tiktok.com/docs/en/legacy-user-access-guide)

### 9. Required posting UX (for audit, Direct Post)
From the [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines) and [Query Creator Info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info):
1. **Creator info query** (`POST /v2/post/publish/creator_info/query/`) runs before rendering the post page. Show the creator's nickname and avatar, and honor `max_video_post_duration_sec`, `privacy_level_options` and the comment/duet/stitch-disabled flags. Stop if the creator cannot post (`spam_risk_too_many_posts` and similar).
2. **Privacy dropdown** built from `privacy_level_options` with **no default value**. The user must pick one. A value outside the options returns 403 `privacy_level_option_mismatch`.
3. **Interaction toggles** for Comment, Duet and Stitch. Grey out any the creator has disabled. [LIVE] "Users must manually turn on these interaction settings and none should be checked by default." Photos show only 'Allow Comment'.
4. **Commercial content disclosure** toggle, off by default, with "Your Brand" and "Branded Content" options. Disable Publish if the toggle is on but nothing is selected. Branded Content cannot be "Only me", so disable SELF_ONLY.
5. **Consent declaration** before the Publish button: "By posting, you agree to TikTok's Music Usage Confirmation", plus "Branded Content Policy" when Branded Content is selected.
6. **Preview** [LIVE]: "API Clients should display a preview of the to-be-posted content." Preset text and hashtags must be editable. No watermarks or logos. "API Clients must only start sending content materials to TikTok after the user has expressly consent to the upload." The page must show the creator's nickname and check the duration against `max_video_post_duration_sec`.
6b. **Disclosure labels** [LIVE]: "Your brand" shows "Your photo/video will be labeled as 'Promotional content'". "Branded content" shows "…labeled as 'Paid partnership'". Branded content cannot be "only me": either disable that option, or auto-switch the post to public and tell the user.
6c. **Intended use** [LIVE]: "An app that copies arbitrary contents from other platforms to TikTok" is not acceptable. Position xpost as authoring original content once, not reposting from other platforms.
6d. **Creator cap** [LIVE]: "There will be a 24-hour active creator cap for each API client based on the usage estimates provided in the audit application form."
7. After posting, tell the user that processing can take minutes, and poll the status.

### 10. OAuth
- **Web:** Login Kit for Web, server-side code exchange using the client secret. Redirect URIs: **up to 10**, under 512 chars, absolute **https**, static, **no query parameters and no fragments**. Put per-request data in `state`. PKCE is listed for desktop and mobile, not web. [Login Kit Web](https://developers.tiktok.com/docs/en/login-kit-web), [Overview](https://developers.tiktok.com/docs/en/login-kit-overview)
- **Desktop (Electron):** **PKCE required**. The redirect must be `localhost` or `127.0.0.1` with a port; a wildcard port is allowed and http is OK. Open the system browser. [Login Kit Desktop](https://developers.tiktok.com/doc/login-kit-desktop/)
- **Scopes:** `user.info.basic`, plus `video.publish` (Direct Post, also needed for creator_info) and/or `video.upload` (inbox drafts). [Scopes](https://developers.tiktok.com/docs/en/tiktok-api-scopes)

### TikTok mode recommendation
| Mode | Viable / allowed? | Why |
|---|---|---|
| **API Upload (inbox draft)** | **YES. Primary at launch.** | Official, only needs `video.upload` review, and the user presses Post in TikTok. Caps: 5 pending shares per 24 h. Needs a verified media domain for PULL_FROM_URL, or use FILE_UPLOAD. |
| **API Direct Post** | **YES after audit.** Pre-audit it is only good for internal testing (5 users, SELF_ONLY). | Build the full required UX from day 1 so the audit can pass. |
| **Handoff** (open TikTok Studio upload in the user's normal browser, copy caption, reveal file) | **YES** | No automation; the user does everything. |
| **Assisted fill** (in-app window) | **NO, don't build** | Global ToS bans "automated scripts to … interact with the Services". Embedded login is unverified. The inbox draft route already gives a "user presses Post" flow. |

---

## YouTube

### 1. Posting APIs and content types
- **YouTube Data API v3 `videos.insert`** uploads a video with its snippet (title, description, tags, categoryId) and status (privacyStatus, publishAt, `selfDeclaredMadeForKids`, `containsSyntheticMedia`). [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [Videos resource](https://developers.google.com/youtube/v3/docs/videos)
- **Shorts:** there is no separate API or flag. A square or vertical video **up to 3 minutes** uploaded on or after 15 Oct 2024 is classified as a Short automatically. [Help: 3-min Shorts](https://support.google.com/youtube/answer/15424877)
- If privacyStatus is omitted the upload defaults to **public**, though some creator settings can force private. [revision history](https://developers.google.com/youtube/data/revision_history)
- Thumbnails (`thumbnails.set`) and playlists are separate calls. Community/photo posts have **no public API** (UNVERIFIED; none found).

### 2. Access needed
- A Google Cloud project with the YouTube Data API enabled and an OAuth consent screen.
- **OAuth app verification:** an unverified app showing YouTube scopes gets the "unverified app" warning and a **100-user cap**. In Testing status, refresh tokens expire after **7 days**. Whether `youtube.upload` is classed "sensitive" or "restricted" was not confirmed in this pass; I believe sensitive (UNVERIFIED). Either way **brand and scope verification is needed for public launch**. [Manage App Audience](https://support.google.com/cloud/answer/15549945), [App state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- **YouTube API Compliance Audit** is required only for **quota above the default**, and again when the use case changes. Use the "YouTube API Services – Audit and Quota Extension Form". [Quota & Compliance Audits](https://developers.google.com/youtube/data/guides/quota_and_compliance_audits), [form](https://support.google.com/youtube/contact/yt_api_form)
- No paid tier.

### 3. Unaudited / unverified project: what it can and cannot do
- **Since 2 Nov 2026 it can upload public videos** (Y1 CHANGED).
- It is limited to the **default quota**: 100 `videos.insert` per day per project, 100 `search.list`, and 10,000 units for everything else (Y2).
- Without OAuth verification: a 100-user cap plus a warning screen, or 7-day tokens in Testing.
- Channel-level limits still apply. Unverified YouTube channels can only upload up to 15 min. [Help: longer than 15 min](https://support.google.com/youtube/answer/71673)

### 4. Official draft / intent route
- **None found.** YouTube has no documented "share to YouTube with prefilled metadata" web intent and no draft inbox (UNVERIFIED as a negative).
- The closest API equivalent: upload with `privacyStatus=private` (or `unlisted`), or schedule with `publishAt`, and let the user flip it to public in Studio. That makes the user's action the publish step. Mobile apps can use OS share sheets to the YouTube app (outside scope).

### 5. Web upload page and embedded sign-in
- Upload page: `https://studio.youtube.com`, then CREATE, then Upload videos. `https://www.youtube.com/upload` redirects there; that redirect is from prior knowledge\*. Up to 15 files per batch. Closing early saves the video as private. [Help: Upload videos](https://support.google.com/youtube/answer/57407)
- **Embedded window:** Google forbids OAuth in embedded user-agents (`disallowed_useragent`) and blocks Google **account sign-in** in embedded frameworks such as CEF (since 2019). An Electron BrowserWindow loading accounts.google.com should be expected to fail with "This browser or app may not be secure", or Google may block it at any time. See Y3 sources. Workarounds such as user-agent spoofing are exactly the stealth this project bans.
- Google's fix: sign in in the **system browser** (loopback redirect plus PKCE for desktop). [OAuth for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)

### 6. Terms on automation outside the API
- **YouTube ToS:** users may not "access the Service using any automated means (such as robots, botnets or scrapers)". The only exceptions are public search engines following robots.txt, YouTube's prior written permission, or where law permits. https://www.youtube.com/static?template=terms
- **YouTube API Services Developer Policies:** API clients must not "directly or indirectly, scrape YouTube Applications or Google Applications", nor encourage or enable it. https://developers.google.com/youtube/terms/developer-policies
- **Takeaway:** scripting the YouTube Studio form is not allowed.

### 7. How media gets in
- **Resumable upload** (recommended): `POST …/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` with `X-Upload-Content-Length` and `X-Upload-Content-Type`. The `Location` header gives the session URI. Then PUT bytes, in chunks that are **multiples of 256 KB** (except the last) and consistent in size. Resume with an empty PUT carrying `Content-Range: bytes */N`. [Resumable Uploads](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol)
- Simple and multipart uploads also exist. There is **no pull-from-URL**: your server or client must push the bytes.
- For Workers: stream from R2 into a resumable session in chunks. Workers' memory and CPU limits mean chunked PUTs per request, or hand the session URI to the client or desktop app to upload directly (an architecture note, not from docs).

### 8. Limits
- **File:** max **256 GB**. MIME `video/*` or `application/octet-stream`. [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- **Duration:** 15 min by default and up to 12 h for verified channels. The 12 h figure is prior knowledge, UNVERIFIED this pass. [Help](https://support.google.com/youtube/answer/71673)
- **Shorts:** 3 min or less, square or vertical. Music in Shorts is generally limited to 90 s. [Help](https://support.google.com/youtube/answer/15424877)
- Recommended codecs and containers: see YouTube Help "supported file formats" (UNVERIFIED this pass).
- **Text:** title up to **100 characters**. Description up to **5000 bytes** (bytes, not chars). Tags total up to **500 characters**; commas count, and a tag containing spaces counts as if quoted. `<` and `>` are invalid in title and description. [Videos resource](https://developers.google.com/youtube/v3/docs/videos)
  - Required Minimum Functionality: a client **must not set a shorter max length** than YouTube's for a field. [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)
- **Quota:** `videos.insert` costs **1 unit in the Video Uploads bucket, default 100 calls/day per project**. Other methods share 10,000 units/day. Quota resets at midnight Pacific. The reset time is secondary-sourced. [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [revision history](https://developers.google.com/youtube/data/revision_history)
- **Channel daily upload limit** exists ("Daily upload limit reached", try again in 24 h); the number is unpublished. [Help: Common uploading errors](https://support.google.com/youtubecreatorstudio/answer/10383400)
- **Tokens:** Google access tokens last about 1 h. Prior knowledge, not re-verified\*. Refresh tokens are long-lived in Production, but in **Testing they expire in 7 days** ([Manage App Audience](https://support.google.com/cloud/answer/15549945)). They are revoked on password change or user revoke, and there is a per-client limit on live tokens (prior knowledge\*).

### 9. Compliance UX / audit requirements
From the [Developer Policies](https://developers.google.com/youtube/terms/developer-policies), [Compliance guide](https://developers.google.com/youtube/terms/developer-policies-guide) and [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality):
- Show and link the **YouTube Terms of Service** and **Google Privacy Policy**, and keep your own privacy policy with a contact address.
- Give users an easy, clearly explained way to **revoke access**, and delete their API data within **30 days** of revocation. Do not keep data indefinitely.
- [LIVE, RMF] An upload UI must offer `snippet.title` ("Required", max 100 chars, no `<` or `>`) and `status.privacyStatus` ("Required. … Users must be able to choose whether the uploaded video will be public, private, or unlisted."). **RMF does NOT list made-for-kids or synthetic-media as required** (resolved). Still expose them as good practice, since COPPA makes made-for-kids matter.
- YouTube may audit at any time. Changing the use case requires a new audit.
- Plus Google OAuth verification: a domain-verified homepage, privacy policy, and a demo video of scope use.

### 10. OAuth
- **Scope:** `https://www.googleapis.com/auth/youtube.upload` is the minimal upload-only scope. Add `youtube.readonly` to show the channel name and avatar, or `youtube` / `youtube.force-ssl` for thumbnails and playlists. [videos.insert sample](https://developers.google.com/youtube/v3/docs/videos/insert)
- **Web (Workers):** server-side code flow with `access_type=offline` and `prompt=consent` to get a refresh token. PKCE is supported. Redirect URIs must be registered exactly and be https, except localhost. The exact-match and https rule is prior knowledge\*.
- **Desktop (Electron):** use a **Desktop app** client, a **loopback IP redirect** (`http://127.0.0.1:<port>` or `http://[::1]:<port>`), and the **system browser**. [LIVE] "Always use PKCE". CORRECTION: the live page says only "Custom URI schemes are no longer supported on Android and Chrome apps"; it does not say desktop. Loopback is still the recommended desktop option, and OOB is gone. [OAuth for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app), [Loopback migration](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration)

### YouTube mode recommendation
| Mode | Viable / allowed? | Why |
|---|---|---|
| **API (videos.insert, resumable)** | **YES. Primary.** | Public uploads now work without an audit (Nov 2026 change), but the project-wide quota is 100 uploads/day. **File the Audit and Quota Extension Form early.** Complete OAuth verification before public launch. |
| **"Draft-like" via API** (upload as private or scheduled; user publishes in Studio) | **YES** | Official API with a user-confirmed publish. Useful as a fallback while quota is tight, but it still uses quota. |
| **Handoff** (open studio.youtube.com in the user's normal browser, copy title and description, reveal file) | **YES. Required as overflow** when the shared quota is exhausted. | No automation. |
| **Assisted fill** (in-app Electron window) | **NO, don't build** | Google blocks sign-in in embedded frameworks and forbids OAuth there. Getting around it would need UA spoofing (banned). The YouTube ToS bans automated access, and the Developer Policies ban scraping. |

---

## Open items: status after pass 2
1. TikTok token lifetimes: **RESOLVED** [LIVE]. 2 h access, 180 d refresh, and refresh tokens rotate.
2. Unaudited restrictions on Upload (inbox) mode: **mostly resolved** [LIVE]. The Upload docs require only `video.upload` approval and cap pending shares at 5 per 24 h; no audit text appears there. The Photo page's blanket "unaudited … private" note is ambiguous, so confirm with a sandbox test.
3. TikTok caption limit: **RESOLVED** [LIVE]. 2200 UTF-16 runes for video and 90/4000 for photo title/description. Toggles are off by default.
4. YouTube private-lock removal and upload bucket: **RESOLVED** [LIVE], with exact quotes above.
5. Whether `youtube.upload` is sensitive or restricted: **still UNVERIFIED**. Google's restricted-scope verification page mentions YouTube only for the demo video, not as a restricted scope. YouTube scopes are not known to be restricted (they would need a CASA assessment). Plan for sensitive-scope verification.
6. YouTube RMF and made-for-kids/synthetic-media controls: **RESOLVED** [LIVE]. They are not required; only title and privacyStatus are.
7. Also re-checked [LIVE]:
   - Google OAuth policy: "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control. Embedded user-agents include, but are not limited to, software libraries that allow a developer to insert arbitrary scripts, alter the default routing of a request to the Google OAuth server, or access session cookies." (https://developers.google.com/identity/protocols/oauth2/policies). An Electron BrowserWindow with preload or injected scripts fits this definition exactly.
   - YouTube ToS: no access "using any automated means (such as robots, botnets or scrapers) except (a) in the case of public search engines, in accordance with YouTube's robots.txt file; or (b) with YouTube's prior written permission" (https://www.youtube.com/static?template=terms).
   - TikTok Login Kit Desktop (https://developers.tiktok.com/doc/login-kit-desktop): "TikTok requires the Proof Key for Code Exchange (PKCE) protocol for desktop apps"; "Only localhost or loopback IP 127.0.0.1 are allowed host names"; "URIs must have a port number, and wildcard port number (*) is supported"; max 10 URIs.
8. Still UNVERIFIED: whether TikTok web login works in an embedded window (no official statement), and the direct URL `tiktok.com/tiktokstudio/upload`.
