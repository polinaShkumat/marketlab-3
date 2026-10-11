import type { AssetKind, FredSeries, History, QuoteResult } from '../types';

export class ApiFailure extends Error {
  constructor(public code: string, message: string, public provider?: string) {
    super(message);
  }
}

export type KeyName = 'tiingo' | 'fred';
const KEY_STORAGE: Record<KeyName, string> = { tiingo: 'marketlab:user-tiingo-key', fred: 'marketlab:user-fred-key' };
const KEY_HEADER: Record<KeyName, string> = { tiingo: 'x-tiingo-key', fred: 'x-fred-key' };

/** API keys typed into Settings: stored only in this browser, sent only to this site's own /api. */
export function getUserKey(name: KeyName): string {
  try { return localStorage.getItem(KEY_STORAGE[name]) ?? ''; } catch { return ''; }
}
export function setUserKey(name: KeyName, key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE[name], key.trim());
    else localStorage.removeItem(KEY_STORAGE[name]);
  } catch { /* storage unavailable */ }
  historyCache.clear();
  quoteCache.clear();
  fredCache.clear();
}

async function request<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  for (const name of ['tiingo', 'fred'] as KeyName[]) {
    const key = getUserKey(name);
    if (key) headers[KEY_HEADER[name]] = key;
  }
  let res: Response;
  try {
    res = await fetch(path, { headers });
  } catch {
    throw new ApiFailure('NETWORK', 'Network error: the MARKETLAB server could not be reached.');
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    // Typical when /api is served by a static host or `vite preview`: the SPA's index.html comes back.
    throw new ApiFailure(
      'API_UNREACHABLE',
      type.includes('text/html')
        ? 'The MARKETLAB data server is not running: /api returned a web page instead of data. Use `npm run dev` locally (not `npm run preview`), or deploy to Vercel, where the api/ folder runs as serverless functions.'
        : `Unexpected response from the data server (HTTP ${res.status}).`,
    );
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* invalid JSON */ }
  if (body == null) throw new ApiFailure('BAD_RESPONSE', `The data server returned an empty or invalid response (HTTP ${res.status}).`);
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; provider?: string } } | null)?.error;
    throw new ApiFailure(err?.code ?? `HTTP_${res.status}`, err?.message ?? `Request failed (HTTP ${res.status}).`, err?.provider);
  }
  return body as T;
}

/* In-flight de-duplication + session cache. Failed requests are evicted so they can be retried. */
const historyCache = new Map<string, Promise<History>>();
const quoteCache = new Map<string, { at: number; p: Promise<QuoteResult[]> }>();
const fredCache = new Map<string, Promise<FredSeries>>();

export function getHistory(symbol: string, kind: AssetKind, start = '2007-01-01'): Promise<History> {
  const key = `${kind}:${symbol}:${start}`;
  let p = historyCache.get(key);
  if (!p) {
    p = request<History>(`/api/history?symbol=${encodeURIComponent(symbol)}&kind=${kind}&start=${start}`);
    historyCache.set(key, p);
    p.catch(() => historyCache.delete(key));
  }
  return p;
}

export function getQuotes(symbols: string[], kind: AssetKind, maxAgeMs = 30_000): Promise<QuoteResult[]> {
  if (!symbols.length) return Promise.resolve([]);
  const key = `${kind}:${[...symbols].sort().join(',')}`;
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.p;
  const p = request<{ results: QuoteResult[] }>(`/api/quote?kind=${kind}&symbols=${symbols.map(encodeURIComponent).join(',')}`).then((r) => r.results);
  quoteCache.set(key, { at: Date.now(), p });
  p.catch(() => quoteCache.delete(key));
  return p;
}

export function getFred(series: string, start = '2007-01-01'): Promise<FredSeries> {
  const key = `${series}:${start}`;
  let p = fredCache.get(key);
  if (!p) {
    p = request<FredSeries>(`/api/fred?series=${series}&start=${start}`);
    fredCache.set(key, p);
    p.catch(() => fredCache.delete(key));
  }
  return p;
}

export interface SearchResult { symbol: string; name: string; kind: AssetKind; type?: string }
export const searchAssets = (q: string) => request<{ results: SearchResult[]; notes: string[] }>(`/api/search?q=${encodeURIComponent(q)}`);

export interface ProviderStatus { providers: Record<string, { configured: boolean; role: string }>; serverTime: string }
export const getStatus = () => request<ProviderStatus>('/api/status');

export function describeFailure(e: unknown): { state: 'unavailable' | 'rate-limited' | 'config-required'; message: string; code: string } {
  if (e instanceof ApiFailure) {
    if (e.code === 'CONFIG_REQUIRED') return { state: 'config-required', message: e.message, code: e.code };
    if (e.code === 'RATE_LIMITED') return { state: 'rate-limited', message: e.message, code: e.code };
    return { state: 'unavailable', message: e.message, code: e.code };
  }
  return { state: 'unavailable', message: `Data unavailable${e instanceof Error ? `: ${e.message}` : '.'}`, code: 'UNKNOWN' };
}
