# xpost Step 0 research: Instagram and Facebook (Meta)

Research date: 2026-11-14. Scope: Instagram and Facebook only.

## How this was researched, and how much to trust it

- **developers.facebook.com is blocked in this session.** The network proxy refused it (HTTP 403 on CONNECT, checked with curl and WebFetch). No Meta docs page could be read directly.
- All evidence below comes from **WebSearch result summaries**. Most of them summarise official Meta pages (developers.facebook.com / developers.secure.facebook.com, help.instagram.com). Those summaries are reliable but not verbatim. Third-party claims are labelled.
- Labels used:
  - **[OFFICIAL-via-search]**: an official Meta URL was in the results, and the summary quoted or paraphrased it.
  - **[3P]**: third-party source only.
  - **UNVERIFIED**: not confirmed at all.
- **Before implementing**, allow `developers.facebook.com` in the environment network settings and re-check the numbers marked 3P or UNVERIFIED. Priority: the IG publish cap, video specs and IG Login PKCE.

---

## VERIFICATION UPDATE: live official pages (2026-11-14, second pass)

developers.facebook.com became reachable. I read these pages directly as `.md`; they are **[DIRECT]** citations. This section **supersedes** any conflicting statement further down.

Pages read:
- CP = https://developers.facebook.com/documentation/instagram-platform/content-publishing
- MEDIA = https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
- CPL = https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit
- BL = https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login
- RU = https://developers.facebook.com/documentation/instagram-platform/content-publishing/resumable-uploads
- OV = https://developers.facebook.com/documentation/instagram-platform/overview
- UL = https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login (plus `/authentication` and `/permissions`)
- AR = https://developers.facebook.com/documentation/instagram-platform/app-review
- FBR = https://developers.facebook.com/documentation/video-api/guides/reels-publishing
- FBV = https://developers.facebook.com/documentation/video-api/guides/publishing
- PP = https://developers.facebook.com/documentation/pages-api/posts
- PVREF = https://developers.facebook.com/docs/graph-api/reference/page/videos/
- SD = https://developers.facebook.com/documentation/sharing/reference/share-dialog
- ADC = https://developers.facebook.com/documentation/development/terms-and-policies/automated-data-collection
- OIDC = https://developers.facebook.com/documentation/facebook-login/guides/advanced/oidc-token

### Instagram, resolved or changed
1. **NEW: a third setup, "Instagram API with Unified Login", is now recommended for new integrations.** Source: OV, UL.
   - Per UL, "New Instagram API features are released only for this setup."
   - The user logs in with Instagram **or** Facebook. No Facebook Page is needed, but a **business portfolio is required**.
   - It is built on Facebook Login for Business with a `config_id`, and uses the `instagram_*` permissions (`instagram_basic`, `instagram_content_publish`, which UL says covers "Publish posts, reels, stories, and carousels").
   - The token is a **Business Integration System User Access Token** owned by the client's business portfolio. Its expiry is set by the configuration and it can be refreshed through the BISU Token Management API, which needs `business_management`.
   - The code exchange uses the Meta app ID and secret at `graph.facebook.com/v27.0/oauth/access_token`. The host is `graph.facebook.com`.
   - **Effect on xpost:** the business-portfolio requirement may exclude casual creators. Instagram Login (no portfolio, no Page) is still the lowest-friction route for individual creators. Offer Unified Login as an option, or for business users.
2. **Account types: CONFIRMED.** Professional accounts only, "business and creator accounts". Source: OV.
3. **Daily cap: Meta's own docs are inconsistent.**
   - CP "Rate Limit" section: "**100** API-published posts within a 24-hour moving period. Carousels count as a single post", enforced on `media_publish`.
   - CP carousel section: "Accounts are limited to **50** published posts within a 24-hour period".
   - CPL: `quota_total` "(currently `50`)", `quota_duration` 86400.
   - **Read `config.quota_total` at runtime.** Design for 50.
   - Also new: **400 containers per rolling 24 h** per account. Source: MEDIA.
4. **Carousel: CHANGED from 10 to up to 20 items.** Images, videos or a mix. All items are cropped to the first item's aspect ratio (default 1:1). No caption on the children. Source: CP, MEDIA.
5. **Caption limits: CONFIRMED.** "Maximum 2200 characters, 30 hashtags, and 20 @ tags." `collaborators` takes up to 3 (feed, Reels, carousel; not Stories). `alt_text` takes up to 1000 characters, images only. Source: MEDIA.
6. **Image specs:** JPEG only (no MPO/JPS), 8 MB max, aspect ratio 4:5 to 1.91:1, width 320–1440 (rescaled to fit), converted to sRGB. Source: CP, MEDIA.
7. **Reels specs: CONFIRMED.** Source: MEDIA.
   - Container MOV or MP4 (moov atom at the front, no edit lists).
   - Video HEVC or H264, progressive, closed GOP, 4:2:0; 23–60 fps; max 1920 px wide; aspect 0.01:1 to 10:1 (9:16 recommended); VBR up to 25 Mbps.
   - Audio AAC up to 48 kHz, mono or stereo, 128 kbps.
   - **3 s to 15 min, 300 MB.** The cover image is JPEG, 8 MB.
   - MEDIA states the container line verbatim: "MOV or MP4 (MPEG-4 Part 14), no edit lists, moov atom at the front of the file". For xpost this means transcoding with `-movflags +faststart` and no edit lists.
