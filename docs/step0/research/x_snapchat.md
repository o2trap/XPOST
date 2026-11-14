# xpost Step 0 research: X (Twitter) and Snapchat

Researched 2026-11-14.

**Method note (revised 2026-11-14, second pass).** The first pass relied on WebSearch excerpts only. In this second pass I downloaded the live pages with curl through the proxy:
- docs.x.com pages, as raw `.md`: pricing, Developer Agreement, Developer Policy, rate limits, OAuth 2.0 PKCE, web intent, media introduction, Developer Guidelines, changelog.
- developers.snap.com pages: Public Profile API Get Started, Profiles, Profile Asset Management, User Journey; Creative Kit Web; Snap Kit submission and review.

Items tagged **[LIVE]** were read directly on the page this pass. Some sources stayed out of reach:
- help.x.com renders with JavaScript, so curl gets no body.
- www.snap.com (the Terms) and devcommunity.x.com were refused by the proxy.
- WebFetch still could not resolve any host.

Claims from those sources stay as search excerpts.

**Second-pass corrections at a glance:**
- X: the media upload price is still not on the pricing page. `GET /2/users/me` is a User: Read at $0.010. Owned Reads cover only the app owner's own account. The canonical intent URL is `x.com/intent/tweet`.
- Snapchat: the "read only" note is about profile metadata, not posting. Allowlisting covers the whole Public Profile API. Story and Spotlight video run 5–300 s, not 60 s max. Images can be posted to Stories. Spotlight descriptions take up to 160 characters, captions 1–250 characters. Uploads go up to 1 GB. Creative Kit for Web needs no special setup.

---

## X (Twitter)

### 1. Posting API and content types
- Endpoint: `POST /2/tweets` (Create or Edit Post). It covers text, quote, reply (`reply.in_reply_to_tweet_id`) and media (`media.media_ids`). You build a thread by chaining replies to your own previous post. Sources: https://docs.x.com/x-api/posts/manage-tweets/introduction, https://developer.x.com/en/docs/x-api/tweets/manage-tweets/api-reference/post-tweets
- One post can carry up to 4 photos, or 1 animated GIF, or 1 video. https://docs.x.com/x-api/media/introduction. The help center adds that a GIF cannot be mixed with multiple images: https://help.x.com/en/using-x/posting-gifs-and-pictures?lang=browser
- Media uses the v2 media endpoints: `POST /2/media/upload/initialize`, `POST /2/media/upload/{id}/append`, `POST /2/media/upload/{id}/finalize`, and `GET /2/media/upload` for STATUS. The old `command=INIT` style on v1.1 is not the v2 method. https://docs.x.com/x-api/media/quickstart/media-upload-chunked
- Uploads and post creation are validated separately. A video can upload fine and still get a 403 on `POST /2/tweets` if it is too long for the user's tier. https://docs.x.com/x-api/media/quickstart/best-practices

### 2. Access needed
- You need an X developer account and a developer app ("Project/App" in the Developer Console). https://docs.x.com/x-api/getting-started/getting-access, https://docs.x.com/fundamentals/developer-apps
- Billing is pay-per-use. You buy credits upfront and each request deducts from them. There are "no contracts or minimum spend". https://docs.x.com/x-api/getting-started/pricing. Pay-per-use launched in February 2026: https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476
- Legacy Basic plans were deprecated, and subscribers were auto-migrated to pay-per-use after 2026-06-01: https://devcommunity.x.com/t/important-update-legacy-x-api-basic-plans-are-moving-to-pay-per-use-ppu/266305, https://x.com/XDevelopers/status/2057572111020134462. Legacy Pro plans followed, migrating after 2026-09-01 per the 2026-08-14 announcement. That date comes from search excerpts and secondary sources; I could not open the announcement itself, so it is UNVERIFIED in full text. Net result: no fixed self-serve tiers are sold any more. Enterprise remains a sales-led option (UNVERIFIED in detail).
- No partner approval is needed for basic posting. Write actions must follow the Automation Rules, and consent rules apply (see section 10).

### 3. What an unapproved app can and cannot do
- X has no "app review" gate for posting. Any developer app with credits and a user OAuth token can create posts, subject to rate limits and the policy.
- The old free tier had very low write caps; one forum report says 17 posts per 24 h per user: https://devcommunity.x.com/t/specifics-about-the-new-free-tier-rate-limits/229761. Whether a free tier still exists after the move to pay-per-use is UNVERIFIED.
- Following, likes and quote-posts were removed from all self-serve tiers on 2026-04-20: https://x.com/XDevelopers/status/2044919377544261979. This does not affect plain posting.

