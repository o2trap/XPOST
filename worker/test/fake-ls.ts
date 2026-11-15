/**
 * Forked from XLISTit website/test/fake-ls.ts. In-memory imitation of Lemon Squeezy's License API plus the bits of
 * the main API xpost uses. Response shapes follow docs.lemonsqueezy.com.
 * xpost changes: per-key customer email (meta.customer_email), GET /v1/license-keys/:id, GET /v1/subscriptions/:id,
 * per-key and disable failure switches, a "down" switch, no
 * HTTP server, defaults are xpost's test store/product (1/10); XLISTit's product in the same store is 20.
 */
export interface FakeKey {
  id: number; key: string; status: 'inactive' | 'active' | 'expired' | 'disabled'; activationLimit: number;
  expiresAt: string | null; createdAt: string; storeId: number; productId: number; variantId: number; orderId: number;
  customerEmail: string; instances: { id: string; name: string; created_at: string }[];
}

export class FakeLemonSqueezy {
  keys = new Map<string, FakeKey>();
  calls: string[] = [];
  apiKey = 'test-ls-api-key';
  /** When set, every request fails with this HTTP status (e.g. 503). */
  down: number | null = null;
  /** Licence key ID -> HTTP status the main API returns for that one key (e.g. 422). */
  keyErrors = new Map<number, number>();
  /** When set, PATCH (disable) requests fail with this status. */
  disableFails: number | null = null;
  /** Main API subscriptions: id -> attributes. */
  subscriptions = new Map<number, { store_id: number; order_id: number; product_id: number; variant_id: number; status: string }>();
  private nextId = 1;

  addKey(p: Partial<FakeKey> & { key: string }): FakeKey {
    const k: FakeKey = {
      id: this.nextId++, status: 'inactive', activationLimit: 2, expiresAt: null, createdAt: new Date().toISOString(),
      storeId: 1, productId: 10, variantId: 100, orderId: 500, customerEmail: 'buyer@example.com', instances: [], ...p,
    };
    this.keys.set(k.key, k);
    return k;
  }

  private meta(k: FakeKey) {
    return { store_id: k.storeId, order_id: k.orderId, order_item_id: 1, product_id: k.productId, product_name: 'xpost', variant_id: k.variantId, variant_name: 'Default', customer_id: 1, customer_name: 'Test Buyer', customer_email: k.customerEmail };
  }
  private lk(k: FakeKey) {
    return { id: k.id, status: k.status, key: k.key, activation_limit: k.activationLimit, activation_usage: k.instances.length, created_at: k.createdAt, expires_at: k.expiresAt };
  }

  /** fetch-compatible entry point */
  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    this.calls.push(`${method} ${url.pathname}`);
    const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (this.down) return j({ error: 'down' }, this.down);

    if (url.pathname.startsWith('/v1/licenses/')) {
      const p = new URLSearchParams(String(init?.body ?? ''));
      const k = this.keys.get(p.get('license_key') ?? '');
      const action = url.pathname.split('/').pop();
      if (!k) return j({ [action === 'activate' ? 'activated' : action === 'validate' ? 'valid' : 'deactivated']: false, error: 'license_key not found.' }, 404);
      if (action === 'activate') {
        if (k.status === 'disabled') return j({ activated: false, error: 'This license key is disabled.', license_key: this.lk(k), meta: this.meta(k) }, 400);
        if (k.status === 'expired') return j({ activated: false, error: 'This license key is expired.', license_key: this.lk(k), meta: this.meta(k) }, 400);
        if (k.instances.length >= k.activationLimit) return j({ activated: false, error: 'This license key has reached the activation limit.', license_key: this.lk(k), meta: this.meta(k) }, 400);
        const inst = { id: crypto.randomUUID(), name: p.get('instance_name') ?? '', created_at: new Date().toISOString() };
        k.instances.push(inst); k.status = 'active';
        return j({ activated: true, error: null, license_key: this.lk(k), instance: inst, meta: this.meta(k) });
      }
      if (action === 'validate') {
        const iid = p.get('instance_id');
        const inst = iid ? k.instances.find((i) => i.id === iid) : null;
        if (iid && !inst) return j({ valid: false, error: 'license_key instance not found.', license_key: this.lk(k), instance: null, meta: this.meta(k) }, 404);
        const valid = k.status === 'active' || k.status === 'inactive';
        return j({ valid, error: valid ? null : `This license key is ${k.status}.`, license_key: this.lk(k), instance: inst ?? null, meta: this.meta(k) });
      }
    }

    // Main API
    if (new Headers(init?.headers).get('authorization') !== `Bearer ${this.apiKey}`) return j({ errors: [{ status: '401' }] }, 401);
    const subM = /^\/v1\/subscriptions\/(\d+)$/.exec(url.pathname);
    if (subM) {
      const sub = this.subscriptions.get(Number(subM[1]));
      return sub ? j({ data: { type: 'subscriptions', id: subM[1], attributes: sub } }) : j({ errors: [{ status: '404' }] }, 404);
    }
    const one = /^\/v1\/license-keys\/(\d+)$/.exec(url.pathname);
    if (one && this.keyErrors.has(Number(one[1]))) return j({ errors: [{ status: String(this.keyErrors.get(Number(one[1]))) }] }, this.keyErrors.get(Number(one[1])));
    if (one && method === 'PATCH' && this.disableFails) return j({ errors: [{ status: String(this.disableFails) }] }, this.disableFails);
    if (one) {
      const k = [...this.keys.values()].find((x) => x.id === Number(one[1]));
      if (!k) return j({ errors: [{ status: '404' }] }, 404);
      if (method === 'PATCH') {
        const attrs = (JSON.parse(String(init?.body)) as { data: { attributes: { disabled?: boolean } } }).data.attributes;
        if (attrs.disabled) k.status = 'disabled';
      }
      return j({ data: { type: 'license-keys', id: String(k.id), attributes: {
        store_id: k.storeId, product_id: k.productId, order_id: k.orderId, status: k.status, disabled: k.status === 'disabled',
        expires_at: k.expiresAt, activation_limit: k.activationLimit, key: k.key, key_short: `XXXX-${k.key.slice(-12)}`, user_email: k.customerEmail,
      } } });
    }
    if (url.pathname === '/v1/license-keys') {
      const orderId = Number(url.searchParams.get('filter[order_id]'));
      return j({ data: [...this.keys.values()].filter((k) => k.orderId === orderId).map((k) => ({ type: 'license-keys', id: String(k.id), attributes: { status: k.status } })) });
    }
    return j({}, 404);
  };
}
