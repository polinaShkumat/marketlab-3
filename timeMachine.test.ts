import { describe, expect, it } from 'vitest';
import { advance, jumpTo, makeAssets, startSimulation, trade, visibleBars } from '../src/lib/timeMachine';
import { bar } from './helpers';

const assets = () => makeAssets([
  { symbol: 'AAA', kind: 'equity', bars: [
    bar('2008-01-02', 100, { open: 99 }), bar('2008-01-03', 102, { open: 101 }),
    bar('2008-01-04', 51, { open: 50.5, split: 2 }), bar('2008-01-07', 52, { open: 51, dividend: 1 }), bar('2008-01-08', 53),
  ] },
  { symbol: 'NEW', kind: 'equity', bars: [bar('2008-01-07', 10)] },
]);

describe('market time machine', () => {
  it('shows only bars before the current session (no look-ahead)', () => {
    const a = assets();
    let s = startSimulation(a, '2008-01-01', 10_000, 0);
    expect(visibleBars(a.AAA, s)).toHaveLength(0);
    s = advance(s, a, 2);
    expect(visibleBars(a.AAA, s).map((b) => b.date)).toEqual(['2008-01-02', '2008-01-03']);
  });

  it('fills at the raw open and applies split then dividend', () => {
    const a = assets();
    let s = startSimulation(a, '2008-01-02', 10_000, 0);
    const r = trade(s, a.AAA, 'buy', 10);
    expect(r.error).toBeNull();
    s = r.state;
    expect(s.cash).toBe(10_000 - 990);
    s = advance(s, a, 2); // now at 01-04 open: split applied
    expect(s.qty.AAA).toBe(20);
    s = advance(s, a, 1); // 01-07: dividend $1 × 20
    expect(s.cash).toBe(10_000 - 990 + 20);
    expect(s.equity.map((e) => e.date)).toEqual(['2008-01-02', '2008-01-03', '2008-01-04']);
  });

  it('rejects trading an asset before it existed', () => {
    const a = assets();
    const s = startSimulation(a, '2008-01-02', 10_000, 0);
    expect(trade(s, a.NEW, 'buy', 1).error).toMatch(/did not trade/);
  });

  it('jumps forward and finishes at the end of data', () => {
    const a = assets();
    let s = startSimulation(a, '2008-01-02', 10_000, 0);
    s = jumpTo(s, a, '2008-01-08');
    expect(s.calendar[s.cursor]).toBe('2008-01-08');
    s = advance(s, a, 5);
    expect(s.finished).toBe(true);
  });
});
