import { ApiError, cacheFor, errorResponse, json } from './_lib/core.js';
import {
  coinbaseQuote, coingeckoMarketCaps, finnhubMarketCap, finnhubQuote,
  tiingoHistory, tiingoIexQuotes, tiingoKey, type Quote,
} from './_lib/providers.js';

export const maxDuration = 30;

type Result = { symbol: string; quote: Quote | null; error: { code: string; message: string } | null };

/**
 * GET /api/quote?kind=equity&symbols=AAPL,MSFT
 * Fallback chain for equities: Tiingo IEX last → Finnhub last (if key) → latest Tiingo daily close.
 * Every quote carries its observation timestamp and basis so the UI can label it honestly.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind') ?? 'equity';
    const symbols = (url.searchParams.get('symbols') ?? '')
      .split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9.\-]{1,15}$/.test(s));
    if (!symbols.length || symbols.length > 40) throw new ApiError(400, 'BAD_REQUEST', 'Provide 1–40 symbols.');

    if (kind === 'crypto') {
      const caps = await coingeckoMarketCaps(symbols);
      const results: Result[] = [];
      for (const s of symbols) {
        try {
          const q = await coinbaseQuote(s);
          results.push({ symbol: s, quote: { ...q, marketCap: caps.get(s) ?? null }, error: null });
        } catch (e) {
          results.push({ symbol: s, quote: null, error: toErr(e) });
        }
      }
      return json({ results, fetchedAt: new Date().toISOString() }, { sMaxAge: 30 });
    }

    const key = tiingoKey(request);
    let iex = new Map<string, Quote>();
    let iexError: ApiError | null = null;
    try {
      iex = await tiingoIexQuotes(symbols, key);
    } catch (e) {
      iexError = e instanceof ApiError ? e : null;
    }
    const results: Result[] = [];
    for (const s of symbols) {
      let q: Quote | null = iex.get(s) ?? null;
      let err: ApiError | null = q ? null : iexError;
      if (!q) {
        try { q = await finnhubQuote(s); } catch (e) { err = e instanceof ApiError ? e : err; }
      }
      if (!q) {
        try {
          const h = await tiingoHistory(s, '2007-01-01', key);
          const last = h.bars.at(-1);
          const prev = h.bars.at(-2);
          if (last) {
            q = {
              symbol: s, kind: 'equity', price: last.close, reference: prev?.close ?? null,
              change: prev ? last.close - prev.close : null, changePct: prev ? (last.close / prev.close - 1) * 100 : null,
              volume: last.volume, volumeLabel: 'Consolidated volume, last session', marketCap: null,
              asOf: `${last.date}T21:00:00Z`, basis: 'eod-close', provider: 'Tiingo EOD',
            };
          }
        } catch (e) {
          err = e instanceof ApiError ? e : err;
        }
      }
      if (q) q = { ...q, marketCap: await finnhubMarketCap(s) };
      results.push({ symbol: s, quote: q, error: q ? null : toErr(err ?? new ApiError(502, 'NO_DATA', `No quote for ${s}.`)) });
    }
    return json({ results, fetchedAt: new Date().toISOString() }, { sMaxAge: cacheFor(request, 60) });
  } catch (e) {
    return errorResponse(e);
  }
}

function toErr(e: unknown) {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: 'UPSTREAM_ERROR', message: 'Quote unavailable.' };
}