### 4. Official draft and intent route (user presses Post)
- Web Intent: `https://x.com/intent/post?...`. The legacy `twitter.com/intent/tweet` is the older documented form. Parameters are `text`, `url`, `hashtags` (comma-separated, no `#`), `via` (appends "via @username") and `in_reply_to` (post ID). The text plus the other parameters should fit in 280 characters, and `url` is wrapped by t.co. Sources: https://docs.x.com/x-for-websites/post-button/guides/web-intent, https://developer.twitter.com/en/docs/twitter-for-websites/tweet-button/guides/web-intent
- **Media: not supported.** The documented parameter list has no media or image parameter (same sources), so the user has to attach the file by hand in the composer.
- **Cost: free.** The intent is a browser URL, not an API call, so no developer credits are used. That follows from the pricing page covering only API requests: https://docs.x.com/x-api/getting-started/pricing
- **Resolved [LIVE]:** the docs page gives the Web Intent URL as `https://x.com/intent/tweet`. Its parameters are `text`, `url`, `hashtags`, `via`, `related` and `in_reply_to`, with no media parameter. Text that pushes the post past 280 characters "will require additional editing by a X user before they can successfully post". https://docs.x.com/x-for-websites/post-button/guides/web-intent

### 5. Web upload page and Electron sign-in
- The upload page is the composer at `https://x.com/compose/post`. The path is UNVERIFIED; `x.com/home` also has the inline composer.
- Sign-in inside an Electron window is UNVERIFIED. I found no official X statement either way. A community report says passkey/WebAuthn 2FA for X fails or hangs inside an embedded app browser: https://claudeissues.com/issue/85244-bug-windows-passkey-2fa-step-in-the-built-in-browser-hangs-the-entire-app-it-the. Google SSO, which many X users sign in with, intentionally blocks embedded browsers: https://community.auth0.com/t/google-error-after-federated-logout-from-electron-app-the-browser-youre-using-doesnt-support-javascript/128758
- The question is moot anyway, because terms forbid assisted fill (section 6).

### 6. Terms on automation outside the API
- **Automation Rules:** using "non-API-based forms of automation, such as scripting the X website" is prohibited and "may result in the permanent suspension of your account". https://help.x.com/en/rules-and-policies/x-automation
- **Developer Guidelines:** automated access must use only the official X API, with "no scraping, browser automation, or unofficial methods". Their scenario table lists browser automation as grounds for permanent suspension. https://docs.x.com/developer-guidelines
- **Terms of Service:** these forbid access "by automated means other than published interfaces" and crawling or scraping "in any form, for any purpose without our prior written consent". https://x.com/en/tos, https://legal.x.com/content/dam/legal-twitter/site-assets/x-terms-of-service-2026-04-10/en/x-terms-of-service-2026-04-10.pdf
- The Developer Agreement makes the Automation Rules binding on developers: https://docs.x.com/developer-terms/agreement
- **Conclusion:** filling the x.com composer from an app counts as scripting the website, even if the user presses Post. That is prohibited, so no assisted-fill mode for X.

### 7. How media gets in
- **Chunked upload only.** INITIALIZE (`total_bytes`, `media_type`, `media_category`), then APPEND in segments of 5 MB or less (8 MB server maximum, `segment_index` starting at 0), then FINALIZE, then poll STATUS until processing finishes for video and GIF. https://docs.x.com/x-api/media/quickstart/media-upload-chunked
- There is no URL pull. I found no documented remote-URL ingest for X media; treat that absence as UNVERIFIED. A Cloudflare Worker has to stream the bytes itself, for example from R2.
- The `media_category` values are `tweet_image`, `tweet_gif`, `tweet_video`, `amplify_video`, `dm_*`, and others. https://docs.x.com/x-api/media/introduction

### 8. Limits

**Text**
- 280 weighted characters. Emoji and CJK count as 2. https://docs.x.com/fundamentals/counting-characters
- Any URL counts as 23 characters (t.co). Same source, plus https://help.x.com/en/business-and-advertising/creative-ad-specifications
- Premium and higher subscription tiers allow up to 25,000 characters. https://help.x.com/en/using-x/x-premium. One help page still says 4,000, which looks stale: https://help.x.com/en/using-x/types-of-posts
- Attached media does not count toward the limit.

**Media**

| Category | Default account | Premium / verified |
|---|---|---|
| Image (`tweet_image`), JPG/PNG/GIF/WEBP | 5 MB | 5 MB |
| Animated GIF (`tweet_gif`) | 15 MB | 15 MB |
| Video (`tweet_video` / `amplify_video`) | 20 min / 8 GB | 125 min / 16 GB |

