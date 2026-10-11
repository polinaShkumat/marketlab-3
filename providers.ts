import { ApiError, cached, fetchJson, num, rateGuard, sleep } from './core.js';

/* ====================================================================== */
/* Normalized types (mirrored in src/types.ts for the client)             */
/* ====================================================================== */

export type AssetKind = 'equity' | 'crypto';

export interface Bar {
  date: string; // YYYY-MM-DD (exchange session date; UTC day for crypto)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjOpen: number;
  adjHigh: number;
  adjLow: number;
  adjClose: number;
  dividend: number; // cash dividend per share with ex-date on this day
  split: number; // split factor effective this day (1 = none)
}

export interface Gap {
  from: string; // last date with data before the gap
  to: string; // first date with data after the gap
  days: number;
}

export interface History {
  symbol: string;
  kind: AssetKind;
  name: string;
  provider: string;
  attribution: string;
  requestedStart: string;
  firstDate: string | null;
  lastDate: string | null;
  bars: Bar[];
  gaps: Gap[];
  droppedRows: number;
  coverageNote: string | null;
  fetchedAt: string;
}

export interface Quote {
  symbol: string;
  kind: AssetKind;
  price: number;
  reference: number | null; // previous close (equity) or price 24h ago (crypto)
  change: number | null;
  changePct: number | null;
  volume: number | null;
  volumeLabel: string;
  marketCap: number | null;
  asOf: string; // ISO timestamp of the observation itself
  basis: 'iex-last' | 'finnhub-last' | 'eod-close' | 'exchange-last';
  provider: string;
}

/* ====================================================================== */
/* Shared helpers                                                         */
/* ====================================================================== */

export function detectGaps(bars: Bar[], maxCalendarDays: number): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < bars.length; i++) {
    const d = (Date.parse(bars[i].date) - Date.parse(bars[i - 1].date)) / 86400000;
    if (d > maxCalendarDays) gaps.push({ from: bars[i - 1].date, to: bars[i].date, days: Math.round(d) });
  }
  return gaps;
}

function validBar(b: Bar): boolean {
  const xs = [b.open, b.high, b.low, b.close, b.adjOpen, b.adjHigh, b.adjLow, b.adjClose];
  return xs.every((x) => Number.isFinite(x) && x > 0) && b.high >= b.low && Number.isFinite(b.volume) && b.volume >= 0;
}

/* ====================================================================== */
/* Tiingo — equities & ETFs                                               */
/* ====================================================================== */

const TIINGO = 'https://api.tiingo.com';
export const TIINGO_ATTRIBUTION = 'Equity & ETF prices: Tiingo (end-of-day; IEX last trade). Not for redistribution.';

/** Prefer a user-supplied key (header) over the deployment key. */
export function tiingoKey(request: Request): string {
  const key = request.headers.get('x-tiingo-key')?.trim() || process.env.TIINGO_API_KEY?.trim();
  if (!key) {
    throw new ApiError(
      503,
      'CONFIG_REQUIRED',
      'Stock and ETF data needs a free Tiingo API key: set TIINGO_API_KEY on the server or paste a key in Settings.',
      'Tiingo',
    );
  }
  return key;
}

interface TiingoRow {
  date: string;
  open: number; high: number; low: number; close: number; volume: number;
  adjOpen: number; adjHigh: number; adjLow: number; adjClose: number;
  divCash: number; splitFactor: number;
}

