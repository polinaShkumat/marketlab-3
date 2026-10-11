/**
 * Strategy backtesting on dividend- and split-adjusted daily prices.
 *
 * Timing convention (prevents look-ahead bias):
 *   decision at the close of day t, using prices with index ≤ t only,
 *   execution at the (adjusted) open of day t+1, marking at closes.
 * The PriceView passed to strategies throws if code requests an index > t.
 */
import type { Bar } from '../types';
import { alignOnDates, covariance, mean } from './metrics';

export interface Panel {
  symbols: string[];
  dates: string[];
  open: number[][]; // [asset][t] adjusted open
  close: number[][]; // [asset][t] adjusted close
}

export function buildPanel(series: Record<string, Bar[]>, from: string, to: string): Panel {
  const symbols = Object.keys(series);
  const closeS = symbols.map((s) => series[s].filter((b) => b.date >= from && b.date <= to).map((b) => ({ date: b.date, value: b.adjClose })));
  const { dates } = alignOnDates(closeS);
  const maps = symbols.map((s) => new Map(series[s].map((b) => [b.date, b])));
  return {
    symbols, dates,
    open: maps.map((m) => dates.map((d) => m.get(d)!.adjOpen)),
    close: maps.map((m) => dates.map((d) => m.get(d)!.adjClose)),
  };
}

export class LookAheadError extends Error {}

export interface PriceView {
  t: number;
  date: (i: number) => string;
  close: (asset: number, i: number) => number;
}

function view(panel: Panel, t: number): PriceView {
  const guard = (i: number) => {
    if (i > t) throw new LookAheadError(`Strategy requested index ${i} at decision time ${t}`);
    if (i < 0) throw new RangeError('index < 0');
  };
  return {
    t,
    date: (i) => { guard(i); return panel.dates[i]; },
    close: (a, i) => { guard(i); return panel.close[a][i]; },
  };
}

/** A strategy returns target weights (sum ≤ 1, rest cash) or null to hold. */
export type Strategy = { name: string; decide: (v: PriceView, n: number) => number[] | null; contributionSchedule?: (t: number, dates: string[]) => number };

export interface BacktestResult {
  dates: string[];
  equity: number[];
  trades: number;
  fees: number;
  turnover: number; // total traded notional / average equity
  finalWeights: number[];
}

export function runBacktest(panel: Panel, strategy: Strategy, capital: number, feeBps: number): BacktestResult {
  const n = panel.symbols.length;
  const T = panel.dates.length;
  let cash = capital;
  const qty = new Array(n).fill(0);
  const equity: number[] = [];
  let pending: number[] | null = null;
  let trades = 0, fees = 0, traded = 0;
  // DCA: capital not yet released is held in a reserve that cannot be invested.
  let reserve = strategy.contributionSchedule ? capital : 0;

  for (let t = 0; t < T; t++) {
    if (strategy.contributionSchedule) reserve = Math.max(0, reserve - strategy.contributionSchedule(t, panel.dates));
    // 1) execute yesterday's decision at today's open
    if (pending) {
      const pxOpen = panel.open.map((o) => o[t]);
      const value = cash + qty.reduce((s, q, a) => s + q * pxOpen[a], 0);
      const investable = Math.max(0, value - reserve);
      const target = pending.map((w) => w * investable);
      // sells first, then buys
      const order = [...Array(n).keys()].sort((a, b) => (target[a] - qty[a] * pxOpen[a]) - (target[b] - qty[b] * pxOpen[b]));
      for (const a of order) {
        const cur = qty[a] * pxOpen[a];
        let delta = target[a] - cur;
        if (Math.abs(delta) < 1e-6 * capital) continue;
        if (delta > 0) {
          const maxSpend = (cash - reserve) / (1 + feeBps / 10_000);
          delta = Math.min(delta, maxSpend);
          if (delta <= 0) continue;
        }
        const fee = (Math.abs(delta) * feeBps) / 10_000;
        qty[a] += delta / pxOpen[a];
        cash -= delta + fee;
        fees += fee;
        traded += Math.abs(delta);
        trades++;
      }
      pending = null;
    }
    // 2) mark to market at the close
    const v = cash + qty.reduce((s, q, a) => s + q * panel.close[a][t], 0);
    equity.push(v);
    // 3) decide using information up to and including today's close
    if (t < T - 1) {
      const w = strategy.decide(view(panel, t), n);
      if (w) pending = normalize(w);
    }
  }
  const lastV = equity.at(-1) ?? capital;
  return {
    dates: panel.dates, equity, trades, fees,
    turnover: traded / (mean(equity) || capital),
    finalWeights: qty.map((q, a) => (lastV > 0 ? (q * panel.close[a][T - 1]) / lastV : 0)),
  };
}

