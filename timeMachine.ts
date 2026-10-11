/**
 * Market Time Machine — historical simulation without look-ahead.
 *
 * The student stands at the OPEN of calendar[cursor]:
 *   visible = all bars dated before calendar[cursor] + that day's opening price.
 *   orders fill at that day's raw (as-traded) open price.
 *   advancing closes the day: positions are marked at raw closes, then the next
 *   session's corporate actions apply at its open (split share adjustments; cash
 *   dividends to holders of record before the ex-date).
 * Raw prices are used for execution because adjusted series rescale history using
 * events that had not yet happened (see docs/METHODOLOGY.md).
 */
import type { AssetKind, Bar } from '../types';

export interface TMAsset { symbol: string; kind: AssetKind; bars: Bar[]; byDate: Map<string, Bar> }

export interface TMTrade { date: string; symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; fee: number }
export interface TMEvent { date: string; text: string }

export interface TMState {
  startDate: string;
  capital: number;
  feeBps: number;
  calendar: string[];
  cursor: number;
  cash: number;
  qty: Record<string, number>;
  cost: Record<string, number>;
  trades: TMTrade[];
  events: TMEvent[];
  equity: Array<{ date: string; value: number }>;
  finished: boolean;
}

export function makeAssets(series: Array<{ symbol: string; kind: AssetKind; bars: Bar[] }>): Record<string, TMAsset> {
  const out: Record<string, TMAsset> = {};
  for (const s of series) out[s.symbol] = { ...s, byDate: new Map(s.bars.map((b) => [b.date, b])) };
  return out;
}

/** Trading calendar: union of equity session dates (or crypto days if no equities) on/after start. */
export function buildCalendar(assets: Record<string, TMAsset>, start: string, end?: string): string[] {
  const eq = Object.values(assets).filter((a) => a.kind === 'equity');
  const src = eq.length ? eq : Object.values(assets);
  const set = new Set<string>();
  for (const a of src) for (const b of a.bars) if (b.date >= start && (!end || b.date <= end)) set.add(b.date);
  return [...set].sort();
}

export function startSimulation(assets: Record<string, TMAsset>, start: string, capital: number, feeBps: number, end?: string): TMState {
  const calendar = buildCalendar(assets, start, end);
  return {
    startDate: calendar[0] ?? start, capital, feeBps, calendar, cursor: 0, cash: capital, qty: {}, cost: {},
    trades: [], events: [{ date: calendar[0] ?? start, text: `Simulation started with $${capital.toLocaleString('en-US')}` }],
    equity: [], finished: calendar.length < 2,
  };
}

export const today = (s: TMState) => s.calendar[s.cursor];

/** Bars the student may see: strictly before today. */
export function visibleBars(a: TMAsset, s: TMState): Bar[] {
  const d = today(s);
  const out: Bar[] = [];
  for (const b of a.bars) { if (b.date >= d) break; out.push(b); }
  return out;
}

export function openPrice(a: TMAsset, s: TMState): number | null {
  return a.byDate.get(today(s))?.open ?? null;
}