export function normalizeTiingo(rows: TiingoRow[]): { bars: Bar[]; dropped: number } {
  let dropped = 0;
  const bars: Bar[] = [];
  for (const r of rows) {
    const b: Bar = {
      date: String(r.date).slice(0, 10),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
      volume: Number(r.volume ?? 0),
      adjOpen: Number(r.adjOpen), adjHigh: Number(r.adjHigh), adjLow: Number(r.adjLow), adjClose: Number(r.adjClose),
      dividend: num(r.divCash) ?? 0,
      split: num(r.splitFactor) ?? 1,
    };
    if (validBar(b)) bars.push(b);
    else dropped++;
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  return { bars, dropped };
}

export async function tiingoHistory(symbol: string, start: string, key: string): Promise<History> {
  const t = symbol.toLowerCase();
  return cached(`tiingo:hist:${t}:${start}`, 6 * 3600_000, async () => {
    rateGuard('Tiingo', 45, 3600_000);
    const [meta, rows] = await Promise.all([
      fetchJson<{ name?: string; startDate?: string; endDate?: string }>(`${TIINGO}/tiingo/daily/${t}?token=${key}`, { provider: 'Tiingo' }),
      fetchJson<TiingoRow[]>(`${TIINGO}/tiingo/daily/${t}/prices?startDate=${start}&format=json&token=${key}`, { provider: 'Tiingo' }),
    ]);
    if (!Array.isArray(rows)) throw new ApiError(502, 'UPSTREAM_ERROR', 'Unexpected Tiingo response.', 'Tiingo');
    const { bars, dropped } = normalizeTiingo(rows);
    const first = bars[0]?.date ?? null;
    let coverageNote: string | null = null;
    if (!bars.length) coverageNote = `No Tiingo daily data for ${symbol} since ${start}.`;
    else if (first && first > addDays(start, 7))
      coverageNote = `Data for ${symbol} begins ${first} (listing or provider coverage start). Earlier dates are not available.`;
    if (meta?.endDate && bars.length && meta.endDate.slice(0, 10) < addDays(todayUtc(), -10))
      coverageNote = `${coverageNote ? coverageNote + ' ' : ''}Series ends ${meta.endDate.slice(0, 10)} (possibly delisted or renamed).`;
    return {
      symbol: symbol.toUpperCase(), kind: 'equity', name: meta?.name ?? symbol.toUpperCase(),
      provider: 'Tiingo', attribution: TIINGO_ATTRIBUTION, requestedStart: start,
      firstDate: first, lastDate: bars.at(-1)?.date ?? null, bars,
      gaps: detectGaps(bars, 5), droppedRows: dropped, coverageNote, fetchedAt: new Date().toISOString(),
    };
  });
}

interface TiingoIex {
  ticker: string; tngoLast: number | null; last: number | null; prevClose: number | null;
  volume: number | null; timestamp: string | null; lastSaleTimestamp: string | null;
}

export async function tiingoIexQuotes(symbols: string[], key: string): Promise<Map<string, Quote>> {
  const list = symbols.map((s) => s.toLowerCase()).sort().join(',');
  return cached(`tiingo:iex:${list}`, 60_000, async () => {
    rateGuard('Tiingo', 45, 3600_000);
    const rows = await fetchJson<TiingoIex[]>(`${TIINGO}/iex/?tickers=${list}&token=${key}`, { provider: 'Tiingo IEX' });
    const out = new Map<string, Quote>();
    for (const r of rows ?? []) {
      const price = num(r.tngoLast) ?? num(r.last);
      if (price == null || price <= 0) continue;
      const ref = num(r.prevClose);
      out.set(r.ticker.toUpperCase(), {
        symbol: r.ticker.toUpperCase(), kind: 'equity', price, reference: ref,
        change: ref ? price - ref : null, changePct: ref ? (price / ref - 1) * 100 : null,
        volume: num(r.volume), volumeLabel: 'IEX venue volume (not consolidated)',
        marketCap: null, asOf: r.lastSaleTimestamp ?? r.timestamp ?? new Date().toISOString(),
        basis: 'iex-last', provider: 'Tiingo IEX',
      });
    }
    return out;
  });
}

export async function tiingoSearch(q: string, key: string) {
  return cached(`tiingo:search:${q.toLowerCase()}`, 24 * 3600_000, async () => {
    rateGuard('Tiingo', 45, 3600_000);
    const rows = await fetchJson<Array<{ ticker: string; name: string; assetType: string; isActive: boolean; countryCode: string }>>(
      `${TIINGO}/tiingo/utilities/search?query=${encodeURIComponent(q)}&token=${key}`,
      { provider: 'Tiingo' },
    );
    return (rows ?? [])
      .filter((r) => r.isActive && /stock|etf/i.test(r.assetType) && (!r.countryCode || /us/i.test(r.countryCode)))
      .slice(0, 15)
      .map((r) => ({ symbol: r.ticker.toUpperCase(), name: r.name, kind: 'equity' as const, type: r.assetType }));
  });
}

/* ====================================================================== */
/* Finnhub — optional fallback quote + market cap                         */
/* ====================================================================== */

const FINNHUB = 'https://finnhub.io/api/v1';

export async function finnhubQuote(symbol: string): Promise<Quote | null> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return null;
  return cached(`finnhub:q:${symbol}`, 60_000, async () => {
    rateGuard('Finnhub', 55, 60_000);
    const q = await fetchJson<{ c: number; pc: number; t: number }>(`${FINNHUB}/quote?symbol=${symbol}&token=${key}`, { provider: 'Finnhub', retries: 1 });
    if (!q || !(q.c > 0) || !q.t) return null;
    return {
      symbol, kind: 'equity', price: q.c, reference: q.pc || null,
      change: q.pc ? q.c - q.pc : null, changePct: q.pc ? (q.c / q.pc - 1) * 100 : null,
      volume: null, volumeLabel: 'Not provided', marketCap: null,
      asOf: new Date(q.t * 1000).toISOString(), basis: 'finnhub-last', provider: 'Finnhub',
    } satisfies Quote;
  });
}

