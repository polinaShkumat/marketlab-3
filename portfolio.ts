/**
 * Paper-trading account engine (pure functions, no I/O).
 *
 * Simulation rules (see docs/METHODOLOGY.md):
 *  - Market orders fill at the reference price supplied by the caller: the latest
 *    available observation (IEX last trade, exchange last trade, or end-of-day close).
 *    The basis and timestamp of that price are stored with the fill.
 *  - Limit orders that are marketable on entry fill at the reference price. Otherwise
 *    they rest and are evaluated against later daily bars: a buy fills when a later
 *    session's low ≤ limit (fill = min(open, limit)); a sell fills when the high ≥ limit
 *    (fill = max(open, limit)). They can also fill against a later quote that crosses.
 *  - Resting orders reserve cash (buys, including fees) or shares (sells).
 *  - A split after placement cancels resting orders for that symbol.
 *  - Fees = notional × feeBps / 10,000. Average-cost accounting; fees are part of
 *    the cost basis on buys and reduce proceeds on sells.
 *  - Fractional quantities are allowed (6 decimal places).
 */
import type { AssetKind, Bar } from '../types';

export const STARTING_CAPITAL = 100_000;
export const ACCOUNT_VERSION = 1;
const EPS = 1e-9;

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type PriceBasis = 'iex-last' | 'finnhub-last' | 'eod-close' | 'exchange-last' | 'bar-open' | 'bar-limit';

export interface Position {
  symbol: string;
  kind: AssetKind;
  quantity: number;
  costBasis: number; // total cost incl. fees of the shares still held
}

export interface Order {
  id: string;
  symbol: string;
  kind: AssetKind;
  side: Side;
  type: OrderType;
  quantity: number;
  limitPrice: number | null;
  status: 'filled' | 'pending' | 'cancelled' | 'rejected';
  createdAt: string;
  sessionDate: string; // session in which the order was placed
  filledAt: string | null;
  fillPrice: number | null;
  fee: number | null;
  priceBasis: PriceBasis | null;
  priceAsOf: string | null;
  note: string | null;
}

export interface Transaction {
  id: string;
  orderId: string | null;
  type: 'buy' | 'sell' | 'dividend' | 'split';
  symbol: string;
  kind: AssetKind;
  at: string; // ISO time recorded
  sessionDate: string; // the market session the price belongs to
  quantity: number; // shares traded (split: shares added)
  price: number; // fill price (dividend: cash per share; split: factor)
  fee: number;
  cashChange: number;
  cashAfter: number;
  realizedPnl: number;
  priceBasis: PriceBasis | null;
  priceAsOf: string | null;
}

export interface AuditEntry { at: string; event: string; detail: string }

export interface Account {
  version: number;
  createdAt: string;
  startingCapital: number;
  cash: number;
  feeBps: number;
  positions: Record<string, Position>; // key = kind:symbol
  orders: Order[];
  transactions: Transaction[];
  audit: AuditEntry[];
  corporateActionsThrough: Record<string, string>; // key → last bar date processed
}

export interface PriceRef { price: number; asOf: string; basis: PriceBasis; sessionDate: string }

export class TradeError extends Error {}

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const key = (kind: AssetKind, symbol: string) => `${kind}:${symbol}`;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function createAccount(feeBps = 5, now = new Date().toISOString()): Account {
  return {
    version: ACCOUNT_VERSION, createdAt: now, startingCapital: STARTING_CAPITAL, cash: STARTING_CAPITAL, feeBps,
    positions: {}, orders: [], transactions: [], audit: [{ at: now, event: 'account.created', detail: `Starting capital ${STARTING_CAPITAL} USD; fee ${feeBps} bps` }],
    corporateActionsThrough: {},
  };
}

export const feeFor = (notional: number, feeBps: number) => (Math.abs(notional) * feeBps) / 10_000;

/** Cash reserved by resting buy limits and shares reserved by resting sells. */
export function reservations(acc: Account) {
  let cash = 0;
  const shares: Record<string, number> = {};
  for (const o of acc.orders) {
    if (o.status !== 'pending' || o.limitPrice == null) continue;
    if (o.side === 'buy') cash += o.quantity * o.limitPrice + feeFor(o.quantity * o.limitPrice, acc.feeBps);
    else shares[key(o.kind, o.symbol)] = (shares[key(o.kind, o.symbol)] ?? 0) + o.quantity;
  }
  return { cash, shares };
}

export function availableCash(acc: Account): number {
  return acc.cash - reservations(acc).cash;
}