8. **Story specs: RESOLVED.** Source: MEDIA.
   - Image: JPEG, 8 MB, 9:16 recommended.
   - Video: same codecs as Reels, aspect 0.1:1 to 10:1, **3–60 s, 100 MB**.
   - `user_tags` are supported on Stories (since July 2025).
9. **Stories "business accounts only": CHANGED / no longer stated.** The current CP and MEDIA pages list Stories with no account-type restriction. UL says `instagram_content_publish` covers stories.
10. **Resumable upload: CHANGED.** `rupload.facebook.com/ig-api-upload/<ver>/<container>` is "available only for apps that have implemented **Facebook Login for Business**". Source: RU, CP.
    - Apps on **Instagram Login** (host `graph.instagram.com`) must use `video_url` / `image_url` pull from a public server.
    - xpost must host media publicly, for example on R2, for Instagram Login.
11. **PKCE for Instagram Login: RESOLVED as NOT documented.** BL documents only the `client_secret` exchange at `api.instagram.com/oauth/access_token`.
    - Long-lived token requests "**must be made in server-side code**".
    - `redirect_uri` must exactly match a registered URI; beware of an auto-added trailing slash.
    - The auth code is valid for 1 h and single-use. Strip the trailing `#_` from the redirect.
    - Use a confidential server-side flow in the Worker, with `state` for CSRF.
12. **Other publishing requirements:**
    - If the linked Page requires **Page Publishing Authorization (PPA)** or 2FA, publishing fails until the user completes it. Source: CP, MEDIA.
    - Container status values: `EXPIRED`, `ERROR`, `FINISHED`, `IN_PROGRESS`, `PUBLISHED`. Poll once a minute for at most 5 minutes. Source: CP.
    - Optional `is_ai_generated` label. Source: CP.
13. **App Review screencast: CONFIRMED.** Source: AR.
    - One screencast for each permission, showing "the end-to-end user experience" for that permission.
    - The login button must be visible and follow brand guidelines.
    - English UI, or captions and tooltips.
    - Dependent permissions must be included in the submission.
    - Standard vs Advanced Access: Advanced Access "requires App Review and Business Verification". Source: OV.
14. **Instagram rate limits:** OV describes the Instagram BUC formula as based on Number of Impressions, meaning impressions in the last 24 h. Exact multiplier not re-read; the commonly cited value is 4800, partially verified.

### Facebook, resolved or changed
1. **`publish_video`: CONFIRMED as still listed.**
   - PP lists "`publish_video` permission, if you are publishing a video to the Page", together with `pages_manage_engagement`, `pages_manage_posts`, `pages_read_engagement` and `pages_read_user_engagement`. PP also requires the `CREATE_CONTENT`, `MANAGE` and `MODERATE` tasks.
   - FBV, FBR and PVREF list only `pages_show_list`, `pages_read_engagement` and `pages_manage_posts`, with the `CREATE_CONTENT` task.
   - Docs conflict. **Request `publish_video` only if video publishing fails without it.** Expect reviewers to question unneeded scopes.
2. **FB Reels: CONFIRMED.** Source: FBR.
   - Specs: 9:16, 1080x1920 recommended, minimum 540x960, 24–60 fps, **3–90 s** (max 60 s for a reel posted as a Page story).
   - Video H.264/H.265 (VP9 and AV1 also accepted), closed GOP 2–5 s, fixed frame rate. Audio AAC-LC, 48 kHz, stereo, 128 kbps or more.
   - Upload: `rupload.facebook.com/video-upload/<ver>/<video-id>`, sending the bytes or a `file_url` header (http/https, no auth).
   - `video_state` is DRAFT, SCHEDULED or PUBLISHED. Scheduling must be more than 10 minutes and at most 29 days ahead.
   - Reels publish to **Pages only**.
   - **NEW: Reels API limited to 30 API-published reels per 24 h moving window** (per Page).
   - **File-size limit: still UNVERIFIED.** No size appears on FBR.
3. **Page video upload:**
   - Resumable Upload API handle, passed as `fbuploader_video_file_chunk` on `POST /<PAGE_ID>/videos`. FBV's example still shows the host `graph-video.facebook.com`.
   - Alternatively, `file_url` ("Cannot be used with upload_phase"). Source: PVREF.
   - **10 GB / 240 min: still UNVERIFIED.** Not on FBV or PVREF. The facebook.com help pages returned 400 / JS-only to curl.
