import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';

const env: Env = {
  ASSETS: { fetch: async (req) => new Response(`asset:${new URL(req.url).pathname}`, { headers: { 'content-type': 'text/html' } }) },
  APP_NAME: 'xpost',
};
const get = (path: string, base = 'https://xpost.example') => worker.fetch(new Request(base + path), env);

describe('worker', () => {
  it('GET /api/health', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: 'xpost', version: '0.1.0' });
  });
  it('unknown /api/* is a JSON 404', async () => {
    const res = await get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
  it('other requests fall through to ASSETS', async () => {
    const res = await get('/some/page');
    expect(await res.text()).toBe('asset:/some/page');
  });
  it('sets security headers on every response', async () => {
    for (const path of ['/api/health', '/api/nope', '/']) {
      const h = (await get(path)).headers;
      expect(h.get('strict-transport-security')).toContain('max-age=');
      expect(h.get('x-content-type-options')).toBe('nosniff');
      expect(h.get('referrer-policy')).toBeTruthy();
      expect(h.get('x-frame-options')).toBe('DENY');
      expect(h.get('content-security-policy')).toContain("frame-ancestors 'none'");
    }
  });
  it('redirects http to https', async () => {
    const res = await get('/api/health', 'http://xpost.example');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://xpost.example/api/health');
  });
  it('does not redirect localhost', async () => {
    expect((await get('/api/health', 'http://localhost:8787')).status).toBe(200);
  });
});