export function availableShares(acc: Account, kind: AssetKind, symbol: string): number {
  const held = acc.positions[key(kind, symbol)]?.quantity ?? 0;
  return held - (reservations(acc).shares[key(kind, symbol)] ?? 0);
}

/** Apply a fill to the account (validates cash/position). Returns a new account. */
export function applyFill(
  acc: Account,
  f: { orderId: string | null; symbol: string; kind: AssetKind; side: Side; quantity: number; price: number; ref: Omit<PriceRef, 'price'>; at: string; reservedOrder?: boolean },
): { account: Account; tx: Transaction } {
  const qty = round6(f.quantity);
  if (!(qty > 0)) throw new TradeError('Quantity must be greater than zero.');
  if (!(f.price > 0) || !Number.isFinite(f.price)) throw new TradeError('No valid executable price is available.');
  const k = key(f.kind, f.symbol);
  const notional = qty * f.price;
  const fee = feeFor(notional, acc.feeBps);
  const positions = { ...acc.positions };
  const pos = positions[k] ? { ...positions[k] } : { symbol: f.symbol, kind: f.kind, quantity: 0, costBasis: 0 };
  let cash = acc.cash;
  let realized = 0;

  if (f.side === 'buy') {
    const freeCash = f.reservedOrder ? acc.cash : availableCash(acc);
    if (notional + fee > freeCash + EPS) throw new TradeError(`Insufficient cash: needs ${(notional + fee).toFixed(2)}, available ${freeCash.toFixed(2)}.`);
    cash -= notional + fee;
    pos.quantity = round6(pos.quantity + qty);
    pos.costBasis += notional + fee;
  } else {
    const free = f.reservedOrder ? pos.quantity : availableShares(acc, f.kind, f.symbol);
    if (qty > free + EPS) throw new TradeError(`Cannot sell ${qty}: only ${round6(free)} available (no short selling).`);
    const avg = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
    const proceeds = notional - fee;
    realized = proceeds - avg * qty;
    cash += proceeds;
    pos.costBasis -= avg * qty;
    pos.quantity = round6(pos.quantity - qty);
  }
  if (pos.quantity <= EPS) delete positions[k];
  else positions[k] = pos;

  const tx: Transaction = {
    id: newId('tx'), orderId: f.orderId, type: f.side, symbol: f.symbol, kind: f.kind, at: f.at,
    sessionDate: f.ref.sessionDate, quantity: qty, price: f.price, fee,
    cashChange: f.side === 'buy' ? -(notional + fee) : notional - fee, cashAfter: cash, realizedPnl: realized,
    priceBasis: f.ref.basis, priceAsOf: f.ref.asOf,
  };
  const ca = { ...acc.corporateActionsThrough };
  if (f.side === 'buy' && !ca[k]) ca[k] = prevDay(f.ref.sessionDate);
  return {
    account: { ...acc, cash, positions, transactions: [...acc.transactions, tx], corporateActionsThrough: ca },
    tx,
  };
}

export interface OrderRequest { symbol: string; kind: AssetKind; side: Side; type: OrderType; quantity: number; limitPrice?: number | null }

/** Place an order against a reference price. */
export function placeOrder(acc: Account, req: OrderRequest, ref: PriceRef, now = new Date().toISOString()): { account: Account; order: Order } {
  const qty = round6(req.quantity);
  const base: Order = {
    id: newId('ord'), symbol: req.symbol, kind: req.kind, side: req.side, type: req.type, quantity: qty,
    limitPrice: req.type === 'limit' ? req.limitPrice ?? null : null, status: 'pending', createdAt: now,
    sessionDate: ref.sessionDate, filledAt: null, fillPrice: null, fee: null, priceBasis: null, priceAsOf: null, note: null,
  };
  const reject = (msg: string) => {
    const order = { ...base, status: 'rejected' as const, note: msg };
    return { account: audit({ ...acc, orders: [...acc.orders, order] }, 'order.rejected', `${req.side} ${qty} ${req.symbol}: ${msg}`, now), order };
  };
  if (!(qty > 0)) return reject('Quantity must be greater than zero.');
  if (req.type === 'limit' && !(base.limitPrice && base.limitPrice > 0)) return reject('Limit price must be greater than zero.');

  const marketable =
    req.type === 'market' ||
    (req.side === 'buy' && (base.limitPrice as number) >= ref.price) ||
    (req.side === 'sell' && (base.limitPrice as number) <= ref.price);

  if (marketable) {
    try {
      const { account, tx } = applyFill(acc, { orderId: base.id, symbol: req.symbol, kind: req.kind, side: req.side, quantity: qty, price: ref.price, ref, at: now });
      const order: Order = { ...base, status: 'filled', filledAt: now, fillPrice: tx.price, fee: tx.fee, priceBasis: ref.basis, priceAsOf: ref.asOf };
      return { account: audit({ ...account, orders: [...account.orders, order] }, 'order.filled', `${req.side} ${qty} ${req.symbol} @ ${tx.price} (${ref.basis}, ${ref.asOf})`, now), order };
    } catch (e) {
      return reject(e instanceof Error ? e.message : String(e));
    }
  }

  // Resting limit: validate reservation capacity now.
  const lp = base.limitPrice as number;
  if (req.side === 'buy') {
    const need = qty * lp + feeFor(qty * lp, acc.feeBps);
    if (need > availableCash(acc) + EPS) return reject(`Insufficient available cash to reserve ${need.toFixed(2)}.`);
  } else if (qty > availableShares(acc, req.kind, req.symbol) + EPS) {
    return reject('Not enough unreserved shares to sell.');
  }
  return { account: audit({ ...acc, orders: [...acc.orders, base] }, 'order.resting', `${req.side} ${qty} ${req.symbol} limit ${lp}`, now), order: base };
}

