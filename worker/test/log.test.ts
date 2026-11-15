import { describe, expect, it, vi } from 'vitest';
import { logError, logRequest } from '../src/log';

describe('server logs', () => {
  it('never contain licence keys, emails, tokens, cookies or secrets', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('sign-in failed', new Error('key ABCD1234-AAAA-BBBB-CCCC-123456789012 for jane@example.com'),
      { licenceKey: 'XPOST-KEY-0001', cookie: '__Host-xpost_session=abcdefabcdef', password: 'hunter2' }, 'Bearer abc.def');
    const out = spy.mock.calls.flat().join(' ');
    spy.mockRestore();
    expect(out).not.toMatch(/ABCD1234|jane@|XPOST-KEY|abcdefabcdef|hunter2|abc\.def/);
    expect(out).toContain('sign-in failed');
  });

  it('request lines carry method, route, status and code only, with IDs replaced', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logRequest('DELETE', '/api/sessions/0123456789abcdef0123456789abcdef', 404, 'not_found');
    expect(spy.mock.calls[0]![0]).toBe('DELETE /api/sessions/:id 404 not_found');
    spy.mockRestore();
  });
});