Sources: https://docs.x.com/x-api/media/introduction, https://docs.x.com/x-api/media/quickstart/best-practices. Limits depend on the user's subscription and verified status, not on the API plan.

**Rate limits**
- `POST /2/tweets`: 100 per 15 min per user and 10,000 per 24 h per app. https://docs.x.com/x-api/fundamentals/rate-limits
- Media APPEND: 1,875 per 15 min per user and 180,000 per 24 h. This figure comes from a community thread quoting the docs: https://devcommunity.x.com/t/documentation-for-segment-index-0-999-and-rate-limits-on-2-media-upload-id-append-appears-outdated-after-16-gb-media-limit-increase/276668. Some users reported low INIT/FINALIZE limits: https://devcommunity.x.com/t/new-chunked-media-upload-initialize-and-finalize-endpoint-limits-too-low/242138
- Some pay-per-use accounts report unexpectedly low per-user daily caps on POST (UNVERIFIED): https://devcommunity.x.com/t/subject-post-2-tweets-user-24-hour-write-limit-set-to-10-on-pay-per-use-request-for-review-increase/270899
- Read the `x-rate-limit-*` response headers at runtime.

**Tokens**
- An OAuth 2.0 PKCE access token is valid for 2 hours unless `offline.access` is granted. With that scope a refresh token is issued; without it, none is. Refresh with `POST https://api.x.com/2/oauth2/token`, `grant_type=refresh_token`, `client_id`, form-encoded. https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- Refresh tokens are single-use and rotate on each refresh. The roughly 6-month validity comes from the OAuth 1.0a token-exchange page; whether it applies to PKCE refresh tokens is UNVERIFIED. https://docs.x.com/fundamentals/authentication/oauth-2-0/oauth-1-0a-token-exchange
- The OAuth FAQ says tokens can be revoked at any time, so handle re-authorization: https://docs.x.com/fundamentals/authentication/faq
- OAuth 1.0a user tokens are still supported, and X documents migrating them to OAuth 2.0 (same exchange page).

### 9. Pricing in detail (pay-per-use, effective 2026-04-20)

