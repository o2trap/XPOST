-- 0002: refunds recorded by order, Lemon Squeezy subscription mapping, stale-event guard.
-- Only CREATE ... IF NOT EXISTS (no ALTER TABLE), so re-running this file after a partial failure is safe.

-- Full refunds of xpost orders, recorded even when nobody has signed in with the order's key yet, so a later
-- sign-in is refused. ls_disabled_at is set once the order's keys are disabled in Lemon Squeezy; while it is
-- null the webhook (on LS retries) and the cron keep trying.
CREATE TABLE IF NOT EXISTS refunded_orders (
  ls_order_id INTEGER PRIMARY KEY,
  ls_store_id INTEGER NOT NULL,
  ls_product_id INTEGER NOT NULL,
  refunded_at INTEGER NOT NULL,
  ls_disabled_at INTEGER,
  disable_attempts INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX IF NOT EXISTS refunded_orders_pending ON refunded_orders (ls_disabled_at, disable_attempts);

-- Lemon Squeezy subscriptions of xpost orders. Subscription invoice events (subscription_payment_*) carry only
-- subscription_id, so this maps them to the order, and through ls_order_id to licences.
CREATE TABLE IF NOT EXISTS ls_subscriptions (
  ls_subscription_id INTEGER PRIMARY KEY,
  ls_order_id INTEGER NOT NULL,
  ls_product_id INTEGER NOT NULL,
  ls_variant_id INTEGER,
  status TEXT,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS ls_subscriptions_order ON ls_subscriptions (ls_order_id);

-- Newest Lemon Squeezy `updated_at` applied per object ("subscriptions:77", "license-keys:5", ...), so an event
-- delivered late (LS retries out of order) cannot undo a newer one.
CREATE TABLE IF NOT EXISTS ls_object_versions (
  object_key TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL
) STRICT;
