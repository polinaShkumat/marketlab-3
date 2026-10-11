import { describe, expect, it } from 'vitest';
import {
  applyCorporateActions, availableCash, cancelOrder, createAccount, equityHistory, evaluateLimitOrders,
  placeOrder, transactionsCsv, valuate, type PriceRef,
} from '../src/lib/portfolio';
import { bar } from './helpers';

const ref = (price: number, sessionDate = '2026-10-09', basis: PriceRef['basis'] = 'eod-close'): PriceRef =>
  ({ price, asOf: `${sessionDate}T20:00:00Z`, basis, sessionDate });

describe('paper trading account', () => {
  it('buys $5,000 of AAPL and debits cash including fees', () => {
    const acc = createAccount(5);
    const qty = 5000 / 250;
    const { account, order } = placeOrder(acc, { symbol: 'AAPL', kind: 'equity', side: 'buy', type: 'market', quantity: qty }, ref(250));
    expect(order.status).toBe('filled');
    expect(account.cash).toBeCloseTo(100_000 - 5000 - 2.5); // 5 bps of 5,000
    expect(account.positions['equity:AAPL'].quantity).toBe(20);
    expect(account.positions['equity:AAPL'].costBasis).toBeCloseTo(5002.5);
  });

  it('sells part of a position with correct realized and unrealized P&L', () => {
    let { account } = placeOrder(createAccount(0), { symbol: 'AAPL', kind: 'equity', side: 'buy', type: 'market', quantity: 20 }, ref(250));
    ({ account } = placeOrder(account, { symbol: 'AAPL', kind: 'equity', side: 'sell', type: 'market', quantity: 8 }, ref(275)));
    expect(account.cash).toBeCloseTo(100_000 - 5000 + 8 * 275);
    const v = valuate(account, { 'equity:AAPL': { price: 300, reference: 290 } });
    expect(v.realized).toBeCloseTo(8 * 25);
    expect(v.unrealized).toBeCloseTo(12 * 50);
    expect(v.total).toBeCloseTo(account.cash + 12 * 300);
    expect(v.dayChange).toBeCloseTo(12 * 10);
  });

  it('rejects impossible trades: overspending and selling more than held', () => {
    const acc = createAccount();
    expect(placeOrder(acc, { symbol: 'X', kind: 'equity', side: 'buy', type: 'market', quantity: 1000 }, ref(1000)).order.status).toBe('rejected');
    expect(placeOrder(acc, { symbol: 'X', kind: 'equity', side: 'sell', type: 'market', quantity: 1 }, ref(10)).order.status).toBe('rejected');
    expect(placeOrder(acc, { symbol: 'X', kind: 'equity', side: 'buy', type: 'market', quantity: 0 }, ref(10)).order.status).toBe('rejected');
  });

  it('rests a non-marketable buy limit, reserves cash, fills on a later bar low', () => {
    const acc = createAccount(0);
    const { account, order } = placeOrder(acc, { symbol: 'MSFT', kind: 'equity', side: 'buy', type: 'limit', quantity: 10, limitPrice: 400 }, ref(420, '2026-10-05'));
    expect(order.status).toBe('pending');
    expect(availableCash(account)).toBeCloseTo(100_000 - 4000);
    const bars = [
      bar('2026-10-05', 420, { low: 395 }), // same session: ignored
      bar('2026-10-06', 415, { open: 418, low: 405, high: 420 }),
      bar('2026-10-07', 402, { open: 410, low: 398, high: 411 }),
    ];
    const after = evaluateLimitOrders(account, 'equity', 'MSFT', bars, null);
    const filled = after.orders.find((o) => o.id === order.id)!;
    expect(filled.status).toBe('filled');
    expect(filled.fillPrice).toBe(400);
    expect(filled.sessionDate).toBe('2026-10-05');
    expect(after.cash).toBeCloseTo(96_000);
  });

  it('fills a buy limit at the open when the market gaps below the limit', () => {
    const { account, order } = placeOrder(createAccount(0), { symbol: 'M', kind: 'equity', side: 'buy', type: 'limit', quantity: 1, limitPrice: 100 }, ref(110, '2026-10-05'));
    const after = evaluateLimitOrders(account, 'equity', 'M', [bar('2026-10-06', 95, { open: 96, low: 94, high: 97 })], null);
    expect(after.orders.find((o) => o.id === order.id)!.fillPrice).toBe(96);
  });

  it('cancels resting orders after a split and supports manual cancel', () => {
    const { account, order } = placeOrder(createAccount(0), { symbol: 'N', kind: 'equity', side: 'buy', type: 'limit', quantity: 1, limitPrice: 100 }, ref(110, '2026-10-05'));
    const after = evaluateLimitOrders(account, 'equity', 'N', [bar('2026-10-06', 11, { split: 10 })], null);
    expect(after.orders.find((o) => o.id === order.id)!.status).toBe('cancelled');
    const c = cancelOrder(account, order.id);
    expect(availableCash(c)).toBeCloseTo(100_000);
  });

  it('applies splits and ex-date dividends only to shares held before the ex-date', () => {
    let { account } = placeOrder(createAccount(0), { symbol: 'KO', kind: 'equity', side: 'buy', type: 'market', quantity: 100 }, ref(60, '2026-01-05'));
    const bars = [
      bar('2026-01-05', 60),
      bar('2026-01-06', 30, { split: 2 }),
      bar('2026-01-07', 31, { dividend: 0.5 }),
    ];
    account = applyCorporateActions(account, 'equity', 'KO', bars);
    expect(account.positions['equity:KO'].quantity).toBe(200);
    expect(account.cash).toBeCloseTo(100_000 - 6000 + 200 * 0.5);
    // idempotent
    const again = applyCorporateActions(account, 'equity', 'KO', bars);
    expect(again.cash).toBe(account.cash);
  });

  it('does not pay dividends for shares bought on the ex-date', () => {
    let { account } = placeOrder(createAccount(0), { symbol: 'KO', kind: 'equity', side: 'buy', type: 'market', quantity: 10 }, ref(60, '2026-01-07'));
    account = applyCorporateActions(account, 'equity', 'KO', [bar('2026-01-07', 60, { dividend: 0.5 })]);
    expect(account.cash).toBeCloseTo(100_000 - 600);
  });

  it('reconstructs daily account value from transactions and closes', () => {
    const { account } = placeOrder(createAccount(0), { symbol: 'A', kind: 'equity', side: 'buy', type: 'market', quantity: 10 }, ref(100, '2026-01-05'));
    const closes = { 'equity:A': new Map([['2026-01-05', 100], ['2026-01-06', 110], ['2026-01-08', 120]]) };
    const h = equityHistory(account, ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'], closes);
    expect(h.map((x) => x.value)).toEqual([100_000, 100_100, 100_100, 100_200]);
    expect(h[2].stale).toBe(true);
  });

  it('exports CSV with a header row', () => {
    const { account } = placeOrder(createAccount(), { symbol: 'A', kind: 'equity', side: 'buy', type: 'market', quantity: 1 }, ref(10));
    const csv = transactionsCsv(account).split('\n');
    expect(csv[0]).toContain('session_date');
    expect(csv).toHaveLength(2);
  });
});

describe('today\'s change', () => {
  it('measures shares bought this session from their fill price, not the previous close', async () => {
    const { dayChangeFor } = await import('../src/lib/portfolio');
    const { account } = placeOrder(createAccount(0), { symbol: 'A', kind: 'equity', side: 'buy', type: 'market', quantity: 10 }, ref(105, '2026-10-09'));
    expect(dayChangeFor(account, 'equity', 'A', { price: 107, reference: 100, sessionDate: '2026-10-09' })).toBeCloseTo(20);
    expect(dayChangeFor(account, 'equity', 'A', { price: 107, reference: 105, sessionDate: '2026-10-10' })).toBeCloseTo(20);
  });
});
