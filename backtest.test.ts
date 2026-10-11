import { describe, expect, it } from 'vitest';
import {
  LookAheadError, annualizedMoments, buildPanel, buyAndHold, dollarCostAveraging, efficientFrontier, maCrossover, momentum,
  periodicRebalance, projectSimplex, runBacktest, type Strategy,
} from '../src/lib/backtest';
import { series } from './helpers';

const panelOf = (a: number[], b: number[]) => buildPanel({ A: series('2020-01-01', a), B: series('2020-01-01', b) }, '2000-01-01', '2100-01-01');

describe('backtesting', () => {
  it('buy-and-hold executes at the next open and tracks prices', () => {
    const p = panelOf([100, 100, 110, 121], [50, 50, 50, 50]);
    const r = runBacktest(p, buyAndHold([1, 0]), 10_000, 0);
    expect(r.equity[0]).toBe(10_000); // decision at t=0 close, nothing held yet
    expect(r.equity[1]).toBeCloseTo(10_000);
    expect(r.equity[3]).toBeCloseTo(12_100);
  });

  it('charges transaction fees on traded notional', () => {
    const p = panelOf([100, 100, 100], [100, 100, 100]);
    const r = runBacktest(p, buyAndHold([0.5, 0.5]), 10_000, 10);
    expect(r.fees).toBeCloseTo(10_000 * 0.001, 0);
    expect(r.equity.at(-1)!).toBeLessThan(10_000);
  });

  it('throws if a strategy peeks into the future', () => {
    const cheat: Strategy = { name: 'cheat', decide: (v) => { v.close(0, v.t + 1); return null; } };
    expect(() => runBacktest(panelOf([1, 2, 3], [1, 2, 3]), cheat, 100, 0)).toThrow(LookAheadError);
  });

  it('built-in strategies never trigger the look-ahead guard', () => {
    const n = 400;
    const a = Array.from({ length: n }, (_, i) => 100 + i + 10 * Math.sin(i / 9));
    const b = Array.from({ length: n }, (_, i) => 100 + 20 * Math.cos(i / 13));
    const p = panelOf(a, b);
    for (const s of [buyAndHold([0.5, 0.5]), periodicRebalance([0.6, 0.4], 3), maCrossover(20, 50), momentum(60, 1), dollarCostAveraging([0.5, 0.5], 6, 10_000)]) {
      const r = runBacktest(p, s, 10_000, 5);
      expect(r.equity).toHaveLength(n);
      expect(r.equity.every((x) => Number.isFinite(x) && x > 0)).toBe(true);
    }
  });

  it('DCA keeps uninvested installments in cash', () => {
    const flat = Array.from({ length: 70 }, () => 100);
    const p = panelOf(flat, flat);
    const r = runBacktest(p, dollarCostAveraging([1, 0], 12, 12_000), 12_000, 0);
    expect(r.finalWeights[0]).toBeGreaterThan(0.1);
    expect(r.finalWeights[0]).toBeLessThan(0.5); // ~3 of 12 installments within ~70 days
  });

  it('simplex projection returns valid weights', () => {
    const w = projectSimplex([0.8, 0.6, -0.2]);
    expect(w.reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(w.every((x) => x >= 0)).toBe(true);
  });

  it('minimum-variance weights for two uncorrelated assets are inverse-variance', () => {
    const cov = [[0.04, 0], [0, 0.01]];
    const { minVar } = efficientFrontier([0.08, 0.05], cov, 0, 12);
    expect(minVar.weights[0]).toBeCloseTo(0.2, 3);
    expect(minVar.weights[1]).toBeCloseTo(0.8, 3);
  });

  it('annualized moments have the right shape', () => {
    const p = panelOf([1, 1.01, 1.02, 1.0], [1, 0.99, 1.0, 1.01]);
    const m = annualizedMoments(p);
    expect(m.mu).toHaveLength(2);
    expect(m.cov[0][1]).toBeCloseTo(m.cov[1][0]);
  });
});
