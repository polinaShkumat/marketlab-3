import { ApiError, DATE_RE, SYMBOL_RE, cacheFor, errorResponse, json, requireParam } from './_lib/core.js';
import { coinbaseHistory, tiingoHistory, tiingoKey } from './_lib/providers.js';

export const maxDuration = 30;

/** GET /api/history?symbol=AAPL&kind=equity|crypto&start=2007-01-01 → normalized daily bars */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const symbol = requireParam(url, 'symbol', SYMBOL_RE).toUpperCase();
    const kind = url.searchParams.get('kind') ?? 'equity';
    const start = url.searchParams.get('start') ?? '2007-01-01';
    if (!DATE_RE.test(start)) throw new ApiError(400, 'BAD_REQUEST', 'start must be YYYY-MM-DD');
    if (kind === 'crypto') return json(await coinbaseHistory(symbol, start), { sMaxAge: 6 * 3600 });
    if (kind === 'equity') return json(await tiingoHistory(symbol, start, tiingoKey(request)), { sMaxAge: cacheFor(request, 6 * 3600) });
    throw new ApiError(400, 'BAD_REQUEST', 'kind must be equity or crypto');
  } catch (e) {
    return errorResponse(e);
  }
}