/** Most recent close on or before `date` (stale-price fallback for valuation). */
export function lastCloseOnOrBefore(a: TMAsset, date: string): { price: number; date: string } | null {
  let lo = 0, hi = a.bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (a.bars[mid].date <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? { price: a.bars[ans].close, date: a.bars[ans].date } : null;
}

export function trade(s: TMState, a: TMAsset, side: 'buy' | 'sell', quantity: number): { state: TMState; error: string | null } {
  if (s.finished) return { state: s, error: 'The simulation has finished.' };
  const px = openPrice(a, s);
  if (px == null) return { state: s, error: `${a.symbol} did not trade on ${today(s)} (not yet listed, delisted, or no session).` };
  const q = Math.round(quantity * 1e6) / 1e6;
  if (!(q > 0)) return { state: s, error: 'Quantity must be greater than zero.' };
  const notional = q * px, fee = (notional * s.feeBps) / 10_000;
  const held = s.qty[a.symbol] ?? 0;
  if (side === 'buy' && notional + fee > s.cash + 1e-9) return { state: s, error: 'Insufficient cash.' };
  if (side === 'sell' && q > held + 1e-9) return { state: s, error: 'You cannot sell more than you hold.' };
  const qty = { ...s.qty }, cost = { ...s.cost };
  let cash = s.cash;
  if (side === 'buy') { cash -= notional + fee; qty[a.symbol] = held + q; cost[a.symbol] = (cost[a.symbol] ?? 0) + notional + fee; }
  else {
    const avg = held > 0 ? (cost[a.symbol] ?? 0) / held : 0;
    cash += notional - fee; qty[a.symbol] = held - q; cost[a.symbol] = (cost[a.symbol] ?? 0) - avg * q;
    if (qty[a.symbol] < 1e-9) { delete qty[a.symbol]; delete cost[a.symbol]; }
  }
  return {
    state: { ...s, cash, qty, cost, trades: [...s.trades, { date: today(s), symbol: a.symbol, side, quantity: q, price: px, fee }] },
    error: null,
  };
}

export function markToMarket(s: TMState, assets: Record<string, TMAsset>, date: string, field: 'open' | 'close' = 'close') {
  let v = s.cash;
  const stale: string[] = [];
  for (const [sym, q] of Object.entries(s.qty)) {
    const a = assets[sym];
    const bar = a.byDate.get(date);
    if (bar) { v += q * bar[field]; continue; }
    const lc = lastCloseOnOrBefore(a, date);
    if (lc) { v += q * lc.price; stale.push(`${sym} (last ${lc.date})`); }
    else stale.push(`${sym} (no price)`);
  }
  return { value: v, stale };
}

/** Advance n sessions: close each day, then apply the next day's corporate actions at its open. */
export function advance(s: TMState, assets: Record<string, TMAsset>, n: number): TMState {
  let st = { ...s, equity: [...s.equity], events: [...s.events], qty: { ...s.qty }, cost: { ...s.cost } };
  for (let k = 0; k < n && !st.finished; k++) {
    const d = today(st);
    st.equity.push({ date: d, value: markToMarket(st, assets, d).value });
    if (st.cursor >= st.calendar.length - 1) { st.finished = true; st.events.push({ date: d, text: 'Reached the end of available data.' }); break; }
    st.cursor++;
    const nd = today(st);
    for (const sym of Object.keys(st.qty)) {
      const a = assets[sym];
      if (a.kind !== 'equity') continue;
      // corporate actions on any bar after d up to and including nd
      for (const b of a.bars) {
        if (b.date <= d) continue;
        if (b.date > nd) break;
        if (b.split !== 1 && b.split > 0) {
          const before = st.qty[sym];
          st.qty[sym] = before * b.split;
          st.events.push({ date: b.date, text: `${sym} split ${b.split}-for-1: ${fmt(before)} → ${fmt(st.qty[sym])} shares` });
        }
        if (b.dividend > 0) {
          const cashIn = st.qty[sym] * b.dividend;
          st.cash += cashIn;
          st.events.push({ date: b.date, text: `${sym} dividend $${b.dividend.toFixed(4)}/share → +$${cashIn.toFixed(2)} cash` });
        }
      }
      const last = a.bars.at(-1);
      if (last && last.date < nd && !st.events.some((e) => e.text.startsWith(`${sym} has no prices after`)))
        st.events.push({ date: nd, text: `${sym} has no prices after ${last.date}; valued at its last close (possible delisting).` });
    }
  }
  return st;
}

/** Advance to the first session on or after `date`. */
export function jumpTo(s: TMState, assets: Record<string, TMAsset>, date: string): TMState {
  const idx = s.calendar.findIndex((d) => d >= date);
  const target = idx < 0 ? s.calendar.length - 1 : idx;
  return target > s.cursor ? advance(s, assets, target - s.cursor) : s;
}

/** Number of sessions until the first session in the month/year after today. */
export function sessionsUntil(s: TMState, unit: 'day' | 'week' | 'month' | 'year'): number {
  if (unit === 'day') return 1;
  if (unit === 'week') return 5;
  const d = new Date(today(s) + 'T00:00:00Z');
  if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCFullYear(d.getUTCFullYear() + 1);
  const target = d.toISOString().slice(0, 10);
  const idx = s.calendar.findIndex((x) => x >= target);
  return (idx < 0 ? s.calendar.length - 1 : idx) - s.cursor || 1;
}

const fmt = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 4 });