export function cancelOrder(acc: Account, id: string, reason = 'Cancelled by user', now = new Date().toISOString()): Account {
  const orders = acc.orders.map((o) => (o.id === id && o.status === 'pending' ? { ...o, status: 'cancelled' as const, note: reason } : o));
  return audit({ ...acc, orders }, 'order.cancelled', `${id}: ${reason}`, now);
}

/**
 * Evaluate resting limit orders for one symbol against daily bars strictly after the
 * order's session date, then against a later quote. Splits after placement cancel the order.
 */
export function evaluateLimitOrders(acc: Account, kind: AssetKind, symbol: string, bars: Bar[], quote: PriceRef | null, now = new Date().toISOString()): Account {
  let account = acc;
  for (const o of acc.orders) {
    if (o.status !== 'pending' || o.kind !== kind || o.symbol !== symbol || o.limitPrice == null) continue;
    const lp = o.limitPrice;
    const later = bars.filter((b) => b.date > o.sessionDate);
    let filled = false;
    for (const b of later) {
      if (b.split !== 1) {
        account = cancelOrder(account, o.id, `Cancelled: ${b.split}-for-1 split on ${b.date} changed the price scale`, now);
        filled = true;
        break;
      }
      const hit = o.side === 'buy' ? b.low <= lp : b.high >= lp;
      if (!hit) continue;
      const price = o.side === 'buy' ? Math.min(b.open, lp) : Math.max(b.open, lp);
      account = fillResting(account, o, price, { asOf: `${b.date}`, basis: b.open === price ? 'bar-open' : 'bar-limit', sessionDate: b.date }, now);
      filled = true;
      break;
    }
    if (filled || !quote || Date.parse(quote.asOf) <= Date.parse(o.createdAt)) continue;
    const crosses = o.side === 'buy' ? quote.price <= lp : quote.price >= lp;
    if (crosses) account = fillResting(account, o, quote.price, quote, now);
  }
  return account;
}

function fillResting(acc: Account, o: Order, price: number, ref: Omit<PriceRef, 'price'>, now: string): Account {
  // Release this order's reservation before validating.
  const without = { ...acc, orders: acc.orders.filter((x) => x.id !== o.id) };
  try {
    const { account, tx } = applyFill(without, { orderId: o.id, symbol: o.symbol, kind: o.kind, side: o.side, quantity: o.quantity, price, ref, at: now, reservedOrder: false });
    const order: Order = { ...o, status: 'filled', filledAt: now, fillPrice: price, fee: tx.fee, priceBasis: ref.basis, priceAsOf: ref.asOf };
    return audit({ ...account, orders: acc.orders.map((x) => (x.id === o.id ? order : x)) }, 'order.filled', `limit ${o.side} ${o.quantity} ${o.symbol} @ ${price} (${ref.basis} ${ref.asOf})`, now);
  } catch (e) {
    const order: Order = { ...o, status: 'rejected', note: e instanceof Error ? e.message : String(e) };
    return audit({ ...acc, orders: acc.orders.map((x) => (x.id === o.id ? order : x)) }, 'order.rejected', `${o.id}: ${order.note}`, now);
  }
}

/** Shares held at the open of `date` (i.e. from transactions in earlier sessions). */
export function quantityBefore(acc: Account, kind: AssetKind, symbol: string, date: string): number {
  let q = 0;
  for (const t of acc.transactions) {
    if (t.kind !== kind || t.symbol !== symbol || t.sessionDate >= date) continue;
    if (t.type === 'buy' || t.type === 'split') q += t.quantity;
    else if (t.type === 'sell') q -= t.quantity;
  }
  return round6(q);
}