export async function finnhubMarketCap(symbol: string): Promise<number | null> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return null;
  return cached(`finnhub:cap:${symbol}`, 12 * 3600_000, async () => {
    try {
      rateGuard('Finnhub', 55, 60_000);
      const p = await fetchJson<{ marketCapitalization?: number }>(`${FINNHUB}/stock/profile2?symbol=${symbol}&token=${key}`, { provider: 'Finnhub', retries: 1 });
      return p?.marketCapitalization ? p.marketCapitalization * 1e6 : null; // reported in USD millions
    } catch {
      return null;
    }
  });
}

/* ====================================================================== */
/* Coinbase Exchange — crypto (public, no key)                            */
/* ====================================================================== */

const COINBASE = 'https://api.exchange.coinbase.com';
export const COINBASE_ATTRIBUTION = 'Crypto prices: Coinbase Exchange public market data (USD pairs, UTC daily candles).';
/** Coinbase USD markets opened in late 2014/2015; nothing exists on Coinbase before this. */
const COINBASE_EPOCH = '2014-12-01';

export function cryptoProduct(symbol: string): string {
  return `${symbol.toUpperCase()}-USD`;
}

/** Coinbase candle: [time, low, high, open, close, volume] */
export function normalizeCoinbase(rows: number[][]): Bar[] {
  const byDate = new Map<string, Bar>();
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 6) continue;
    const [t, low, high, open, close, volume] = r.map(Number);
    const b: Bar = {
      date: new Date(t * 1000).toISOString().slice(0, 10),
      open, high, low, close, volume,
      adjOpen: open, adjHigh: high, adjLow: low, adjClose: close, dividend: 0, split: 1,
    };
    if (validBar(b)) byDate.set(b.date, b);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function coinbaseHistory(symbol: string, start: string): Promise<History> {
  const product = cryptoProduct(symbol);
  return cached(`cb:hist:${product}:${start}`, 6 * 3600_000, async () => {
    const from = start < COINBASE_EPOCH ? COINBASE_EPOCH : start;
    const rows: number[][] = [];
    let cursor = Date.parse(from + 'T00:00:00Z');
    const end = Date.now();
    const windowMs = 299 * 86400_000;
    let requests = 0;
    // Walk forward in 299-day windows; empty windows are skipped so delisting gaps are preserved.
    while (cursor < end) {
      const wEnd = Math.min(cursor + windowMs, end);
      const url = `${COINBASE}/products/${product}/candles?granularity=86400&start=${new Date(cursor).toISOString()}&end=${new Date(wEnd).toISOString()}`;
      const page = await fetchJson<number[][]>(url, { provider: 'Coinbase' });
      if (Array.isArray(page)) rows.push(...page);
      cursor = wEnd + 86400_000;
      if (++requests > 40) break;
      await sleep(120); // stay well under the 10 req/s public limit
    }
    const bars = normalizeCoinbase(rows).filter((b) => b.date >= from);
    const first = bars[0]?.date ?? null;
    const notes: string[] = [];
    if (!bars.length) notes.push(`Coinbase has no ${product} daily candles in the requested range.`);
    else if (start < first!) notes.push(`${symbol} data on Coinbase begins ${first}. No prices are shown before that date.`);
    const gaps = detectGaps(bars, 3);
    if (gaps.some((g) => g.days > 30)) notes.push('Trading on Coinbase was suspended for part of this history; see gaps.');
    return {
      symbol: symbol.toUpperCase(), kind: 'crypto', name: product, provider: 'Coinbase Exchange',
      attribution: COINBASE_ATTRIBUTION, requestedStart: start, firstDate: first, lastDate: bars.at(-1)?.date ?? null,
      bars, gaps, droppedRows: 0, coverageNote: notes.join(' ') || null, fetchedAt: new Date().toISOString(),
    };
  });
}

