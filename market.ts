import type { Asset, AssetKind, Quote } from '../types';

export const UNIVERSE: Asset[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', kind: 'equity', group: 'Stocks' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', kind: 'equity', group: 'Stocks' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', kind: 'equity', group: 'Stocks' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', kind: 'equity', group: 'Stocks' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', kind: 'equity', group: 'Stocks' },
  { symbol: 'META', name: 'Meta Platforms Inc.', kind: 'equity', group: 'Stocks' },
  { symbol: 'TSLA', name: 'Tesla Inc.', kind: 'equity', group: 'Stocks' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', kind: 'equity', group: 'Stocks' },
  { symbol: 'GS', name: 'Goldman Sachs Group Inc.', kind: 'equity', group: 'Stocks' },
  { symbol: 'KO', name: 'Coca-Cola Co.', kind: 'equity', group: 'Stocks' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', kind: 'equity', group: 'ETFs' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', kind: 'equity', group: 'ETFs' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', kind: 'equity', group: 'ETFs' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', kind: 'equity', group: 'ETFs' },
  { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', group: 'Crypto' },
  { symbol: 'ETH', name: 'Ethereum', kind: 'crypto', group: 'Crypto' },
  { symbol: 'SOL', name: 'Solana', kind: 'crypto', group: 'Crypto' },
  { symbol: 'ADA', name: 'Cardano', kind: 'crypto', group: 'Crypto' },
  { symbol: 'XRP', name: 'XRP', kind: 'crypto', group: 'Crypto' },
  { symbol: 'GLD', name: 'SPDR Gold Shares (gold proxy)', kind: 'equity', group: 'Reference' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', kind: 'equity', group: 'Reference' },
  { symbol: 'KRE', name: 'SPDR S&P Regional Banking ETF', kind: 'equity', group: 'Reference' },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', kind: 'equity', group: 'Reference' },
  { symbol: 'GME', name: 'GameStop Corp.', kind: 'equity', group: 'Reference' },
];

export const CORE_EQUITIES = UNIVERSE.filter((a) => a.kind === 'equity' && a.group !== 'Reference').map((a) => a.symbol);
export const CORE_CRYPTO = UNIVERSE.filter((a) => a.kind === 'crypto').map((a) => a.symbol);

const extra = new Map<string, Asset>();
export function registerAsset(a: Asset) {
  if (!UNIVERSE.some((u) => u.symbol === a.symbol && u.kind === a.kind)) extra.set(`${a.kind}:${a.symbol}`, a);
}
export function findAsset(symbol: string, kind?: AssetKind): Asset | undefined {
  return (
    UNIVERSE.find((a) => a.symbol === symbol && (!kind || a.kind === kind)) ??
    [...extra.values()].find((a) => a.symbol === symbol && (!kind || a.kind === kind))
  );
}
export function assetKey(a: { symbol: string; kind: AssetKind }) {
  return `${a.kind}:${a.symbol}`;
}

/* ------------------------------------------------------------------ */
/* NYSE session calendar                                               */
/* Holiday table from published NYSE schedules; verify each new year.  */
/* ------------------------------------------------------------------ */

export const NYSE_HOLIDAYS = new Set([
  '2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04',
  '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06',
  '2027-11-25', '2027-12-24',
]);
export const NYSE_EARLY_CLOSE = new Set(['2025-07-03', '2025-11-28', '2025-12-24', '2026-11-27', '2026-12-24', '2027-11-26']);
const CALENDAR_LAST_YEAR = 2027;

export interface MarketStatus { open: boolean; label: string; detail: string; nyDate: string; calendarVerified: boolean }

export function nyParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekday: get('weekday'),
  };
}

export function equityMarketStatus(now = new Date()): MarketStatus {
  const p = nyParts(now);
  const verified = Number(p.date.slice(0, 4)) <= CALENDAR_LAST_YEAR;
  const weekend = p.weekday === 'Sat' || p.weekday === 'Sun';
  if (weekend) return { open: false, label: 'Closed', detail: 'US markets are closed for the weekend', nyDate: p.date, calendarVerified: verified };
  if (NYSE_HOLIDAYS.has(p.date)) return { open: false, label: 'Closed', detail: 'NYSE holiday', nyDate: p.date, calendarVerified: verified };
  const close = NYSE_EARLY_CLOSE.has(p.date) ? 13 * 60 : 16 * 60;
  if (p.minutes < 9 * 60 + 30) return { open: false, label: 'Pre-market', detail: 'Regular session opens 9:30 ET', nyDate: p.date, calendarVerified: verified };
  if (p.minutes >= close) return { open: false, label: 'Closed', detail: `Regular session closed at ${close === 780 ? '13:00' : '16:00'} ET`, nyDate: p.date, calendarVerified: verified };
  return { open: true, label: 'Open', detail: `Regular session until ${close === 780 ? '13:00' : '16:00'} ET`, nyDate: p.date, calendarVerified: verified };
}

/** Freshness classification derived from the observation timestamp — never assumed. */
export function quoteFreshness(q: Quote, now = Date.now()): { state: 'connected' | 'delayed' | 'eod'; label: string } {
  if (q.basis === 'eod-close') return { state: 'eod', label: 'End-of-day close' };
  const ageMin = (now - Date.parse(q.asOf)) / 60000;
  if (q.kind === 'equity' && !equityMarketStatus(new Date(now)).open)
    return { state: 'eod', label: `Last trade ${Number.isFinite(ageMin) ? ageAgo(ageMin) : ''}, market closed` };
  if (Number.isFinite(ageMin) && ageMin <= 2) return { state: 'connected', label: q.kind === 'equity' ? 'Real-time (IEX venue)' : 'Real-time (Coinbase)' };
  return { state: 'delayed', label: `Delayed ${Number.isFinite(ageMin) ? ageAgo(ageMin) : ''}` };
}

function ageAgo(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}

/** Session date of a quote: NY date for equities, UTC date for crypto. */
export function sessionDateOf(kind: AssetKind, iso: string): string {
  return kind === 'equity' ? nyParts(new Date(iso)).date : new Date(iso).toISOString().slice(0, 10);
}
