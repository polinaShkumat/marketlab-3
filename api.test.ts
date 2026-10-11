import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, clearCache, fetchJson } from '../api/_lib/core';
import { detectGaps, normalizeCoinbase, normalizeTiingo } from '../api/_lib/providers';
import { GET as historyGET } from '../api/history';
import { GET as quoteGET } from '../api/quote';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearCache(); delete process.env.TIINGO_API_KEY; });

describe('provider normalization', () => {
  it('normalizes Coinbase candles (newest-first arrays) and dedupes dates', () => {
    const rows = [
      [1704153600, 44000, 46000, 45000, 45500, 10], // 2024-01-02
      [1704067200, 42000, 45000, 42500, 44900, 12], // 2024-01-01
      [1704067200, 42000, 45000, 42500, 44900, 12],
    ];
    const bars = normalizeCoinbase(rows);
    expect(bars.map((b) => b.date)).toEqual(['2024-01-01', '2024-01-02']);
    expect(bars[0]).toMatchObject({ open: 42500, high: 45000, low: 42000, close: 44900, split: 1, dividend: 0 });
  });

  it('drops invalid Tiingo rows instead of inventing values', () => {
    const ok = { date: '2008-01-02T00:00:00.000Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, adjOpen: 1, adjHigh: 2, adjLow: 0.5, adjClose: 1.5, divCash: 0, splitFactor: 1 };
    const { bars, dropped } = normalizeTiingo([ok, { ...ok, date: '2008-01-03', close: null as unknown as number }, { ...ok, date: '2008-01-04', high: 0.1 }]);
    expect(bars).toHaveLength(1);
    expect(dropped).toBe(2);
  });

  it('detects calendar gaps', () => {
    const mk = (date: string) => ({ date } as never);
    expect(detectGaps([mk('2021-01-01'), mk('2021-01-02'), mk('2023-07-13')], 3)).toEqual([{ from: '2021-01-02', to: '2023-07-13', days: 922 }]);
  });
});

describe('resilient fetching', () => {
  it('retries on 5xx then succeeds', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('oops', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await expect(fetchJson('https://x', { provider: 'T', baseDelayMs: 1 })).resolves.toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('maps persistent 429 to RATE_LIMITED and 401 to CONFIG_REQUIRED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('', { status: 429 })));
    await expect(fetchJson('https://x', { provider: 'T', baseDelayMs: 1 })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('', { status: 401 })));
    await expect(fetchJson('https://x', { provider: 'T', baseDelayMs: 1 })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('API routes', () => {
  it('returns CONFIG_REQUIRED for equities when no Tiingo key is configured', async () => {
    const res = await historyGET(new Request('http://localhost/api/history?symbol=AAPL&kind=equity'));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('CONFIG_REQUIRED');
  });

  it('rejects invalid symbols', async () => {
    const res = await historyGET(new Request('http://localhost/api/history?symbol=%3Cscript%3E&kind=crypto'));
    expect(res.status).toBe(400);
  });

  it('falls back from IEX to end-of-day close and labels the basis', async () => {
    process.env.TIINGO_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/iex/')) return new Response('', { status: 500 });
      if (url.includes('/prices')) return new Response(JSON.stringify([
        { date: '2026-10-08T00:00:00.000Z', open: 1, high: 2, low: 1, close: 100, volume: 5, adjOpen: 1, adjHigh: 2, adjLow: 1, adjClose: 100, divCash: 0, splitFactor: 1 },
        { date: '2026-10-09T00:00:00.000Z', open: 1, high: 200, low: 1, close: 110, volume: 7, adjOpen: 1, adjHigh: 200, adjLow: 1, adjClose: 110, divCash: 0, splitFactor: 1 },
      ]));
      return new Response(JSON.stringify({ name: 'Test Co' }));
    }));
    const res = await quoteGET(new Request('http://localhost/api/quote?kind=equity&symbols=TST'));
    const body = await res.json();
    expect(body.results[0].quote).toMatchObject({ price: 110, basis: 'eod-close', reference: 100 });
    expect(body.results[0].quote.changePct).toBeCloseTo(10);
  });
});

describe('keys entered on the website', () => {
  const fredOk = vi.fn().mockImplementation(async (url: string) =>
    new Response(JSON.stringify(url.includes('/observations')
      ? { observations: [{ date: '2026-10-08', value: '4.10' }, { date: '2026-10-09', value: '.' }] }
      : { seriess: [{ title: '10Y', units: 'Percent', frequency: 'Daily', last_updated: 'x', observation_end: 'x' }] })));

  it('FRED works with a browser key when the server has none, and is not CDN-cached', async () => {
    const { GET } = await import('../api/fred');
    vi.stubGlobal('fetch', fredOk);
    delete process.env.FRED_API_KEY;
    const res = await GET(new Request('http://localhost/api/fred?series=DGS10', { headers: { 'x-fred-key': 'browser-key' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.points).toEqual([{ date: '2026-10-08', value: 4.1 }]); // "." (missing) dropped, not invented
    expect(String(fredOk.mock.calls[0][0])).toContain('api_key=browser-key');
  });

  it('FRED without any key returns CONFIG_REQUIRED', async () => {
    const { GET } = await import('../api/fred');
    delete process.env.FRED_API_KEY;
    const res = await GET(new Request('http://localhost/api/fred?series=DGS10'));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('CONFIG_REQUIRED');
  });

  it('server-key responses stay CDN-cacheable', async () => {
    const { GET } = await import('../api/fred');
    vi.stubGlobal('fetch', fredOk);
    process.env.FRED_API_KEY = 'server-key';
    const res = await GET(new Request('http://localhost/api/fred?series=DGS2'));
    expect(res.headers.get('cache-control')).toContain('s-maxage=21600');
    delete process.env.FRED_API_KEY;
  });
});