4. **Photos:** `POST /<page_id>/photos` with `url`. Feed posts take `published=false` + `scheduled_publish_time`. Source: PP.
5. **Share Dialog: CONFIRMED, with one correction.** Source: SD.
   - Use `https://www.facebook.com/dialog/share?app_id&display&href&redirect_uri`, or `FB.ui({method:'share', href})`.
   - **NEW: an official `hashtag` parameter** (one hashtag, which the user can remove).
   - There is no text or quote parameter. `redirect_uri` is now marked Deprecated.
6. **PKCE for Facebook Login: CONFIRMED.**
   - S256 or plain. The secret is optional if `code_verifier` is sent.
   - The page still says "this functionality is still in testing". Treat it as beta, and use a server-side secret exchange as the fallback.
   - Source: OIDC.
7. **Automation terms: CONFIRMED verbatim.** Source: ADC.
   - "Platform APIs are the only allowable means to access data programmatically, unless you have our prior written permission."
   - It quotes the Facebook ToU 3.2.3: "You may not access or collect data from our Products using automated means (without our prior permission) … regardless of whether such automated access or collection is undertaken while logged-in".
   - **Key for assisted fill:** "Allowable requests can only be directed to graph.facebook.com. Making requests outside of graph.facebook.com constitutes a violation … search your code for instances of facebook.com, mobile.facebook.com, instagram.com". Also: "The use of scripts … javascript or other executable code to automate actions … outside of the Platform APIs is not allowed."
   - **This explicitly covers automating actions, not only collecting data. It settles assisted fill as forbidden on both IG and FB.**

### Still unverified after the second pass
- **FB Reels max file size; FB Page video max size and duration.** The help pages could not be rendered.
- **Meta Business Suite composer URL.** facebook.com/business help pages returned 400 to curl. `https://business.facebook.com/` is the entry point; the deep link is unverified.
- **Exact current Instagram ToU wording.** help.instagram.com is JS-only and returned nothing usable; the citation from the first pass stands.
- **Facebook post text length** (about 63,206 characters).

---

## Instagram

### 1. Posting API and content types
- **API:** Instagram Platform Content Publishing. Publishing takes two steps:
  1. Create a container with `POST /<IG_ID>/media`.
  2. Publish it with `POST /<IG_ID>/media_publish`.
  - Sources [OFFICIAL-via-search]: https://developers.facebook.com/docs/instagram-platform/content-publishing/ and https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- **Supported content:**
  - single image
  - single video, published as a Reel (`media_type=REELS`)
  - carousel of up to 10 images/videos; a carousel counts as one post
  - Stories (`media_type=STORIES`)
  - Source [OFFICIAL-via-search]: content-publishing page above. The carousel size of 2–10 comes from a [3P] guide, https://www.blotato.com/blog/instagram-posting-api.
- **Stories:** the docs say "only business accounts can publish stories" through the API. Creator accounts may be excluded for Stories. Source [OFFICIAL-via-search]: content-publishing page. Status: UNVERIFIED whether that is still current.
- **Not supported:** link posts. Instagram has no link post type, and captions do not make links clickable.
- **Containers expire after 24 h.** Source [OFFICIAL-via-search]: content-publishing page.

### 2. Access needed
There are two API flavours. Overview with a comparison table [OFFICIAL-via-search]: https://developers.facebook.com/documentation/instagram-platform/overview

| | Instagram API with **Instagram Login** (Business Login for Instagram) | Instagram API with **Facebook Login** |
|---|---|---|
| Account | IG professional account (Business or Creator) | IG professional account **linked to a Facebook Page** |
| Facebook Page required | **No** | **Yes** |
| Token | Instagram User token | Facebook User or Page token |
| Publish scopes | `instagram_business_basic` + `instagram_business_content_publish` | `instagram_basic` + `instagram_content_publish` (+ `pages_show_list`, `pages_read_engagement`, and often `business_management`) |
| Auth endpoint | `https://www.instagram.com/oauth/authorize`; token exchange at `api.instagram.com` | facebook.com dialog / Graph API |

Notes on the table:
- **Scope names:** the publish scope names come from [OFFICIAL-via-search] business-login pages and the [3P] guide https://adaptlypost.com/blog/instagram-business-content-publish-scope.
- **Scope renaming:** Meta docs note that the older `business_basic` / `business_content_publish` values were replaced by the `instagram_business_*` names. Source: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login
- **Exact Facebook Login scope list:** the full list for the Facebook Login path is UNVERIFIED.

Requirements for publishing to the public:
- **Advanced Access** for the publish permission and the basic permission, granted through **App Review**.
- **Business Verification**, because Meta requires it for any app that requests Advanced Access to new permissions.
- Sources:
  - [OFFICIAL-via-search] Access-levels and App Review FAQ: https://developers.facebook.com/documentation/resp-plat-initiatives/data-access-renewal/faqs
  - [OFFICIAL-via-search] Instagram App Review: https://developers.facebook.com/docs/instagram-platform/app-review

