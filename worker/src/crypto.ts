/** Small Web Crypto helpers (SHA-256 and HMAC only: cheap enough for the Free plan's 10 ms CPU limit). */
const enc = new TextEncoder();

/** Forked from XLISTit website/lib/token.ts (base64url). */
export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

/** Random ID: 128 bits as 32 hex characters. */
export function randomId(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

/** Random 256-bit secret token (session cookies). */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

const hmacKeys = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let k = hmacKeys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    hmacKeys.set(secret, k);
  }
  return k;
}

export async function hmac(secret: string, message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message)));
}
export const hmacHex = async (secret: string, message: string) => hex(await hmac(secret, message));
export const hmacB64 = async (secret: string, message: string) => base64url(await hmac(secret, message));

/** Constant-time check that `mac` (bytes) is HMAC-SHA256(secret, message). Web Crypto's verify is constant-time. */
export async function hmacVerify(secret: string, message: string, mac: Uint8Array): Promise<boolean> {
  return crypto.subtle.verify('HMAC', await hmacKey(secret), mac, enc.encode(message));
}

export function fromBase64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch { return null; }
}
