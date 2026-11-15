-- xpost schema v1 (M1). Applied by `wrangler d1 migrations apply xpost` (scripts/deploy.mjs runs it before every deploy).
--
-- Conventions
-- * All times are UTC epoch milliseconds (INTEGER). Never local time; the user's IANA zone is stored separately.
-- * IDs are random 128-bit hex strings made by the Worker (crypto.getRandomValues), except where noted.
-- * Every user-owned row carries user_id, and every query the Worker runs on it filters by user_id.
-- * Secrets are never stored: licence keys and session tokens are stored only as SHA-256 hashes.
-- * No social media platform accounts, tokens or API state (owner decision: no platform APIs).
-- * Migrations must stay backwards compatible with the previous Worker version (add, don't rename or drop),
--   because migrations are applied a few seconds before the new code goes live.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  timezone TEXT,                                  -- IANA zone, e.g. "Europe/London" (set from M2)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;

-- One row per Lemon Squeezy licence key used with xpost. `status` is xpost's view:
--   active   = usable (LS says active or inactive, i.e. valid; web sign-in never activates an LS instance)
--   inactive = blocked by xpost for now (e.g. subscription paused)
--   expired | disabled | refunded = blocked; refunded is sticky (only a new purchase clears it)
CREATE TABLE licences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ls_license_key_hash TEXT NOT NULL UNIQUE,       -- SHA-256 hex of the trimmed, upper-cased key; never the key
  key_last4 TEXT NOT NULL,                        -- for display only ("…AB12")
  ls_license_key_id INTEGER NOT NULL UNIQUE,
  ls_store_id INTEGER NOT NULL,
  ls_product_id INTEGER NOT NULL,
  ls_variant_id INTEGER NOT NULL,
  ls_order_id INTEGER NOT NULL,
  ls_customer_email TEXT NOT NULL,                -- lower-cased, from LS meta.customer_email
  ls_key_status TEXT,                             -- raw LS status: inactive | active | expired | disabled
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'expired', 'disabled', 'refunded')),
  status_reason TEXT,                             -- code shown as plain English by the API (see worker/src/gate.ts)
  expires_at INTEGER,                             -- null = perpetual
  activation_limit INTEGER,                       -- LS activation limit (desktop devices, M7)
  last_validated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX licences_user ON licences (user_id);
CREATE INDEX licences_order ON licences (ls_order_id);
CREATE INDEX licences_revalidate ON licences (last_validated_at) WHERE status <> 'refunded';

-- Desktop app installs (M7). Each one is a Lemon Squeezy licence instance (LS enforces its activation limit;
-- xpost also enforces MAX_DESKTOP_DEVICES). Web sessions never create LS instances.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  licence_id TEXT NOT NULL REFERENCES licences(id) ON DELETE CASCADE,
  ls_instance_id TEXT NOT NULL UNIQUE,
  fingerprint_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('mac', 'windows', 'linux')),
  app_version TEXT,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  deactivated_at INTEGER
) STRICT;
CREATE INDEX devices_licence ON devices (licence_id, deactivated_at);
CREATE INDEX devices_user ON devices (user_id);

-- Signed-in browsers (kind 'web') and, from M7, desktop sessions. The cookie holds a random 256-bit token; only its
-- SHA-256 is stored (token_hash). `id` is a separate random ID that is safe to show and use in URLs.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  licence_id TEXT NOT NULL REFERENCES licences(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('web', 'desktop')),
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  user_agent TEXT CHECK (user_agent IS NULL OR length(user_agent) <= 60),  -- short label, e.g. "Chrome on Windows"
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revoked_reason TEXT CHECK (revoked_reason IS NULL OR revoked_reason IN ('sign_out', 'user_revoked', 'session_limit', 'licence_moved'))
) STRICT;
CREATE INDEX sessions_user ON sessions (user_id, revoked_at);
CREATE INDEX sessions_licence_kind ON sessions (licence_id, kind, revoked_at, created_at);

-- Uploaded media (M2). Files live in R2 under an unguessable key; never proxied through the Worker.
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,                    -- m/<userId>/<random 128-bit>
  file_name TEXT,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  sha256 TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready', 'deleted')),
  multipart_upload_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  delete_after INTEGER
) STRICT;
CREATE INDEX media_user ON media (user_id, created_at);
CREATE INDEX media_cleanup ON media (status, delete_after);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  caption TEXT NOT NULL DEFAULT '',               -- never logged
  fields_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(fields_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'done', 'cancelled')),
  scheduled_at INTEGER,
  timezone TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;
CREATE INDEX posts_user_status ON posts (user_id, status, scheduled_at);

