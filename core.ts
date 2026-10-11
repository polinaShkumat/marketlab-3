/**
 * Shared server-side utilities for MARKETLAB serverless functions.
 * Files in api/_lib are not exposed as routes by Vercel (underscore prefix).
 */

export type ErrorCode =
  | 'CONFIG_REQUIRED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'NO_DATA';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public provider?: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, opts: { sMaxAge?: number; status?: number } = {}): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (opts.sMaxAge && opts.sMaxAge > 0) {
    // CDN caching on Vercel; browsers revalidate. Keeps provider quotas safe.
    headers['cache-control'] = `public, max-age=0, s-maxage=${opts.sMaxAge}, stale-while-revalidate=${opts.sMaxAge * 2}`;
  } else {
    headers['cache-control'] = 'no-store';
  }
  return new Response(JSON.stringify(data), { status: opts.status ?? 200, headers });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    console.error(`[marketlab] ${err.provider ?? 'api'} ${err.code}: ${err.message}`);
    return json({ error: { code: err.code, message: err.message, provider: err.provider } }, { status: err.status });
  }
  console.error('[marketlab] unexpected error', err);
  return json({ error: { code: 'UPSTREAM_ERROR', message: 'Unexpected server error.' } }, { status: 500 });
}

/**
 * Data fetched with a key that a visitor typed into the website must not be stored in the shared
 * CDN cache, otherwise visitors without a key would receive it (Tiingo forbids redistribution).
 */
export function usesBrowserKey(request: Request): boolean {
  return Boolean(request.headers.get('x-tiingo-key')?.trim() || request.headers.get('x-fred-key')?.trim());
}

export function cacheFor(request: Request, seconds: number): number {
  return usesBrowserKey(request) ? 0 : seconds;
}

/* ---------------- in-memory TTL cache (per serverless instance) ---------------- */

const cache = new Map<string, { expires: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { expires: Date.now() + ttlMs, value });
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}

export function clearCache(): void {
  cache.clear();
  windows.clear();
}

/* ---------------- sliding-window rate guard (per instance, best effort) ---------------- */

const windows = new Map<string, number[]>();

/** Throws RATE_LIMITED before calling upstream when our own budget is exhausted. */
export function rateGuard(provider: string, maxCalls: number, windowMs: number): void {
  const now = Date.now();
  const calls = (windows.get(provider) ?? []).filter((t) => now - t < windowMs);
  if (calls.length >= maxCalls) {
    throw new ApiError(429, 'RATE_LIMITED', `Local request budget for ${provider} reached; try again shortly.`, provider);
  }
  calls.push(now);
  windows.set(provider, calls);
}

/* ---------------- fetch with retry + exponential backoff ---------------- */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RetryOptions {
  provider: string;
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function fetchJson<T = unknown>(url: string, opts: RetryOptions): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 400;
  let lastErr: ApiError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(base * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'marketlab-edu/1.0', ...(opts.headers ?? {}) },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
      });
    } catch (e) {
      lastErr = new ApiError(502, 'UPSTREAM_ERROR', `Network error contacting ${opts.provider}: ${String(e)}`, opts.provider);
      continue;
    }
    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        throw new ApiError(502, 'UPSTREAM_ERROR', `${opts.provider} returned invalid JSON.`, opts.provider);
      }
    }
    const body = await res.text().catch(() => '');
    if (res.status === 429) {
      lastErr = new ApiError(429, 'RATE_LIMITED', `${opts.provider} rate limit reached.`, opts.provider);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(401, 'CONFIG_REQUIRED', `${opts.provider} rejected the API key (HTTP ${res.status}). Check the key and plan.`, opts.provider);
    }
    if (res.status === 404) {
      throw new ApiError(404, 'NOT_FOUND', `${opts.provider}: symbol or series not found.`, opts.provider);
    }
    if (res.status >= 500) {
      lastErr = new ApiError(502, 'UPSTREAM_ERROR', `${opts.provider} server error (HTTP ${res.status}).`, opts.provider);
      continue;
    }
    throw new ApiError(400, 'BAD_REQUEST', `${opts.provider} rejected the request (HTTP ${res.status}): ${body.slice(0, 160)}`, opts.provider);
  }
  throw lastErr ?? new ApiError(502, 'UPSTREAM_ERROR', `${opts.provider} unavailable.`, opts.provider);
}

/* ---------------- validation helpers ---------------- */

export const SYMBOL_RE = /^[A-Za-z0-9.\-]{1,15}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function requireParam(url: URL, name: string, re: RegExp): string {
  const v = url.searchParams.get(name);
  if (!v || !re.test(v)) throw new ApiError(400, 'BAD_REQUEST', `Missing or invalid parameter "${name}".`);
  return v;
}

export function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
