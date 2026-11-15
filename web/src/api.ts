/** Tiny API client. Cookies carry the session; state-changing requests send the CSRF token header. */
import { CSRF_HEADER, CSRF_PRESESSION, type ApiError, type MeResponse } from '@xpost/shared';

let csrf = '';

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

async function call<T>(method: string, path: string, body?: unknown, csrfValue = csrf): Promise<Result<T>> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers[CSRF_HEADER] = csrfValue;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    return { ok: false, status: 0, error: { ok: false, code: 'server_error', message: "Can't reach xpost. Check your connection." } };
  }
  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (res.ok && data) return { ok: true, data: data as T };
  const error = data && typeof data === 'object' && 'message' in data ? (data as ApiError) : { ok: false as const, code: 'server_error' as const, message: 'Something went wrong. Try again.' };
  return { ok: false, status: res.status, error };
}

export async function getMe(): Promise<Result<MeResponse>> {
  const r = await call<MeResponse>('GET', '/api/me');
  if (r.ok) csrf = r.data.csrfToken;
  return r;
}
export async function signIn(email: string, licenceKey: string) {
  const r = await call<{ ok: true; csrfToken: string }>('POST', '/api/auth/sign-in', { email, licenceKey }, CSRF_PRESESSION);
  if (r.ok) csrf = r.data.csrfToken;
  return r;
}
export const signOut = () => call<{ ok: true }>('POST', '/api/auth/sign-out');
export const revokeSession = (id: string) => call<{ ok: true }>('DELETE', `/api/sessions/${encodeURIComponent(id)}`);