/**
 * Apply splits and cash dividends (ex-date semantics) from daily bars to an equity holding.
 * Entitlement = shares held before the ex-date session. Idempotent via corporateActionsThrough.
 */
export function applyCorporateActions(acc: Account, kind: AssetKind, symbol: string, bars: Bar[], now = new Date().toISOString()): Account {
  if (kind !== 'equity') return acc;
  const k = key(kind, symbol);
  const through = acc.corporateActionsThrough[k];
  if (!through) return acc;
  let account = acc;
  let last = through;
  for (const b of bars) {
    if (b.date <= through) continue;
    last = b.date;
    if (b.split !== 1 && b.split > 0) {
      const q = quantityBefore(account, kind, symbol, b.date);
      if (q > 0) {
        const added = round6(q * (b.split - 1));
        const pos = account.positions[k];
        const positions = { ...account.positions };
        if (pos) positions[k] = { ...pos, quantity: round6(pos.quantity + added) };
        const tx: Transaction = {
          id: newId('tx'), orderId: null, type: 'split', symbol, kind, at: now, sessionDate: b.date, quantity: added, price: b.split,
          fee: 0, cashChange: 0, cashAfter: account.cash, realizedPnl: 0, priceBasis: null, priceAsOf: b.date,
        };
        account = audit({ ...account, positions, transactions: [...account.transactions, tx] }, 'corporate.split', `${symbol} ${b.split}:1 on ${b.date}, +${added} shares`, now);
      }
    }
    if (b.dividend > 0) {
      const q = quantityBefore(account, kind, symbol, b.date);
      if (q > 0) {
        const cashIn = q * b.dividend;
        const tx: Transaction = {
          id: newId('tx'), orderId: null, type: 'dividend', symbol, kind, at: now, sessionDate: b.date, quantity: q, price: b.dividend,
          fee: 0, cashChange: cashIn, cashAfter: account.cash + cashIn, realizedPnl: 0, priceBasis: null, priceAsOf: b.date,
        };
        account = audit({ ...account, cash: account.cash + cashIn, transactions: [...account.transactions, tx] }, 'corporate.dividend', `${symbol} ${b.dividend}/sh × ${q} on ex-date ${b.date}`, now);
      }
    }
  }
  return { ...account, corporateActionsThrough: { ...account.corporateActionsThrough, [k]: last } };
}

export interface Valuation {
  cash: number;
  marketValue: number;
  total: number;
  invested: number; // cost basis of open positions
  unrealized: number;
  realized: number;
  dividends: number;
  totalReturn: number; // fraction vs starting capital
  dayChange: number | null;
  rows: Array<{ position: Position; price: number | null; value: number | null; unrealized: number | null; dayChange: number | null; weight: number | null }>;
}

export interface MarkPrice { price: number; reference: number | null; sessionDate?: string }

/**
 * Today's P&L for one asset: shares held at the previous close move from the reference price;
 * shares bought this session move from their fill price; shares sold this session realize
 * (fill − reference). Fees paid this session are subtracted.
 */
export function dayChangeFor(acc: Account, kind: AssetKind, symbol: string, mark: MarkPrice): number | null {
  if (mark.reference == null) return null;
  const sd = mark.sessionDate;
  let held = sd ? quantityBefore(acc, kind, symbol, sd) : acc.positions[key(kind, symbol)]?.quantity ?? 0;
  let pnl = 0;
  if (sd) {
    for (const t of acc.transactions) {
      if (t.kind !== kind || t.symbol !== symbol || t.sessionDate !== sd) continue;
      if (t.type === 'buy') pnl += t.quantity * (mark.price - t.price) - t.fee;
      else if (t.type === 'sell') { pnl += t.quantity * (t.price - mark.reference) - t.fee; held -= t.quantity; }
      else if (t.type === 'split') held += t.quantity;
    }
  }
  return pnl + Math.max(0, held) * (mark.price - mark.reference);
}