export async function coinbaseQuote(symbol: string): Promise<Quote> {
  const product = cryptoProduct(symbol);
  return cached(`cb:q:${product}`, 30_000, async () => {
    const [ticker, stats] = await Promise.all([
      fetchJson<{ price: string; time: string }>(`${COINBASE}/products/${product}/ticker`, { provider: 'Coinbase' }),
      fetchJson<{ open: string; volume: string }>(`${COINBASE}/products/${product}/stats`, { provider: 'Coinbase' }),
    ]);
    const price = num(ticker?.price);
    if (price == null || price <= 0) throw new ApiError(502, 'NO_DATA', `No Coinbase price for ${product}.`, 'Coinbase');
    const ref = num(stats?.open);
    return {
      symbol: symbol.toUpperCase(), kind: 'crypto', price, reference: ref,
      change: ref ? price - ref : null, changePct: ref ? (price / ref - 1) * 100 : null,
      volume: num(stats?.volume), volumeLabel: '24h volume on Coinbase (base units)',
      marketCap: null, asOf: ticker.time ?? new Date().toISOString(), basis: 'exchange-last', provider: 'Coinbase Exchange',
    };
  });
}

export async function coinbaseProducts(): Promise<Array<{ symbol: string; name: string }>> {
  return cached('cb:products', 24 * 3600_000, async () => {
    const rows = await fetchJson<Array<{ base_currency: string; quote_currency: string; status: string; trading_disabled: boolean; display_name: string }>>(
      `${COINBASE}/products`, { provider: 'Coinbase' },
    );
    return (rows ?? [])
      .filter((p) => p.quote_currency === 'USD' && p.status === 'online' && !p.trading_disabled)
      .map((p) => ({ symbol: p.base_currency, name: p.display_name }));
  });
}

/* ====================================================================== */
/* CoinGecko — optional crypto market capitalization                       */
/* ====================================================================== */

export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano', XRP: 'ripple',
  DOGE: 'dogecoin', LTC: 'litecoin', AVAX: 'avalanche-2', DOT: 'polkadot', LINK: 'chainlink',
};