function normalize(w: number[]): number[] {
  const clean = w.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const s = clean.reduce((a, b) => a + b, 0);
  return s > 1 ? clean.map((x) => x / s) : clean;
}

const monthOf = (d: string) => d.slice(0, 7);
function isFirstDayOfPeriod(v: PriceView, months: number): boolean {
  if (v.t === 0) return true;
  const a = v.date(v.t), b = v.date(v.t - 1);
  if (monthOf(a) === monthOf(b)) return false;
  const m = Number(a.slice(5, 7)) - 1;
  return m % months === 0;
}

/* ---------------- strategies ---------------- */

export const buyAndHold = (weights: number[]): Strategy => ({
  name: 'Buy and hold',
  decide: (v) => (v.t === 0 ? weights : null),
});

export const periodicRebalance = (weights: number[], months: number): Strategy => ({
  name: `Rebalance every ${months} month${months > 1 ? 's' : ''}`,
  // Decision on the first session of each period (known at that close); executes next session.
  decide: (v) => (v.t === 0 || isFirstDayOfPeriod(v, months) ? weights : null),
});

/** Dollar-cost averaging: capital invested in `installments` equal monthly tranches. */
export const dollarCostAveraging = (weights: number[], installments: number, capital: number): Strategy => {
  let seen = 0;
  let lastMonth = '';
  return {
    name: `Dollar-cost averaging (${installments} monthly installments)`,
    contributionSchedule: (t, dates) => {
      const m = monthOf(dates[t]);
      if (t === 0) { seen = 0; lastMonth = ''; }
      if (m !== lastMonth && seen < installments) {
        lastMonth = m;
        seen++;
        return capital / installments;
      }
      return 0;
    },
    decide: (v) => (v.t === 0 || isFirstDayOfPeriod(v, 1) ? weights : null),
  };
};

/** Moving-average crossover per asset: hold an equal share of each asset whose fast SMA > slow SMA. */
export const maCrossover = (fast: number, slow: number): Strategy => ({
  name: `Moving-average crossover (${fast}/${slow})`,
  decide: (v, n) => {
    if (v.t < slow - 1) return null;
    const on: boolean[] = [];
    for (let a = 0; a < n; a++) {
      let sf = 0, ss = 0;
      for (let i = v.t - slow + 1; i <= v.t; i++) {
        const c = v.close(a, i);
        ss += c;
        if (i > v.t - fast) sf += c;
      }
      on.push(sf / fast > ss / slow);
    }
    return on.map((x) => (x ? 1 / n : 0));
  },
});

/** Cross-sectional momentum: each month, hold the top-k assets by trailing `lookback`-day return. */
export const momentum = (lookback: number, topK: number): Strategy => ({
  name: `Momentum (top ${topK}, ${lookback}-day lookback)`,
  decide: (v, n) => {
    if (v.t < lookback || !isFirstDayOfPeriod(v, 1)) return null;
    const scores = [...Array(n).keys()].map((a) => ({ a, r: v.close(a, v.t) / v.close(a, v.t - lookback) - 1 }));
    scores.sort((x, y) => y.r - x.r);
    const k = Math.min(topK, n);
    const w = new Array(n).fill(0);
    scores.slice(0, k).forEach((s) => (w[s.a] = s.r > 0 ? 1 / k : 0)); // absolute filter: no long in negative momentum
    return w;
  },
});

