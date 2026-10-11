import { ApiError, cacheFor, errorResponse, json } from './_lib/core.js';
import { coinbaseProducts, tiingoKey, tiingoSearch } from './_lib/providers.js';

/** GET /api/search?q=apple → equities/ETFs (Tiingo) and USD crypto pairs (Coinbase) */
export async function GET(request: Request): Promise<Response> {
  try {
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
    if (q.length < 1 || q.length > 40) throw new ApiError(400, 'BAD_REQUEST', 'Query must be 1–40 characters.');
    const notes: string[] = [];
    let equities: Array<{ symbol: string; name: string; kind: 'equity'; type: string }> = [];
    try {
      equities = await tiingoSearch(q, tiingoKey(request));
    } catch (e) {
      notes.push(e instanceof ApiError ? e.message : 'Equity search unavailable.');
    }
    let crypto: Array<{ symbol: string; name: string; kind: 'crypto' }> = [];
    try {
      const up = q.toUpperCase();
      crypto = (await coinbaseProducts())
        .filter((p) => p.symbol.includes(up) || p.name.toUpperCase().includes(up))
        .slice(0, 8)
        .map((p) => ({ ...p, kind: 'crypto' as const }));
    } catch {
      notes.push('Crypto search unavailable.');
    }
    return json({ results: [...equities, ...crypto], notes }, { sMaxAge: cacheFor(request, 3600) });
  } catch (e) {
    return errorResponse(e);
  }
}
