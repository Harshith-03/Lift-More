import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiRequestError, isRetryable, request, setUnauthorizedHandler } from './api';

function res(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('api client', () => {
  it('sends same-origin credentials, JSON content-type on mutations only', async () => {
    const f = vi.fn(async () => res({ ok: true }, 200));
    vi.stubGlobal('fetch', f);
    await request('GET', '/api/x');
    await request('POST', '/api/y', { body: { a: 1 } });
    await request('DELETE', '/api/z');
    const [get, post, del] = f.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(get![1]).toMatchObject({ method: 'GET', credentials: 'same-origin' });
    expect((get![1].headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(post![1]).toMatchObject({ method: 'POST', body: '{"a":1}', headers: expect.objectContaining({ 'Content-Type': 'application/json' }) });
    expect(del![1]).toMatchObject({ method: 'DELETE', headers: expect.objectContaining({ 'Content-Type': 'application/json' }) });
  });

  it('parses ApiError bodies into ApiRequestError (status, code, retryAfterSec)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ error: 'rate_limited', message: 'Slow down', retryAfterSec: 42 }, 429)));
    const err = await request('POST', '/api/coach/ask', { body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', retryAfterSec: 42, message: 'Slow down' });
    expect(isRetryable(err)).toBe(true);
  });

  it('falls back to the Retry-After header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ error: 'rate_limited', message: 'x' }, 429, { 'Retry-After': '7' })));
    await expect(request('GET', '/api/x')).rejects.toMatchObject({ retryAfterSec: 7 });
  });

  it('maps fetch failures to a network error (status 0)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const err = (await request('GET', '/api/x').catch((e: unknown) => e)) as ApiRequestError;
    expect(err.status).toBe(0);
    expect(err.isNetwork).toBe(true);
    expect(isRetryable(err)).toBe(true);
    expect(isRetryable(new ApiRequestError(400, { message: 'bad' }))).toBe(false);
  });

  it('calls the unauthorized handler on 401, except for opted-out requests', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal('fetch', vi.fn(async () => res({ error: 'unauthorized', message: 'nope' }, 401)));
    await expect(api.routines()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(api.login({ email: 'a@b.c', password: 'wrongpass' })).rejects.toMatchObject({ status: 401 });
    expect(await api.me()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('treats 404 from coach review as "no review yet" and 204 as empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ error: 'not_found', message: 'none' }, 404)));
    expect(await api.coachReview()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    expect(await api.deleteWorkout('w1')).toBeUndefined();
  });
});