export function valuate(acc: Account, prices: Record<string, MarkPrice | undefined>): Valuation {
  let mv = 0, invested = 0, unreal = 0, day = 0, dayKnown = true;
  const rows = Object.entries(acc.positions).map(([k, p]) => {
    const pr = prices[k];
    const value = pr ? p.quantity * pr.price : null;
    invested += p.costBasis;
    if (value != null) { mv += value; unreal += value - p.costBasis; } else dayKnown = false;
    const dc = pr ? dayChangeFor(acc, p.kind, p.symbol, pr) : null;
    if (dc != null) day += dc; else dayKnown = false;
    return { position: p, price: pr?.price ?? null, value, unrealized: value != null ? value - p.costBasis : null, dayChange: dc, weight: null as number | null };
  });
  const total = acc.cash + mv;
  rows.forEach((r) => (r.weight = r.value != null && total > 0 ? r.value / total : null));
  // positions closed during the current session still contribute to today's change
  const open = new Set(Object.keys(acc.positions));
  for (const [k, pr] of Object.entries(prices)) {
    if (!pr || open.has(k) || !pr.sessionDate) continue;
    const [kind, symbol] = k.split(':') as [AssetKind, string];
    if (!acc.transactions.some((t) => t.kind === kind && t.symbol === symbol && t.sessionDate === pr.sessionDate)) continue;
    const dc = dayChangeFor(acc, kind, symbol, pr);
    if (dc == null) dayKnown = false; else day += dc;
  }
  const realized = acc.transactions.reduce((s, t) => s + t.realizedPnl, 0);
  const dividends = acc.transactions.filter((t) => t.type === 'dividend').reduce((s, t) => s + t.cashChange, 0);
  return {
    cash: acc.cash, marketValue: mv, total, invested, unrealized: unreal, realized, dividends,
    totalReturn: total / acc.startingCapital - 1, dayChange: dayKnown ? day : null, rows,
  };
}

/**
 * Reconstruct end-of-day account values from the transaction log and daily closes.
 * closes: key → Map(date → close). calendar: ascending session dates.
 */
export function equityHistory(acc: Account, calendar: string[], closes: Record<string, Map<string, number>>): Array<{ date: string; value: number; stale: boolean }> {
  if (!acc.transactions.length) return [];
  const first = acc.transactions.map((t) => t.sessionDate).sort()[0];
  const txs = [...acc.transactions].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.at.localeCompare(b.at));
  const out: Array<{ date: string; value: number; stale: boolean }> = [];
  const qty: Record<string, number> = {};
  const lastClose: Record<string, number> = {};
  let cash = acc.startingCapital;
  let i = 0;
  for (const d of calendar) {
    if (d < first) continue;
    while (i < txs.length && txs[i].sessionDate <= d) {
      const t = txs[i++];
      const k = key(t.kind, t.symbol);
      if (t.type === 'buy' || t.type === 'split') qty[k] = (qty[k] ?? 0) + t.quantity;
      if (t.type === 'sell') qty[k] = (qty[k] ?? 0) - t.quantity;
      cash = t.cashAfter;
    }
    let v = cash, stale = false;
    for (const [k, q] of Object.entries(qty)) {
      if (Math.abs(q) < EPS) continue;
      const c = closes[k]?.get(d);
      if (c != null) lastClose[k] = c;
      else stale = true;
      if (lastClose[k] == null) { stale = true; continue; }
      v += q * lastClose[k];
    }
    out.push({ date: d, value: v, stale });
  }
  return out;
}

export function audit(acc: Account, event: string, detail: string, at = new Date().toISOString()): Account {
  const entries = [...acc.audit, { at, event, detail }];
  return { ...acc, audit: entries.length > 2000 ? entries.slice(-2000) : entries };
}

export function prevDay(date: string): string {
  return new Date(Date.parse(date + 'T00:00:00Z') - 86400_000).toISOString().slice(0, 10);
}

export function transactionsCsv(acc: Account): string {
  const head = ['session_date', 'recorded_at', 'type', 'symbol', 'asset_class', 'quantity', 'price', 'fee', 'cash_change', 'cash_after', 'realized_pnl', 'price_basis', 'price_as_of'];
  const rows = acc.transactions.map((t) => [t.sessionDate, t.at, t.type, t.symbol, t.kind, t.quantity, t.price, t.fee.toFixed(4), t.cashChange.toFixed(4), t.cashAfter.toFixed(4), t.realizedPnl.toFixed(4), t.priceBasis ?? '', t.priceAsOf ?? '']);
  return [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
}

/* ---------------- persistence ---------------- */

const STORAGE_KEY = 'marketlab:account:v1';

export function loadAccount(): Account {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const acc = JSON.parse(raw) as Account;
      if (acc.version === ACCOUNT_VERSION && typeof acc.cash === 'number') return acc;
    }
  } catch { /* corrupted or unavailable storage */ }
  return createAccount();
}

export function saveAccount(acc: Account): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acc));
    return true;
  } catch {
    return false;
  }
}
