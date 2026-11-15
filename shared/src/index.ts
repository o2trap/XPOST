/** Types and constants shared by the web app and the Worker. */

export const APP_NAME = 'xpost';
export const APP_VERSION = '0.1.0';

export const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'x', 'facebook', 'snapchat'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const isPlatform = (value: unknown): value is Platform =>
  typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);

export interface HealthResponse {
  ok: true;
  name: string;
  version: string;
}

// ---- Auth and licence API (M1) ----

/** Header that carries the CSRF token on every state-changing /api request. */
export const CSRF_HEADER = 'X-XPOST-CSRF';
/** Before sign-in there is no session yet; the sign-in request sends this value in CSRF_HEADER. */
export const CSRF_PRESESSION = 'sign-in';

export const LICENCE_STATUSES = ['active', 'inactive', 'expired', 'disabled', 'refunded'] as const;
export type LicenceStatus = (typeof LICENCE_STATUSES)[number];

/** Error codes the API returns as { ok: false, code, message }. `message` is plain English, safe to show. */
export const API_ERROR_CODES = [
  'bad_request', 'invalid_credentials', 'expired', 'refunded', 'disabled', 'not_configured', 'rate_limited',
  'unauthenticated', 'csrf', 'forbidden_origin', 'not_found', 'licence_blocked', 'upstream_error', 'server_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export interface ApiError { ok: false; code: ApiErrorCode; message: string }

export interface SignInRequest { email: string; licenceKey: string }

export interface LicenceInfo {
  status: LicenceStatus;
  /** Machine-readable reason, e.g. "refunded", "subscription_paused", "payment_failed". */
  reason: string | null;
  /** Plain-English explanation when posting is blocked, or a warning (e.g. a failed payment) when it is not. */
  message: string | null;
  /** False when the licence is blocked: new posts and reminders are paused. */
  canPost: boolean;
  keyLast4: string;
  expiresAt: number | null;
  lastValidatedAt: number;
}

export interface SessionInfo {
  id: string;
  kind: 'web' | 'desktop';
  userAgent: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  current: boolean;
}

export interface MeResponse {
  ok: true;
  user: { id: string; email: string };
  licence: LicenceInfo;
  sessions: SessionInfo[];
  limits: { maxWebSessions: number };
  /** Send this back in CSRF_HEADER on every state-changing request. */
  csrfToken: string;
}