/* ---------------- mean-variance optimization (long-only) ---------------- */

export function annualizedMoments(panel: Panel, periodsPerYear = 252) {
  const rets = panel.close.map((c) => c.slice(1).map((x, i) => x / c[i] - 1));
  const mu = rets.map((r) => mean(r) * periodsPerYear);
  const cov = rets.map((ri) => rets.map((rj) => covariance(ri, rj) * periodsPerYear));
  return { mu, cov, observations: rets[0]?.length ?? 0 };
}

/** Euclidean projection onto the probability simplex (Duchi et al., 2008). */
export function projectSimplex(v: number[]): number[] {
  const u = [...v].sort((a, b) => b - a);
  let css = 0, rho = 0, theta = 0;
  for (let i = 0; i < u.length; i++) {
    css += u[i];
    const t = (css - 1) / (i + 1);
    if (u[i] - t > 0) { rho = i; theta = t; }
  }
  void rho;
  return v.map((x) => Math.max(x - theta, 0));
}

const quad = (w: number[], C: number[][]) => w.reduce((s, wi, i) => s + wi * C[i].reduce((t, cij, j) => t + cij * w[j], 0), 0);
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Solve min wᵀΣw − λ μᵀw over the simplex by projected gradient descent. */
export function solveMeanVariance(mu: number[], cov: number[][], lambda: number, iters = 3000): number[] {
  const n = mu.length;
  let w = new Array(n).fill(1 / n);
  const L = 2 * Math.sqrt(cov.reduce((s, row) => s + row.reduce((t, x) => t + x * x, 0), 0)) + 1e-12; // Lipschitz bound
  const step = 1 / L;
  for (let k = 0; k < iters; k++) {
    const g = cov.map((row) => 2 * dot(row, w)).map((x, i) => x - lambda * mu[i]);
    const next = projectSimplex(w.map((x, i) => x - step * g[i]));
    const moved = next.reduce((s, x, i) => s + Math.abs(x - w[i]), 0);
    w = next;
    if (moved < 1e-10) break;
  }
  return w;
}

export interface FrontierPoint { weights: number[]; ret: number; vol: number; sharpe: number }

export function efficientFrontier(mu: number[], cov: number[][], rf = 0, points = 40): { frontier: FrontierPoint[]; minVar: FrontierPoint; maxSharpe: FrontierPoint } {
  const mk = (w: number[]): FrontierPoint => {
    const ret = dot(w, mu), vol = Math.sqrt(Math.max(quad(w, cov), 0));
    return { weights: w, ret, vol, sharpe: vol > 0 ? (ret - rf) / vol : NaN };
  };
  const lambdas = [0, ...Array.from({ length: points - 1 }, (_, i) => 10 ** (-3 + (5 * i) / (points - 2)))];
  const raw = lambdas.map((l) => mk(solveMeanVariance(mu, cov, l)));
  raw.sort((a, b) => a.vol - b.vol);
  const frontier: FrontierPoint[] = [];
  for (const p of raw) if (!frontier.length || p.ret > frontier.at(-1)!.ret + 1e-9) frontier.push(p);
  const minVar = frontier[0];
  const maxSharpe = frontier.reduce((b, p) => (p.sharpe > b.sharpe ? p : b), frontier[0]);
  return { frontier, minVar, maxSharpe };
}

/** Seeded PRNG for reproducible random portfolio clouds. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomPortfolios(mu: number[], cov: number[][], count = 1500, seed = 7) {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const e = mu.map(() => -Math.log(1 - rnd())); // Dirichlet(1,...,1)
    const s = e.reduce((a, b) => a + b, 0);
    const w = e.map((x) => x / s);
    return { ret: dot(w, mu), vol: Math.sqrt(Math.max(quad(w, cov), 0)) };
  });
}