Account types:
- **Personal Instagram accounts cannot be used.** Source [OFFICIAL-via-search]: overview page above.
- A [3P] source says Creator accounts are not supported for content publishing. This conflicts with Meta's overview, which lists Business and Creator for Instagram Login. Treat Creator support as **likely yes for feed and Reels, uncertain for Stories** (UNVERIFIED).

### 3. Unapproved app (Development mode / Standard Access)
- Under Standard Access, a permission can only be requested from users who **have a role on the app** (admin, developer or tester, plus IG testers for Instagram Login). Features only work for those users.
- That means xpost could publish to the team's own IG professional accounts with no review, but not to real users' accounts.
- Source [OFFICIAL-via-search]: https://developers.facebook.com/documentation/resp-plat-initiatives/data-access-renewal/faqs
- Standard Access is the default when an app is registered. Same source.

### 4. Official draft / share / intent routes
- **No web intent or URL to share to Instagram exists.** Status: UNVERIFIED as a negative claim, but no official page offering one was found.
- **Mobile: Sharing to Stories** [OFFICIAL-via-search]: https://developers.facebook.com/docs/instagram-platform/sharing-to-stories
  - Android uses an implicit intent `com.instagram.share.ADD_TO_STORY`.
  - iOS uses the URL scheme `instagram-stories://share?source_application=<FB_APP_ID>` with the content on the pasteboard.
  - A Facebook App ID has been required since January 2023.
- **Mobile: Sharing to Feed** [OFFICIAL-via-search]: https://developers.facebook.com/docs/instagram-platform/sharing-to-feed
  - Android uses a standard `ACTION_SEND` with `EXTRA_STREAM` through a chooser.
  - On iOS, the document interaction / share sheet is used.
- **These are native-app routes.** A web app on a phone gets close to them through the **Web Share API** (`navigator.share({files})`). The OS share sheet lists Instagram (Feed/Stories/Reels/Messages) when the IG app is installed. The user then edits and presses Share inside Instagram.
- **The caption is not carried across reliably**, so xpost should copy it to the clipboard first. Status: UNVERIFIED. This is behaviour of the Instagram app, not documented.
- **Drafts via the API: none.** The IG API offers no "save as draft".

### 5. Web upload pages and embedded login
- Instagram web supports creating posts at https://www.instagram.com/ (Create "+" button). Meta Business Suite at https://business.facebook.com/ also offers Create post / reel / story for IG and FB. Sources [3P]:
  - https://www.hopperhq.com/blog/how-to-post-to-instagram-from-desktop/
  - https://helpdeskgeek.com/how-to-schedule-an-instagram-post-with-meta-business-suite/
- **Embedded login (Electron):** Meta has blocked Facebook Login in Android WebViews since Oct 2021. Users see "For your account security, logging in to Facebook from an embedded browser is disabled". Sources [OFFICIAL-via-search]:
  - https://developers.facebook.com/blog/post/2021/06/28/deprecating-support-fb-login-authentication-android-embedded-browsers/
  - https://developers.facebook.com/community/threads/195638179128499/
- **App Review rejects** "embedding the Facebook Login dialog inside a custom web view". Source [OFFICIAL-via-search, forum]: https://developers.facebook.com/community/threads/210744983754775/
- **OAuth for xpost must therefore run in the system browser**, not an Electron BrowserWindow.
- Signing in to instagram.com itself (not OAuth) inside an Electron window: no official statement found. **UNVERIFIED.**

### 6. Terms on automation outside the API
- **Meta Automated Data Collection Terms** [OFFICIAL-via-search]: https://developers.facebook.com/docs/development/terms-and-policies/automated-data-collection/
  - Platform APIs are the only allowed means to access data programmatically without Meta's prior written permission.
  - Automated access or collection is prohibited whether or not the user is logged in.
- **Instagram Terms of Use** [OFFICIAL-via-search]:
  - Help Center: https://help.instagram.com/581066165581870
  - Terms: https://help.instagram.com/740480200552298
  - Users may not "attempt to create accounts or access or collect information in unauthorized ways". Creating accounts or collecting information in an automated way requires Instagram's express permission.
  - Meta runs anti-scraping teams.
- **Enforcement:** Meta has sued automation services that posted and liked on Instagram on users' behalf. Source [OFFICIAL-via-search]: https://about.fb.com/news/2020/06/automation-software-lawsuits/
- **Effect on xpost:** the ToU wording targets automated collection and account creation, but Meta's enforcement covers automating posting activity. Scripted filling of instagram.com forms is high-risk, and Meta treats it as unauthorized automation.

### 7. How media gets in
- **Pull by URL:** `image_url` / `video_url`. Meta's servers fetch the file from a **public HTTPS URL**, for example an R2 public bucket or a signed URL that stays valid for minutes. No domain verification is documented for IG. Status: UNVERIFIED, though Meta must be able to fetch it publicly.
- **Resumable upload for video** [OFFICIAL-via-search]: https://developers.facebook.com/documentation/instagram-platform/content-publishing/resumable-uploads
  1. Create the container with `upload_type=resumable`.
  2. POST the bytes to `https://rupload.facebook.com/ig-api-upload/<API_VERSION>/<IG_CONTAINER_ID>` with `Authorization: OAuth <token>`, `offset` and `file_size` headers. Alternatively, send a `file_url` header for a hosted file.
  3. Poll the container's `status_code` until it reads `FINISHED`.
  4. Call `media_publish`.