CREATE TABLE post_media (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (post_id, position)
) STRICT;
CREATE INDEX post_media_media ON post_media (media_id);

-- One row per platform a post goes to. Nothing posts automatically: every mode ends with the user pressing Post.
-- 'paused' = held because the licence is blocked; paused_from remembers what to restore when it is usable again.
CREATE TABLE post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'x', 'facebook', 'snapchat')),
  account_label TEXT CHECK (account_label IS NULL OR length(account_label) <= 100),  -- free text, e.g. "@mybrand"
  mode TEXT NOT NULL CHECK (mode IN ('intent', 'handoff', 'assisted')),
  override_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(override_json)),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'waiting', 'handed_off', 'confirmed', 'skipped', 'cancelled', 'paused')),
  paused_from TEXT CHECK (paused_from IS NULL OR paused_from IN ('scheduled')),
  schedule_version INTEGER NOT NULL DEFAULT 1,
  scheduled_at INTEGER,
  handed_off_at INTEGER,
  confirmed_at INTEGER,
  confirmed_url TEXT,
  confirmed_by TEXT CHECK (confirmed_by IS NULL OR confirmed_by IN ('user_confirm', 'user_link', 'assisted_capture')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX post_targets_post ON post_targets (post_id);
CREATE INDEX post_targets_user_status ON post_targets (user_id, status);
CREATE INDEX post_targets_due ON post_targets (status, scheduled_at);

-- Status history of each target (no captions).
CREATE TABLE target_events (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES post_targets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  code TEXT
) STRICT;
CREATE INDEX target_events_target ON target_events (target_id, at);

-- Reminder scheduler (M4): one row per target per channel. 'paused' = held while the licence is blocked.
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES post_targets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'desktop', 'email')),
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled', 'paused')),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX reminders_due ON reminders (status, due_at);
CREATE INDEX reminders_user_status ON reminders (user_id, status);
CREATE INDEX reminders_target ON reminders (target_id);

-- Browser push subscriptions (M4). Public browser keys only; deleted on 404/410 from the push service.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
) STRICT;
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- Changeable without a release: per-platform default mode, kill switches, selector config version, global switches.
CREATE TABLE remote_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at INTEGER NOT NULL
) STRICT;

-- Lemon Squeezy webhook deliveries, so each one is handled once. LS sends no event ID, so the key is the SHA-256
-- of the raw (signed) body: a retry of the same delivery has the same body.
CREATE TABLE webhook_events (
  event_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  result TEXT
) STRICT;
CREATE INDEX webhook_events_received ON webhook_events (received_at);

-- Strict sign-in limits (the Cloudflare rate limiter is approximate). key = "email:<HMAC of the email>".
CREATE TABLE auth_attempts (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
) STRICT;

-- Security events only. No captions, licence keys, tokens or emails; ip_hash is a keyed hash.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sign_in', 'sign_in_failed', 'sign_out', 'session_revoked', 'session_evicted',
    'licence_status', 'device_activated', 'device_deactivated', 'export', 'delete')),
  code TEXT,
  ip_hash TEXT
) STRICT;
CREATE INDEX audit_log_user ON audit_log (user_id, at);

-- Defaults (UPDATE these rows to change behaviour without a release; the Worker falls back to the same values).
-- default modes per Step 0 plan section E: intent where a free share route exists (X, Facebook, Snapchat), else handoff.
INSERT INTO remote_config (key, value, updated_at) VALUES
  ('global', '{"reminders_paused":false,"min_desktop_version":"0.0.0"}', 0),
  ('platform:tiktok', '{"default_mode_web":"handoff","default_mode_desktop":"handoff","intent_enabled":false,"assisted_enabled":true,"selector_config_version":0,"message":null}', 0),
  ('platform:instagram', '{"default_mode_web":"handoff","default_mode_desktop":"handoff","intent_enabled":false,"assisted_enabled":true,"selector_config_version":0,"message":null}', 0),
  ('platform:youtube', '{"default_mode_web":"handoff","default_mode_desktop":"handoff","intent_enabled":false,"assisted_enabled":true,"selector_config_version":0,"message":null}', 0),
  ('platform:x', '{"default_mode_web":"intent","default_mode_desktop":"intent","intent_enabled":true,"assisted_enabled":true,"selector_config_version":0,"message":null}', 0),
  ('platform:facebook', '{"default_mode_web":"intent","default_mode_desktop":"intent","intent_enabled":true,"assisted_enabled":true,"selector_config_version":0,"message":null}', 0),
  ('platform:snapchat', '{"default_mode_web":"intent","default_mode_desktop":"intent","intent_enabled":true,"assisted_enabled":true,"selector_config_version":0,"message":null}', 0);