**Live pricing page, read 2026-11-14 [LIVE]** (https://docs.x.com/x-api/getting-started/pricing). Write operations are "charged per request":

| Action | Price |
|---|---|
| Post: Create | $0.015 |
| Post: Create (with URL) | $0.200 |
| Post: Create (summoned) | $0.010 |
| Content: Manage | $0.005 |
| Media Metadata | $0.005 |
| Interaction: Delete | $0.010 |

Read operations are "charged per resource returned":

| Resource | Price |
|---|---|
| Posts: Read | $0.005 |
| User: Read | $0.010 |

Other terms on the same page:
- **Media upload has no line item.** The page lists "Media Metadata" (`POST /2/media/metadata`, alt text) at $0.005 but nothing for `/2/media/upload*`. Whether uploads are free or billed in some other way is still UNVERIFIED. Read it from the Developer Console usage view after a test upload.
- **`GET /2/users/me`** returns one user object, so by the per-resource rule it is billed as **User: Read, $0.010**. That is my inference from the page's rules; `/2/users/me` is not named on the page.
- **Deduplication:** "All resources are deduplicated within a 24-hour UTC day window", so repeat users/me calls on the same day cost once. The page calls this a "soft guarantee".
- **Owned Reads ($0.001)** apply only "when `{id}` matches the authenticated user and that user is the owner of the developer app". The listed endpoints do not include `/2/users/me`. **Resolved:** xpost's end users do not qualify.
- **Commitments:** "No contracts, subscriptions, or minimum spend". You can set spending limits per billing cycle and auto-recharge, with at most one top-up per 5 minutes. The balance can go slightly negative, which blocks requests.
- **Free credit incentives:** $20 when you save a card and make a first purchase, plus a match of the first auto-recharge up to $50.
- **Read cap:** "capped at 3 million Post reads per monthly billing cycle".
- **Changelog** [LIVE] (https://docs.x.com/changelog): "Public Utility Apps continue to receive free scaled access". That does not apply to xpost.

The first-pass table below remains for reference.

| Item | Price | Source |
|---|---|---|
| Post: Create (no URL) | **$0.015 / request** | https://docs.x.com/x-api/getting-started/pricing |
| Post: Create with URL | **$0.20 / request** (about 13x) | same; https://x.com/XDevelopers/status/2044919377544261979 |
| Summoned reply (reply to a post that mentions the account) | $0.010, with no URL surcharge | https://devcommunity.x.com/t/x-api-pricing-update-owned-reads-now-0-001-other-changes-effective-april-20-2026/263025 |
| Post read (non-owned) | $0.005 / resource | same announcement thread; secondary pricing guides |
| Owned reads (the app owner's own data) | $0.001 / resource | same announcement thread |
| Media upload | **UNVERIFIED.** No line item is published. A forum thread reports uploads showing up as PostCreate usage. | https://devcommunity.x.com/t/undocumented-postcreate-usage-for-media-uploads-please-clarify-pay-per-use-billing/274646 |
| `GET /2/users/me` | **UNVERIFIED.** Probably billed as a User read (about $0.010 per secondary sources). It is not in the owned-reads endpoint list. | pricing page (not readable here) |
| Monthly minimum | None ("no contracts or minimum spend") | pricing page |

- **What counts as "with URL":** a link typed into the text triggers the $0.20 rate. Users have been billed `ContentCreateWithUrl` for posts they expected to cost $0.01. https://devcommunity.x.com/t/pay-per-use-billing-issue-overcharged-20x-per-post/263811, https://devcommunity.x.com/t/concern-about-url-posting-cost/264451. Whether a bare domain such as "example.com" auto-linked by X also counts is UNVERIFIED; assume yes.
- **Owned-reads catch:** the docs say the $0.001 rate applies only when `{id}` is the authenticated user and that user owns the developer app. For a multi-user SaaS like xpost, reads of end users' own data are therefore probably billed at the normal rate. A staff reply contradicts this, so it is UNVERIFIED.
- **Who pays:** every API post is charged to the developer account that owns the app, which is xpost's account. Credits are prepaid. The Basic-migration announcement mentions auto-recharge and spend caps; the default values are UNVERIFIED.
- **Bring your own keys, exact wording [LIVE]:**
  - Developer Agreement §G Security: "You will maintain the security of the X API and will not make available to any third party any token, key, password, or other login credentials to the X API." Clause (e) in the Restrictions section repeats this.
  - Developer Policy: "**You must keep all API keys or other access credentials private.** You may not use, and may not encourage or facilitate others to use, API keys or other access credentials owned by others."
  - Developer Policy: "You may not store X passwords, or request that people provide their X password, account credentials, or developer application information (including consumer key) to you directly."
  - Sources: https://docs.x.com/developer-terms/agreement, https://docs.x.com/developer-terms/policy
- **Bring your own keys:** effectively **not allowed**.
  - The Developer Agreement says not to "make available to any third party any token, key, password, or other login credentials": https://docs.x.com/developer-terms/agreement
  - The Developer Policy says developers may not "use, or encourage others to use, API keys owned by others", and may not ask users for "developer application information such as the consumer key": https://docs.x.com/developer-terms/policy
  - X staff on the forum rejected a kit where each end user creates their own developer app: https://devcommunity.x.com/t/clarification-on-distributing-a-local-x-api-setup-kit-where-each-user-creates-their-own-developer-app/273564. That ruling is forum-only.
  - The sanctioned model is one xpost-owned app plus per-user OAuth.
- **Cost-control idea for xpost:** a confirming read after posting is unnecessary, because the `POST /2/tweets` response already returns `data.id` and `text`. Build the post URL as `https://x.com/i/status/{id}`. Fetch the username once at connect time (one users/me read), not on every post.

### 10. Posting UX demands
- You need express, informed consent per user before acting on their behalf, and authenticating alone is not consent. Show the user exactly what will be posted. Services that perform write actions must follow the Automation Rules. https://docs.x.com/developer-terms/policy
- No identical or substantially similar posts across multiple accounts you operate. https://help.x.com/en/rules-and-policies/x-automation, https://help.x.com/en/rules-and-policies/authenticity. Cross-posting the same content to one user's own X account plus other platforms is fine. Posting to multiple X accounts of the same user needs varied content.
- No formal app review exists. Restricted use cases: https://docs.x.com/developer-terms/restricted-use-cases

### 11. OAuth details
- Supports OAuth 2.0 Authorization Code with PKCE, for both public and confidential clients. Authorize at `https://x.com/i/oauth2/authorize`; the token endpoint is `https://api.x.com/2/oauth2/token`. https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code, https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token
- Scopes for xpost: `tweet.write` (post and repost), `tweet.read`, `users.read`, `media.write` (upload media) and `offline.access` (refresh token). Same sources. X docs say `tweet.read` and `users.read` are typically required with `tweet.write`; that requirement is UNVERIFIED.
- **Redirect URLs [LIVE]:** `redirect_uri` "must correspond to one of the Callback URLs defined in your App's settings … you will need to have exact match validation". https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- Grant types supported: "authorization code with PKCE and refresh token", plus RFC 8693 token exchange for OAuth 1.0a users. The 2-hour lifetime without `offline.access` is confirmed on the page.
- Custom scheme or loopback support for Electron is still UNVERIFIED. Use the Worker's HTTPS callback.

**Rate limits, confirmed live [LIVE]** (https://docs.x.com/x-api/fundamentals/rate-limits):

| Endpoint | Per app | Per user |
|---|---|---|
| `POST /2/tweets` | 10,000 / 24 h | 100 / 15 min |
| `GET /2/users/me` | n/a | 75 / 15 min |
| `POST /2/media/upload/initialize` | 180,000 / 24 h | 1,875 / 15 min |
| `POST /2/media/upload/:id/append` | 180,000 / 24 h | 1,875 / 15 min |
| `POST /2/media/upload/:id/finalize` | 180,000 / 24 h | 1,875 / 15 min |
| `GET /2/media/upload` (status) | 100,000 / 24 h | 1,000 / 15 min |

**Developer Guidelines, confirmed live [LIVE]** (https://docs.x.com/developer-guidelines): "No scraping, browser automation, or unofficial methods. Violations result in permanent suspension." They list "Non-API Automation: Browser scripting, scraping, any automation outside official API" as prohibited.

### Expected constraints check
- **"X: pay per use."** CONFIRMED. https://docs.x.com/x-api/getting-started/pricing
- **"Every API post is charged to my developer account."** CONFIRMED, at $0.015 per post. BYO keys are not a legal workaround (section 9).
- **"Posts with links cost much more."** CONFIRMED: $0.20 versus $0.015, about 13x, since 2026-04-20. Summoned replies are exempt at $0.01.
- **"Web intent pre-fills text and links for free."** CONFIRMED (text, url, hashtags, via, in_reply_to). It cannot attach media.
- **"X bans scripting its website outright."** CONFIRMED. The Automation Rules name "scripting the X website" as prohibited non-API automation. The ToS bans automated access other than published interfaces. The Developer Guidelines ban browser automation.

### Mode recommendation for X
- **Official API: viable.** It is the only automated route. Every post costs xpost money ($0.015, or $0.20 with a link), so meter usage and consider putting links in a self-reply only when it is a summoned reply, or pricing link posts separately. Media cost is UNVERIFIED.
- **Intent: viable and recommended as the free default for text and link posts.** It does not cover media, so pair it with handoff.
- **Handoff: viable.** Open the X composer in the user's browser, copy the caption, and hand over the file. On phones, use the Web Share API share sheet to the X app.
- **Assisted fill: NOT allowed.** It is scripting the website under the Automation Rules, and embedded sign-in is also doubtful.

---

## Snapchat

### Second-pass live findings [LIVE] (these override conflicting first-pass text below)
Sources: https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted, https://developers.snap.com/marketing-api/Public-Profile-API/ProfileAssetManagement, https://developers.snap.com/marketing-api/Public-Profile-API/Profiles

**Access**
- "The Public Profile API is currently allowlist only. Once you have created your OAuth app, send just the client ID to your Snap contact, and they will coordinate allowlisting your app."
- "This API requires allow listing to access … send an email to your Snap point of contact with your OAuth client id and a description of your intended use."
- Prerequisites: a Snapchat account, a **Business Account (Organization)**, and an OAuth app.
- Create the OAuth app in Ads Manager under **Business Dashboard → Business Details**. The page warns: "Do not use the Developer Portal to generate the OAuth App. The Client ID will not work with the Public Profile API."
- Endpoints come in two kinds. Public endpoints (`/public/v1/...`) need no owner authorization. Authorized endpoints need either Creator OAuth or the creator's opt-in data sharing.

**"Read only" contradiction: resolved**
- The note "Snap public profile APIs are read only" sits inside the **Profiles** page, in the profile-entity section. It means profile metadata cannot be edited through the API.
- The Profile Asset Management page documents write endpoints:
  - `POST /v1/public_profiles/{profile_id}/media`
  - `POST /v1/public_profiles/{profile_id}/stories`
  - `POST /v1/public_profiles/{profile_id}/spotlights`
  - `POST /v1/public_profiles/{profile_id}/saved_stories`
  - `DELETE` for spotlights and saved_stories
- The only feature-level "behind an allowlist" note on that page is about **Image Based Content Metadata** (machine-learning tags), not posting. Correction: posting has no separate allowlist beyond the API-wide one.

**Media**
- A media object has `type` VIDEO or IMAGE. It is encrypted with AES-256-CBC, with the key and IV sent base64-encoded.
- Files up to **1 GB** go through multipart upload in chunks of up to 32 MB (ADD, then FINALIZE). Media expires after 24 h.

**Story**
- Video: .mp4, **5–300 s** ("A long video is posted as several Snaps"), any resolution and aspect ratio. Images are also accepted (media type IMAGE).
- Optional `customized_ttl`: ONE_DAY, TWO_DAYS, THREE_DAYS or ONE_WEEK. The default is 24 h.
- Optional `link`, `link_sticker_placement`, and `link_sticker_text` (40 characters or fewer, no emoji).
- Optional `captions`: one caption of 1–250 characters on one line, Latin, Greek or Cyrillic only, no emoji.
- With a link or captions the video must be vertical 9:16. One error message says "9:16 or 16:9", which conflicts.
- Error codes include `MEDIA_EXPIRED` and `MEDIA_POSTING_ALREADY_IN_PROGRESS`. Errors such as `VALIDATION_ERROR_CAPTIONS_NOT_ALLOWED` and `…LINK_STICKER_REQUIRES_OVERLAY` mean captions and link stickers can be unavailable to some apps ("contact your Snap partner manager").
- The docs mention "scheduled posts", but I found no scheduling parameter documented.

**Spotlight**
- Video only: .mp4, **5–300 s**.
- Requires `locale` (for example `en_US`). Optional `description` "up to a 160 characters and can include hashtags", plus `link`, link sticker and `captions` as for Stories.
- Starts as SUBMITTED and goes through approval, then LIVE or REJECTED.
- `skip_save_to_profile` is no longer supported; Snapchat decides profile visibility.

**OAuth**
- Authorize at `https://accounts.snapchat.com/login/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…&scope=snapchat-profile-api&state=…`.
- Exchange the code at `https://accounts.snapchat.com/login/oauth2/access_token` with the client secret. The response has `expires_in: 3600` and a refresh token.
- That is a confidential-client flow. PKCE is not mentioned (still UNVERIFIED), so the code exchange must run server-side on the Worker.

**Creative Kit for Web** (https://developers.snap.com/snap-kit/creative-kit/web)
- "There is no special setup required to use Creative Kit Web (other than including the share button on your site)." So the web share button needs no Snap Kit review.
- It requires Snapchat 10.67+. An optional sticker comes from the `snapchat:sticker` meta tag: 400x400, transparent, under 1 MB, PNG or WebP.
- It still shares URLs only.

**Still UNVERIFIED**
- Electron login: no official documentation found. It needs an empirical test, and assisted fill is banned anyway.
- Snap ToS wording: www.snap.com is blocked by the proxy, so this stays a search excerpt.
- Snap API rate limits: not documented on the pages read.

### 1. Posting API and content types
- **Public Profile API** (part of the Snap Marketing API, base `https://businessapi.snapchat.com/v1/public_profiles/{profile_id}/...`):
  - **Media:** create a media object (owned by the profile, valid for 24 h). The file is encrypted client-side, with the key and IV sent base64-encoded. Files larger than 32 MB are split into multipart chunks (parts numbered 1–35), followed by FINALIZE. https://developers.snap.com/marketing-api/Public-Profile-API/ProfileAssetManagement
  - **Public Story post:** takes `media_id`, optional TTL and optional link. A media object that has expired returns `MEDIA_EXPIRED`. Same page.
  - **Spotlight post:** takes `media_id` and `locale`, with optional description and link. The post starts as SUBMITTED and goes through an approval review before becoming LIVE (or REJECTED). Same page, plus https://developers.snap.com/marketing-api/Public-Profile-API/Profiles
  - **Saved Stories:** created from a Spotlight, a public-story snap, or uploaded media. Only one per request. Same page.
- Content specs:
  - Story and Spotlight video: .mp4, at least 540x960. Story allows 5–60 s.
  - Spotlight allows 6–60 s in the Public Profile docs, but 5–60 s in Creator Ads docs: https://developers.snap.com/marketing-api/Creator-Ads/TechnicalReference. The conflict is unresolved.
  - Image Story posts are UNVERIFIED; the media object docs say "one video or image".
- There is no text-only post and no GIF posting; Snapchat is a visual-first platform.
- The Profiles page still carries a contradictory note that the "public profile APIs are read only". https://developers.snap.com/marketing-api/Public-Profile-API/Profiles. Treat posting capability as real but **gated**: the posting pages exist and are behind an allowlist.

### 2. Access needed
- Developer side:
  - A Snap Business account and a Marketing API OAuth app.
  - The **Public Profile API requires allowlisting**: you email your Snap point of contact your OAuth client ID and a description of your intended use. https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted
  - The Spotlight and Profile Asset pages say the feature "is behind an allowlist … reach out to your Snap point of contact". https://developers.snap.com/marketing-api/Public-Profile-API/ProfileAssetManagement
  - In practice you need a Snap partner or sales contact. Whether small developers can get one is UNVERIFIED and likely hard.
- User side:
  - The user needs a **Public Profile** (Creator or business).
  - Only Profile **Admins** can post Saved Stories; Collaborators and Insights Viewers cannot. https://businesshelp.snapchat.com/s/article/public-profile-roles?language=en_GB, https://help.snapchat.com/hc/en-us/articles/7012384842772-What-are-the-different-roles-and-permissions-for-Public-Profiles
  - Brand access to creator data requires creator consent and authorization: https://developers.snap.com/marketing-api/Public-Profile-API/PartnershipRoles
  - Private (friends-only) accounts and private "My Story" have no API.

### 3. What an unapproved app can and cannot do
- Without the allowlist: no Story, Spotlight or Saved Story posting via the API. At best, read-only Public Profile endpoints (scope `snapchat-profile-api`) and the public discovery endpoints under `/public/v1/`. https://developers.snap.com/marketing-api/Public-Profile-API/CreatorDiscovery
- Snap Kit apps can test in a developer or staging environment with no approval. Production requires Submit for Review in the Snap Kit Developer Portal; the production token is enabled only after approval. Review takes about 1–2 business days, a figure from the Camera Kit docs. https://developers.snap.com/snap-kit/app-review/submission-and-review, https://developers.snap.com/snap-kit/developer-portal/developing-your-app, https://developers.snap.com/camera-kit/app-review/release-app

### 4. Official share and deep-link routes
- **Creative Kit for Web:** a share button (`div.snapchat-creative-kit-share` with `data-share-url`) or the plain link `https://www.snapchat.com/share?link=<encoded URL>`. https://developers.snap.com/snap-kit/creative-kit/web, https://developers.snap.com/api/snapchat-for-web/social-plugins/share-link-to-snapchat
  - On desktop it shows a Snapcode to scan. On mobile it deep-links into the app to attach the URL to a Snap or send it in chat.
  - The preview comes from OG tags.
  - It **shares a URL only, not video or image media**, and has no caption parameter. The user takes the Snap and chooses where to post.
- **Creative Kit for iOS/Android** can share media into the Snapchat camera, but it is native-only and does not apply to a web or Electron app. https://developers.snap.com/snap-kit/creative-kit/overview. URL stickers require an allowlist requested at review.
- **Camera Kit** embeds Snap AR lenses in your own app and is not a posting route. Not applicable.

### 5. Web upload page and Electron sign-in
- Official web uploaders exist:
  - **profile.snapchat.com:** sign in, drag in a video, choose "Spotlight Snaps" or "My Story" under "Send to", agree to the Creator Terms, then click "Post to Snapchat". https://help.snapchat.com/hc/en-us/articles/7012293789972-How-do-I-submit-a-Snap-to-Spotlight-from-the-web, https://help.snapchat.com/hc/en-us/articles/7012310003348-How-to-Post-a-Snap-to-My-Story-from-the-Web
  - **my.snapchat.com:** for Public Profiles, posts Story and Spotlight video. Files must be .mp4, 5–60 s, at least 540x960. Posting to Public Story and Spotlight at once is not supported; it takes two uploads. https://businesshelp.snapchat.com/s/article/public-profiles-content-web?language=en_GB
  - **www.snapchat.com/spotlight** also lets you upload and schedule. https://businesshelp.snapchat.com/s/article/spotlight-profile-content?language=en_US
  - Story posting in a browser is also described here: https://help.snapchat.com/hc/en-us/articles/39147642050964-How-do-I-post-a-Snapchat-Story-on-a-web-browser
- Snapchat for Web supports Chrome, Edge and Safari: https://help.snapchat.com/hc/en-us/articles/8133227022484-How-do-I-get-Snapchat-for-Web. Electron is Chromium, but whether Snap's login (which can involve app-based 2FA, device confirmation or bot checks) works in an Electron window is **UNVERIFIED**. Moot anyway (section 6).

### 6. Terms on automation outside the API
- The Snap Terms of Service say users may not "use any robot, spider, crawler, scraper, script, or other automated or **semi-automated** means to access … the Services". They also prohibit using or developing "third-party applications that interact with the Services or other users' content or information without our written consent". https://www.snap.com/terms
- Pre-filling the my.snapchat.com or profile.snapchat.com form from a script inside an app window is a "script / semi-automated means" and a third-party application interacting with the Services without consent. **Prohibited.**
- Snap Kit apps are additionally bound by the Developer Terms and the App Review and Safety Guidelines: https://developers.snap.com/snap-kit/app-review/safety. I could not read the full Snap Developer Terms text (UNVERIFIED wording).
- Community Guidelines: https://values.snap.com/policy/policy-community-guidelines

### 7. How media gets in
- **API: upload only.** The client encrypts the file and uploads it in chunks of up to 32 MB, with up to 35 parts, then FINALIZE. https://developers.snap.com/marketing-api/Public-Profile-API/ProfileAssetManagement. I found no URL pull (UNVERIFIED absence).
- **Web uploader:** a manual file pick or drag-and-drop.

### 8. Limits
- Video: .mp4, 5–60 s (Story) or 6–60 s (Spotlight per the Public Profile docs), at least 540x960 (vertical 9:16 implied). Media objects expire 24 h after creation.
- The maximum file size is implied by 35 parts of up to 32 MB each, but the exact figure is UNVERIFIED.
- Spotlight descriptions have a character limit that is UNVERIFIED; I found nothing. Story link field: present.
- API rate limits: UNVERIFIED.
- **Tokens:** OAuth 2.0 via accounts.snapchat.com.
  - The access token lasts 3600 s (1 h), with a long-lived refresh token (`grant_type=refresh_token`). https://developers.snap.com/marketing-api/Ads-API/authentication
  - The authorization code expires after 10 minutes. https://developers.snap.com/snap-kit/login-kit/Tutorials/web
- The Spotlight approval review adds latency, so status is asynchronous: SUBMITTED, then LIVE or REJECTED.

### 9. Pricing
- I found no per-call fee for the Marketing or Public Profile API. Access is gated by allowlist, not by price (UNVERIFIED that it is free).

### 10. Posting UX demands
- Snap Kit review wants a demo video or screen recording, a description of how each kit is used and what content is created, and resubmission if functionality changes. https://developers.snap.com/snap-kit/app-review/submission-and-review
- The Public Profile allowlist requires describing the intended use to your Snap point of contact. https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted
- The web uploader requires agreeing to the Creator Terms per post. Mirror that in any API flow (UNVERIFIED whether the API requires it).

### 11. OAuth details
- Authorization code flow at accounts.snapchat.com with a `state` parameter, using scope `snapchat-profile-api` for the Public Profile API. https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted, https://developers.snap.com/marketing-api/Ads-API/authentication
- PKCE support for Marketing API apps is UNVERIFIED; Login Kit for web documents PKCE-style flows (UNVERIFIED). The redirect URI must be registered on the app.

### Expected constraints check
- **"API posting goes through the Public Profile API."** CONFIRMED. https://developers.snap.com/marketing-api/Public-Profile-API/ProfileAssetManagement
- **"Public profiles only."** CONFIRMED. Endpoints are under `/public_profiles/{id}` and only Admins can post.
- **"Access may need approval."** CHANGED, stronger [LIVE]: "The Public Profile API is currently allowlist only." Allowlisting through a Snap contact is required, and you need a Business Account plus an OAuth app created in Ads Manager, not in the Developer Portal. Spotlight posts also go through per-post approval before going LIVE.
- **Spec correction [LIVE]:** Story and Spotlight video run 5–300 s, not a 60 s maximum. Images can be posted to Stories. The earlier 60 s and 540x960 limits apply to the web uploader (businesshelp article), not to the API.
- **"A web uploader exists."** CONFIRMED: profile.snapchat.com, my.snapchat.com and snapchat.com/spotlight. The help pages disagree on which URL is canonical.
- New finding: Creative Kit for Web shares **URLs only**, not media.

### Mode recommendation for Snapchat
- **Official API: viable only after allowlisting.** Apply early. Build it behind a feature flag for Public Profile Admins: Story (5–60 s), Spotlight (6–60 s, asynchronous approval) and Saved Story.
- **Share route (Creative Kit for Web or the `snapchat.com/share?link=` link): viable** for link sharing only, which has limited value for video crossposting. **Resolved [LIVE]:** Creative Kit Web needs "no special setup", so no app review.
- **Handoff: viable and the recommended default.** Open my.snapchat.com (Public Profile) or profile.snapchat.com in the user's normal browser, copy the caption, and hand over the file. On phones, use the Web Share API share sheet to the Snapchat app.
- **Assisted fill: NOT allowed.** The Snap ToS bans "script, or other automated or semi-automated means" and unauthorized third-party apps interacting with the Services. Electron login is also unverified.