- **Images must be pulled by URL.** Resumable upload covers video/Reels only. Status: UNVERIFIED for images.

### 8. Limits
- **Images:** JPEG only, 8 MB max, aspect ratio 4:5 to 1.91:1, minimum width 320 px. Source [OFFICIAL-via-search]: IG User Media reference.
- **Reels:** MOV/MP4, H.264 or HEVC video, AAC audio, 300 MB max ([OFFICIAL-via-search], IG User Media reference), 3 s to 15 min ([3P] quoting Meta). Recommended 9:16 at 1080x1920, 23–60 fps. Codec details and fps: UNVERIFIED.
- **Story video:** about 100 MB and about 60 s. **UNVERIFIED** ([3P], https://support.agorapulse.com/en/articles/8769640-technical-limits-of-instagram-direct-publishing).
- **Caption:** 2,200 characters, 30 hashtags, 20 @-tags. **UNVERIFIED** in this session; the figures are widely cited by third parties.
- **Publish cap:** Meta's Content Publishing page currently says **50 API-published posts per rolling 24 h** per account. A carousel counts as 1. `GET /<IG_ID>/content_publishing_limit` returns usage, with quota_total "currently 50".
  - Older doc versions said 100, and some secondary sources still quote 100.
  - **Read the cap at runtime from the endpoint.** Sources [OFFICIAL-via-search]:
    - https://developers.facebook.com/docs/instagram-platform/content-publishing/
    - https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit.md
- **BUC rate limits:** Instagram Graph API calls fall under Business Use Case limits. Usage is reported in the `X-Business-Use-Case-Usage` header.
  - The often-cited formula is 4800 x impressions per 24 h. Status: [3P], UNVERIFIED.
  - Error 80002 means the IG BUC limit is exhausted.
  - Source [OFFICIAL-via-search]: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
- **Tokens (Instagram Login):** the short-lived token lasts 1 h. Exchange it at `/access_token` for a long-lived token that lasts 60 days. Refresh with `/refresh_access_token` once the token is at least 24 h old and not yet expired; the refreshed token lasts 60 days. A token not refreshed within 60 days dies, and the user must re-authorize. Sources [OFFICIAL-via-search]:
  - https://developers.facebook.com/documentation/instagram-platform/reference/access_token
  - https://developers.facebook.com/documentation/instagram-platform/reference/refresh_access_token
- **xpost needs a cron Worker that refreshes tokens about every 30–50 days.**

### 9. App Review UX demands
- A **screencast for each permission** is required. It shows the full journey: connecting the IG account, the permission prompt, and the permission in use, which here means composing and publishing a post with the result visible on Instagram. Sources:
  - [OFFICIAL-via-search] https://developers.facebook.com/docs/instagram-platform/app-review (has a "Screencast guidance" section, contents not read)
  - [3P] https://adaptlypost.com/blog/instagram-business-content-publish-scope
- Review must be done with a **real IG professional account**, not a test user. Status: [3P].
- **Developer Policies:**
  - Get consent before publishing on a person's behalf.
  - Ask for publish permission only when it is needed.
  - Do not prefill captions or messages; any suggested content must be editable by the user before sharing.
  - Sources [OFFICIAL-via-search]: https://developers.facebook.com/devpolicy and https://developers.facebook.com/docs/development/terms-and-policies/app-dev-guidelines/
- **Design implication:** a preview showing exactly what will post, an editable caption, and an explicit per-platform Post action. Caption text the user typed in xpost is user-provided, so it does not count as prefill.

### 10. OAuth details
- **Instagram Login:**
  - authorize at `https://www.instagram.com/oauth/authorize`
  - parameters: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, and optionally `enable_fb_login` and `force_reauth`
  - exchange the code at `api.instagram.com/oauth/access_token`
  - Source [OFFICIAL-via-search]: business-login page above.
- **PKCE for Instagram Login: UNVERIFIED.** No evidence found. Assume a confidential-client flow, with the secret kept in the Worker.
- **Redirect URIs:** must be registered in the app dashboard, with exact match. HTTPS is expected. Status: UNVERIFIED for the IG-specific rules.
- See the Facebook section for shared Meta requirements: data deletion, privacy policy and Strict Mode.

---

## Facebook

### 1. Posting API and content types (Pages only)
- **Feed post:** `POST /<PAGE_ID>/feed` with `message`, `link`, `published` and `scheduled_publish_time`. Link posts and text posts are supported. Source [OFFICIAL-via-search]: https://developers.facebook.com/docs/pages-api/posts
- **Photos:** `POST /<PAGE_ID>/photos`. Multi-photo posts work by uploading unpublished photos, then sending `attached_media` on `/feed`. Sources: [OFFICIAL-via-search] https://developers.facebook.com/docs/graph-api/reference/page/photos ; attached_media from general knowledge, UNVERIFIED this session.
- **Video:** `POST /<PAGE_ID>/videos` with `file_url` or a handle from the Resumable Upload API. Sources [OFFICIAL-via-search]:
  - https://developers.facebook.com/docs/video-api/guides/publishing
  - https://developers.facebook.com/docs/graph-api/reference/page/videos/
- **Reels:** `POST /<PAGE_ID>/video_reels`:
  1. `upload_phase=start` on graph.facebook.com
  2. upload the bytes to `rupload.facebook.com`
  3. `upload_phase=finish` with `video_state` set to PUBLISHED, DRAFT or SCHEDULED
  - Source [OFFICIAL-via-search]: https://developers.facebook.com/docs/video-api/guides/reels-publishing
- **Stories:** the Page Stories API. Source [OFFICIAL-via-search]: https://developers.facebook.com/docs/page-stories-api
- **Personal profiles: not possible.** `publish_actions` was deprecated in 2018 (API v3.0), and Meta pointed developers to the Share dialog instead. Source [OFFICIAL-via-search]: https://developers.facebook.com/blog/post/2018/07/31/platform-update-publish-permission/
- **Groups: not possible.** The Groups API and `publish_to_groups` were deprecated in v19 (2024) and removed. Source [OFFICIAL-via-search, forum]: https://developers.facebook.com/community/threads/2076398286093257/

### 2. Access needed
- **Permissions:**
  - `pages_manage_posts`
  - `pages_read_engagement`
  - `pages_show_list`
  - often `pages_manage_metadata` and `business_management`
  - `publish_video` for some video flows (UNVERIFIED whether still required for Page video)
- The authorizing user must be able to perform the **CREATE_CONTENT** task on the Page, and the call uses a **Page access token**. Sources [OFFICIAL-via-search]: Pages API posts / page photos / getting-started pages.
- **Public use requires** Advanced Access through App Review, plus Business Verification. Same sources as for Instagram.

### 3. Unapproved app
- Under Standard Access, xpost works only for users with an app role. They can post to Pages they manage. Same access-levels FAQ.

### 4. Official share / draft routes
- **Share Dialog (web):** `FB.ui({method:'share', href})` or the URL-redirect form `https://www.facebook.com/dialog/share?app_id=…&href=…&redirect_uri=…`.
  - It shares **a link** to the user's own timeline (personal profile). It also covers Pages and groups through the dialog's audience picker; that part is UNVERIFIED.
  - The user presses Post.
  - Source [OFFICIAL-via-search]: https://developers.facebook.com/docs/sharing/reference/share-dialog
- **Limits:** no media upload and no prefilled text. The policy forbids prefilling the user message, and the `quote` parameter does not reliably work. Sources:
  - [OFFICIAL-via-search] https://developers.facebook.com/documentation/sharing/ios.md
  - [3P] SO
- **`https://www.facebook.com/sharer/sharer.php?u=<url>`:** the legacy link-share URL, no app ID needed. It still works per community reports. Status: [3P].
- **Mobile Stories intent:** `com.facebook.stories.ADD_TO_STORY`. Source [OFFICIAL-via-search]: https://developers.facebook.com/products/sharing-to-stories/get-started/
- **Drafts via the API:**
  - Reels can be created with `video_state=DRAFT`. Source [OFFICIAL-via-search]: reels-publishing page.
  - Feed posts can be created with `published=false` (unpublished / scheduled).
  - These drafts show up in Meta Business Suite / Page tools for the user to finish. Status: UNVERIFIED how they appear in the UI.
  - This is a viable "user presses Post" pattern for Pages.

### 5. Web upload pages and embedded login
- **Upload pages:**
  - https://www.facebook.com/ (profile or Page composer)
  - https://business.facebook.com/latest/composer (Business Suite; exact path UNVERIFIED)
- **Embedded login:** see the Instagram section. Meta blocks and rejects Facebook Login in embedded web views. For the Facebook website itself inside Electron, no Electron-specific statement was found (UNVERIFIED). Expect checkpoints and the embedded-browser block.

### 6. Terms on automation
- **Automated Data Collection Terms:** the APIs are the only allowed programmatic means. Source [OFFICIAL-via-search]: https://developers.facebook.com/docs/development/terms-and-policies/automated-data-collection/
- **Meta Terms of Service:** automated access or collection is prohibited without permission. Status: [OFFICIAL-via-search via mirror].
- **Meta Platform Terms:** https://developers.facebook.com/terms

### 7. How media gets in
- **Photos:** pass a `url` parameter (Meta pulls the file) or send a multipart `source` upload. Status: UNVERIFIED this session; the reference page is listed above.
- **Video:** two routes.
  - `file_url` (pull)
  - the **Resumable Upload API**:
    1. create a session with `POST /<APP_ID>/uploads`
    2. send chunks to `POST /upload:<SESSION_ID>` with `file_offset`
    3. receive a handle
    4. pass the handle to `/videos`
  - The `graph-video.facebook.com` host is deprecated; use `graph.facebook.com`.
  - Sources [OFFICIAL-via-search]: https://developers.facebook.com/docs/video-api/guides/publishing and https://developers.facebook.com/documentation/video-api/graph-api/guides/upload
- **Reels:** bytes go to `rupload.facebook.com`, or a `file_url` header is used.

### 8. Limits
- **Reels:** 9:16, 1080x1920 recommended, minimum 540x960, 24–60 fps, **3–90 s**, .mp4 recommended. Source [OFFICIAL-via-search]: reels-publishing page.
- **Reels file size:** 500 MB is quoted by third parties [3P], UNVERIFIED.
- **Page video:** about 10 GB / 240 min is widely quoted. **UNVERIFIED.**
- **Post text:** about 63,206 characters. **UNVERIFIED.**
- **Rate limits:** Pages calls made with a Page or system token fall under **BUC** limits. Source [OFFICIAL-via-search]: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
- **Reels posting cap:** a [3P] source mentions a "30-post" Reels publishing limit per Page per 24 h (https://singhamandeep.com/?p=1532). UNVERIFIED.
- **Tokens:**
  - user short-lived token: about 1–2 h
  - exchange through `oauth/access_token?grant_type=fb_exchange_token` for a long-lived user token, about 60 days
  - a Page token derived from a long-lived user token is "good for at least 60 days". In practice it often has no expiry, but treat it as able to expire.
  - Sources [OFFICIAL-via-search]: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived and https://developers.secure.facebook.com/docs/facebook-login/access-tokens/expiration-and-extension
  - System-user tokens are for the business's own assets only, not suitable for multi-tenant use.

### 9. App Review UX
- **Same as Instagram:** a screencast for each permission, consent before publishing, no prefill, and permission requested in context. Sources: devpolicy and app-dev-guidelines URLs above.

### 10. OAuth details (Facebook Login, shared Meta requirements)
- **PKCE is supported** in the manual flow (OIDC code flow with PKCE): `code_challenge` with `S256` recommended. The client secret is optional when a `code_verifier` is sent. The docs said this was "still in testing". Source [OFFICIAL-via-search]: https://developers.facebook.com/docs/facebook-login/guides/advanced/oidc-token
- **Strict Mode** (exact redirect URI match, no extra query params) is **required for all apps**. HTTPS is enforced. Sources [OFFICIAL-via-search]:
  - https://developers.facebook.com/docs/facebook-login/security
  - https://developers.facebook.com/blog/post/2017/12/18/strict-uri-matching/
- **Going Live** requires a **Privacy Policy URL**, a **Terms of Service URL**, and a **data deletion method**: either a Data Deletion Callback URL (signed_request POST, returning JSON `{url, confirmation_code}`) or a Data Deletion Instructions URL. Policy links must be publicly reachable by Meta's crawler. Sources [OFFICIAL-via-search]:
  - https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings
  - https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
  - https://developers.facebook.com/documentation/development/terms-and-policies/privacy-policy
- **Desktop / Electron:** open OAuth in the system browser and return through an HTTPS redirect to the Worker. Do not use a custom scheme; Meta needs HTTPS redirect URIs (UNVERIFIED for custom schemes).

---

## One Meta app for both?
**Yes, likely.** One Meta "Business" app can add these products together:
- Facebook Login for Business (Pages publishing)
- Instagram (Instagram API with Facebook Login and/or with Instagram Login)
- Sharing / Stories

App Review, Business Verification, privacy and data-deletion settings are shared across them. Sources [OFFICIAL-via-search]:
- https://developers.facebook.com/documentation/development/create-an-app/other-app-types/instagram-apis
- https://developers.facebook.com/documentation/instagram-platform/overview

The Instagram Login product uses a separate Instagram app ID and secret inside the same Meta app, per the docs' setup flow. Status: UNVERIFIED.

**Recommendation:** use one Meta app.
- **Facebook Login for Business** for Pages, with the option to also cover IG accounts linked to Pages.
- **Instagram Login** for IG professional accounts without a Page.

---

## Expected constraints: verdicts

| Constraint | Verdict | Evidence |
|---|---|---|
| Instagram: professional accounts only through the API | **CONFIRMED** | Overview table: Business/Creator only. Personal accounts are not supported. https://developers.facebook.com/documentation/instagram-platform/overview |
| Instagram: Meta App Review needed | **CONFIRMED, with nuance** | Needed for Advanced Access, i.e. any user without an app role. Business Verification is also required. Standard Access works for app-role users with no review. |
| Instagram: Facebook Page needed? (implicit older assumption) | **CHANGED** | Instagram Login (since July 2024) needs **no** linked Facebook Page. https://developers.facebook.com/blog/post/2024/07/30/instagram-api-with-instagram-login/ |
| Instagram: 25 or 50 posts / 24 h | **CHANGED / clarified (2nd pass)** | Meta's content-publishing guide says 100 in its Rate Limit section and 50 in its carousel section. The `content_publishing_limit` reference says quota_total is "currently 50". Design for 50 and read the live value. |
| Instagram: carousel of 10 | **CHANGED** | Now up to 20 items (CP, MEDIA). |
| Instagram: Stories for Business accounts only | **CHANGED** | The restriction no longer appears in current docs. |
| Instagram: only Instagram Login or Facebook Login | **CHANGED** | Unified Login (Instagram or Facebook credentials, no Page, business portfolio required) is now recommended for new integrations. |
| Facebook Reels publishing cap | **NEW** | 30 API-published reels per 24 h moving window (FBR). |
| Facebook: Pages only, no personal profile | **CONFIRMED** | publish_actions deprecated in 2018. Groups API also removed in 2024. |
| Facebook: Meta App Review needed | **CONFIRMED** (same nuance as Instagram) | Access-levels FAQ |
| Meta terms restrict automation outside the API | **CONFIRMED** | Automated Data Collection Terms, Instagram ToU, Meta lawsuits against posting-automation tools |

---

## Mode recommendations

### Instagram
1. **Official API (primary).** Viable for IG Business/Creator accounts through Instagram Login.
   - Supports feed images (JPEG), carousels, Reels and Stories (Stories possibly Business-only).
   - Media is pulled from R2 by URL, or video goes through rupload.
   - Requires App Review, Advanced Access and Business Verification before public launch. Until then, only app-role testers.
2. **Handoff (fallback for personal accounts, and before review passes).**
   - Desktop: open `https://www.instagram.com/` in the user's **normal browser**, copy the caption to the clipboard, and offer the file for download or reveal it in a folder.
   - Phone: Web Share API with files, so the OS sheet goes to the Instagram app.
   - Allowed: the user does everything themselves.
3. **Official intent (mobile native only).** Sharing to Stories / Feed intents exist but need a native app. Not applicable to a web/Electron app, except indirectly through the Web Share API sheet.
4. **Assisted fill (Electron): NOT recommended / do not build.**
   - Instagram ToU bars access "in unauthorized ways" and "automated" means, and Meta has sued posting-automation services.
   - Meta's embedded-browser stance adds sign-in risk.
   - It fails the project rule "never built where terms forbid it".

### Facebook
1. **Official API (primary, Pages only).** Supports text, link, photo(s), video, Reels and Stories on Pages the user manages. App Review and Business Verification are needed.
   - **Optional "draft" variant:** create the Reel with `video_state=DRAFT`, or a feed post with `published=false`, then let the user press Publish in Meta Business Suite.
2. **Official share route (personal profiles, links only).** Share Dialog (`facebook.com/dialog/share`) or `sharer.php?u=`.
   - The user presses Post.
   - No media upload and no prefilled text; the user pastes the caption from the clipboard.
   - Good for "share the link to my YouTube or X post on my profile".
3. **Handoff (personal profile with media).** Open `https://www.facebook.com/` in the normal browser, copy the caption and hand over the file. On phones, use the Web Share API to the Facebook app.
4. **Assisted fill (Electron): NOT recommended / do not build.** Same terms basis as Instagram (Automated Data Collection Terms and the Meta ToU on automated access). Facebook blocks embedded-browser login, and Meta's anti-automation enforcement makes it both forbidden and fragile.

### Cross-cutting implementation notes
- OAuth always runs in the system browser, with HTTPS redirects to the Worker and Strict Mode.
- Use PKCE for Facebook Login. For Instagram Login, keep the secret server-side (PKCE support UNVERIFIED).
- Implement the data deletion callback, and publish a privacy policy and terms page before going Live.
- Run a scheduled Worker that refreshes IG long-lived tokens every 30–50 days and re-checks Page tokens with `debug_token`.
- Check the IG cap through `content_publishing_limit` before publishing. Track BUC headers.
- Serve media from R2 over public HTTPS with short-lived URLs that stay valid long enough for Meta to fetch them. IG images must be converted to JPEG of 8 MB or less within 4:5 to 1.91:1.

## Open items (original list)
The second pass resolved items 1–5 and 7 (see "VERIFICATION UPDATE" at the top). The ones still open:
- FB Reels and Page video size and duration limits
- the Business Suite deep link
- the exact Instagram ToU text (the Facebook ToU 3.2.3 is now quoted verbatim through the ADC page)
1. IG publish cap (50 vs 100) and Stories eligibility for Creator accounts.
2. Reels / Story video specs (duration, size, codecs) for IG; FB Reels max file size; FB Page video limits.
3. Caption, hashtag and tag limits (2,200 / 30 / 20).
4. PKCE support for Instagram Login.
5. Whether `publish_video` is still needed for Page video.
6. Meta Business Suite composer URL; how API-created drafts appear there.
7. Exact Instagram ToU automation clause wording (current version).