export async function coingeckoMarketCaps(symbols: string[]): Promise<Map<string, number>> {
  const ids = symbols.map((s) => COINGECKO_IDS[s.toUpperCase()]).filter(Boolean);
  const out = new Map<string, number>();
  if (!ids.length) return out;
  return cached(`cg:cap:${ids.sort().join(',')}`, 5 * 60_000, async () => {
    try {
      const key = process.env.COINGECKO_DEMO_KEY?.trim();
      const data = await fetchJson<Record<string, { usd_market_cap?: number }>>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_market_cap=true`,
        { provider: 'CoinGecko', retries: 1, headers: key ? { 'x-cg-demo-api-key': key } : {} },
      );
      for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
        const cap = data?.[id]?.usd_market_cap;
        if (cap && cap > 0) out.set(sym, cap);
      }
    } catch {
      /* market cap is optional; leave empty */
    }
    return out;
  });
}

/* ====================================================================== */
/* FRED — macro, rates, index levels                                      */
/* ====================================================================== */

export const FRED_SERIES: Record<string, string> = {
  DFF: 'Federal Funds Effective Rate (daily, %)',
  FEDFUNDS: 'Federal Funds Effective Rate (monthly, %)',
  CPIAUCSL: 'CPI, All Urban Consumers (index 1982–84=100, SA)',
  UNRATE: 'Unemployment Rate (%, SA)',
  GDPC1: 'Real GDP (bn chained 2017 $, SAAR)',
  GDP: 'Nominal GDP (bn $, SAAR)',
  DGS10: '10-Year Treasury Constant Maturity (%)',
  DGS2: '2-Year Treasury Constant Maturity (%)',
  DGS3MO: '3-Month Treasury Constant Maturity (%)',
  DTB3: '3-Month Treasury Bill, Secondary Market (%)',
  T10Y2Y: '10-Year minus 2-Year Treasury Spread (pp)',
  USREC: 'NBER-based Recession Indicator (1 = recession)',
  VIXCLS: 'CBOE Volatility Index (VIX), close',
  SP500: 'S&P 500 Index (close; FRED licence: ~10 years)',
  NASDAQCOM: 'Nasdaq Composite Index (close)',
  DJIA: 'Dow Jones Industrial Average (close; FRED licence: ~10 years)',
};

export const FRED_ATTRIBUTION = 'Macroeconomic data: FRED®, Federal Reserve Bank of St. Louis. Index levels © their owners, via FRED.';

/** Prefer a key entered on the website (header) over the deployment key. */
export function fredKey(request: Request): string {
  const key = request.headers.get('x-fred-key')?.trim() || process.env.FRED_API_KEY?.trim();
  if (!key) {
    throw new ApiError(503, 'CONFIG_REQUIRED', 'Index levels, Treasury yields and macro data need a free FRED API key: set FRED_API_KEY on the server or paste a key in Settings.', 'FRED');
  }
  return key;
}

export async function fredSeries(series: string, start: string, key: string) {
  if (!FRED_SERIES[series]) throw new ApiError(400, 'BAD_REQUEST', `Series ${series} is not enabled.`, 'FRED');
  return cached(`fred:${series}:${start}`, 6 * 3600_000, async () => {
    rateGuard('FRED', 100, 60_000);
    const base = 'https://api.stlouisfed.org/fred';
    const [meta, obs] = await Promise.all([
      fetchJson<{ seriess: Array<{ title: string; units: string; frequency: string; last_updated: string; observation_end: string }> }>(
        `${base}/series?series_id=${series}&api_key=${key}&file_type=json`, { provider: 'FRED' }),
      fetchJson<{ observations: Array<{ date: string; value: string }> }>(
        `${base}/series/observations?series_id=${series}&api_key=${key}&file_type=json&observation_start=${start}`, { provider: 'FRED' }),
    ]);
    const m = meta?.seriess?.[0];
    const points = (obs?.observations ?? [])
      .map((o) => ({ date: o.date, value: o.value === '.' ? null : num(o.value) }))
      .filter((p): p is { date: string; value: number } => p.value !== null);
    return {
      series, title: m?.title ?? FRED_SERIES[series], units: m?.units ?? '', frequency: m?.frequency ?? '',
      lastUpdated: m?.last_updated ?? null, points, provider: 'FRED', attribution: FRED_ATTRIBUTION,
      fetchedAt: new Date().toISOString(),
    };
  });
}

/* ====================================================================== */

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
}
