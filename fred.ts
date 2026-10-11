import { ApiError, DATE_RE, cacheFor, errorResponse, json } from './_lib/core.js';
import { FRED_SERIES, fredKey, fredSeries } from './_lib/providers.js';

/** GET /api/fred?series=DGS10&start=2007-01-01 ; GET /api/fred?list=1 for the catalogue */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('list')) return json({ series: FRED_SERIES }, { sMaxAge: 86400 });
    const series = (url.searchParams.get('series') ?? '').toUpperCase();
    const start = url.searchParams.get('start') ?? '2007-01-01';
    if (!DATE_RE.test(start)) throw new ApiError(400, 'BAD_REQUEST', 'start must be YYYY-MM-DD');
    return json(await fredSeries(series, start, fredKey(request)), { sMaxAge: cacheFor(request, 6 * 3600) });
  } catch (e) {
    return errorResponse(e);
  }
}
