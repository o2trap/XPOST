/**
 * Forked from XLISTit website/lib/lemonsqueezy.ts. Minimal Lemon Squeezy client.
 * - License API (/v1/licenses/*): public, keyed by the licence key itself.
 * - Main API (/v1/license-keys...): needs LS_API_KEY, server-side only.
 * xpost changes: meta includes customer_email (used to match the sign-in email); getLicenceKey() for cron
 * re-validation (xpost stores only a hash of the key, so it cannot call the License API later);
 * getSubscription() for invoice events; HTTP status on errors; catalogue helper and instance listing dropped (M7 adds instances back for desktop devices).
 */
export interface LsLicenceKey { id: number; status: 'inactive' | 'active' | 'expired' | 'disabled'; key: string; activation_limit: number | null; activation_usage: number; created_at: string; expires_at: string | null }
export interface LsInstance { id: string; name: string; created_at: string }
export interface LsMeta {
  store_id: number; order_id: number; order_item_id?: number; product_id: number; product_name: string; variant_id: number; variant_name: string;
  customer_id?: number; customer_name?: string; customer_email?: string;
}
export interface LsLicenceResponse {
  activated?: boolean; valid?: boolean; deactivated?: boolean; error: string | null;
  license_key?: LsLicenceKey; instance?: LsInstance | null; meta?: LsMeta;
}
/** Main API licence-key object (only the fields xpost reads). */
export interface LsLicenceKeyResource {
  id: string;
  attributes: { store_id: number; product_id: number; order_id: number; status: LsLicenceKey['status']; disabled?: boolean; expires_at: string | null; activation_limit?: number | null };
}

/** `status`: HTTP status from Lemon Squeezy, or 0 when it could not be reached. */
export class LemonSqueezyError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
  /** LS is down, rate limiting, or the API key is wrong: retrying other keys now won't help. */
  get global() { return this.status === 0 || this.status === 429 || this.status >= 500 || this.status === 401 || this.status === 403; }
}

/** Main API subscription object (only the fields xpost reads). */
export interface LsSubscriptionResource {
  id: string;
  attributes: { store_id: number; order_id: number; product_id: number; variant_id: number; status: string; updated_at?: string };
}

export class LemonSqueezy {
  // Wrapped: Workers throws "Illegal invocation" if the global fetch is called as a method of another object.
  constructor(private base: string, private apiKey: string | undefined, private fetchFn: typeof fetch = (input, init) => fetch(input, init)) {}

  activate(key: string, instanceName: string) { return this.licence('activate', { license_key: key, instance_name: instanceName }); }
  validate(key: string, instanceId?: string) { return this.licence('validate', { license_key: key, ...(instanceId ? { instance_id: instanceId } : {}) }); }
  deactivate(key: string, instanceId: string) { return this.licence('deactivate', { license_key: key, instance_id: instanceId }); }

  get hasApiKey() { return !!this.apiKey; }

  /** A licence key by its LS ID, or null if LS says it does not exist. */
  async getLicenceKey(id: number): Promise<LsLicenceKeyResource | null> {
    const res = await this.api('GET', `/v1/license-keys/${encodeURIComponent(String(id))}`, undefined, true);
    return res === null ? null : (res as { data: LsLicenceKeyResource }).data;
  }
  /** A subscription by ID (maps subscription invoice events to an order), or null if LS says it does not exist. */
  async getSubscription(id: number): Promise<LsSubscriptionResource | null> {
    const res = await this.api('GET', `/v1/subscriptions/${encodeURIComponent(String(id))}`, undefined, true);
    return res === null ? null : (res as { data: LsSubscriptionResource }).data;
  }
  async licenceKeysForOrder(orderId: number): Promise<{ id: string; attributes: { status: string } }[]> {
    return ((await this.api('GET', `/v1/license-keys?filter[order_id]=${orderId}`)) as { data: { id: string; attributes: { status: string } }[] }).data;
  }
  async disableLicenceKey(id: string) {
    await this.api('PATCH', `/v1/license-keys/${encodeURIComponent(id)}`, { data: { type: 'license-keys', id, attributes: { disabled: true } } });
  }

  private async licence(action: string, params: Record<string, string>): Promise<{ status: number; body: LsLicenceResponse }> {
    this.requests++;
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}/v1/licenses/${action}`, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(15_000),
      });
    } catch (e) { throw new LemonSqueezyError(`Lemon Squeezy unreachable: ${(e as Error).message}`); }
    if (res.status >= 500 || res.status === 429) throw new LemonSqueezyError(`Lemon Squeezy ${action} returned HTTP ${res.status}`, res.status);
    const body = (await res.json().catch(() => null)) as LsLicenceResponse | null;
    if (!body || typeof body !== 'object') throw new LemonSqueezyError(`Lemon Squeezy ${action} returned non-JSON (HTTP ${res.status})`);
    return { status: res.status, body };
  }

  /** Requests made by this client (the Free plan allows 50 subrequests per invocation). */
  requests = 0;

  private async api(method: string, path: string, body?: unknown, nullOn404 = false): Promise<unknown> {
    this.requests++;
    if (!this.apiKey) throw new LemonSqueezyError('LS_API_KEY is not configured');
    const res = await this.fetchFn(`${this.base}${path}`, {
      method, headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', Authorization: `Bearer ${this.apiKey}` },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000),
    }).catch((e: Error) => { throw new LemonSqueezyError(`Lemon Squeezy unreachable: ${e.message}`); });
    if (nullOn404 && res.status === 404) return null;
    if (!res.ok) throw new LemonSqueezyError(`Lemon Squeezy ${method} ${path.split('?')[0]!.replace(/\/\d+$/, '/:id')} returned HTTP ${res.status}`, res.status);
    // A 2xx that isn't JSON is about this request only (status stays 2xx, so LemonSqueezyError.global is false).
    try { return await res.json(); } catch { throw new LemonSqueezyError(`Lemon Squeezy ${method} ${path.split('?')[0]!.replace(/\/\d+$/, '/:id')} returned non-JSON (HTTP ${res.status})`, res.status); }
  }
}
