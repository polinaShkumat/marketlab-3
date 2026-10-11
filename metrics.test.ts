import { describe, expect, it } from 'vitest';
import {
  annualizedReturn, annualizedVolatility, beta, computeMetrics, correlation, maxDrawdown, riskFreePerPeriod, sharpe, sortino,
} from '../src/lib/metrics';

const dated = (vals: number[]) => vals.map((v, i) => ({ date: `2020-01-${String(i + 1).padStart(2, '0')}`, value: v }));

describe('metrics', () => {
  it('CAGR over exactly one year of 252 periods', () => {
    const v = Array.from({ length: 253 }, (_, i) => 100 * 1.1 ** (i / 252));
    expect(annualizedReturn(v, 252)).toBeCloseTo(0.1, 10);
  });
  it('volatility uses sample sd × √252', () => {
    const r = [0.01, -0.01, 0.01, -0.01];
    const sd = Math.sqrt((4 * 0.0001) / 3);
    expect(annualizedVolatility(r)).toBeCloseTo(sd * Math.sqrt(252));
  });
  it('Sharpe subtracts per-period risk-free rate', () => {
    const r = [0.02, 0.0, 0.01, 0.03];
    const rf = 0.001;
    const ex = r.map((x) => x - rf);
    const m = ex.reduce((a, b) => a + b) / 4;
    const sd = Math.sqrt(ex.reduce((a, b) => a + (b - m) ** 2, 0) / 3);
    expect(sharpe(r, rf)).toBeCloseTo((m / sd) * Math.sqrt(252));
  });
  it('Sortino uses downside deviation relative to target', () => {
    const r = [0.02, -0.01, 0.01, -0.02];
    const dd = Math.sqrt((0.0001 + 0.0004) / 4);
    expect(sortino(r, 0)).toBeCloseTo((0 * 252) / (dd * Math.sqrt(252)));
  });
  it('maximum drawdown with dates and recovery', () => {
    const s = dated([100, 120, 90, 60, 80, 130]);
    const m = maxDrawdown(s);
    expect(m.mdd).toBeCloseTo(60 / 120 - 1);
    expect(m.peakDate).toBe('2020-01-02');
    expect(m.troughDate).toBe('2020-01-04');
    expect(m.recoveryDate).toBe('2020-01-06');
  });
  it('beta of 2x-levered returns is 2, correlation 1', () => {
    const rb = [0.01, -0.02, 0.015, 0.003, -0.007];
    const rp = rb.map((x) => 2 * x);
    expect(beta(rp, rb)).toBeCloseTo(2);
    expect(correlation(rp, rb)).toBeCloseTo(1);
  });
  it('refuses annualized statistics with fewer than 30 observations', () => {
    const m = computeMetrics(dated([100, 101, 102]), null);
    expect(m.insufficient).toBe(true);
    expect(m.sharpe).toBeNull();
    expect(m.annualized).toBeNull();
    expect(m.cumulative).toBeCloseTo(0.02);
  });
  it('risk-free conversion carries the last known yield forward', () => {
    const rf = riskFreePerPeriod(['2020-01-02', '2020-01-03'], [{ date: '2020-01-01', value: 5.04 }]);
    expect(rf[1]).toBeCloseTo(1.0504 ** (1 / 252) - 1);
  });
});
