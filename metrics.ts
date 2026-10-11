/**
 * Performance and risk statistics. Conventions (documented in docs/METHODOLOGY.md):
 *  - Returns are simple period returns r_t = V_t / V_{t-1} − 1 on the sampling calendar.
 *  - Annualization factor: 252 (US trading days) unless stated; 365 for crypto-only series.
 *  - Volatility uses the sample standard deviation (n − 1).
 *  - Sharpe = mean(r − rf) / sd(r − rf) × √A ; rf is the per-period risk-free rate.
 *  - Sortino = mean(r − rf) × A / (√(mean(min(r − rf, 0)²)) × √A), target = rf.
 *  - Statistics require at least MIN_OBS returns; otherwise null.
 */
export const MIN_OBS = 30;

export interface DatedValue { date: string; value: number }

export function returns(values: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < values.length; i++) r.push(values[i] / values[i - 1] - 1);
  return r;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function sampleStd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

export function correlation(a: number[], b: number[]): number {
  const c = covariance(a, b);
  const n = Math.min(a.length, b.length);
  return c / (sampleStd(a.slice(0, n)) * sampleStd(b.slice(0, n)));
}

export function cumulativeReturn(values: number[]): number {
  return values.length >= 2 ? values[values.length - 1] / values[0] - 1 : NaN;
}

/** Geometric annualized return (CAGR) from n periodic returns. */
export function annualizedReturn(values: number[], periodsPerYear = 252): number {
  const n = values.length - 1;
  if (n < 1) return NaN;
  return (values[values.length - 1] / values[0]) ** (periodsPerYear / n) - 1;
}

export function annualizedVolatility(r: number[], periodsPerYear = 252): number {
  return sampleStd(r) * Math.sqrt(periodsPerYear);
}

export function sharpe(r: number[], rf: number[] | number = 0, periodsPerYear = 252): number {
  const ex = r.map((x, i) => x - (Array.isArray(rf) ? rf[i] ?? 0 : rf));
  return (mean(ex) / sampleStd(ex)) * Math.sqrt(periodsPerYear);
}

export function sortino(r: number[], rf: number[] | number = 0, periodsPerYear = 252): number {
  const ex = r.map((x, i) => x - (Array.isArray(rf) ? rf[i] ?? 0 : rf));
  const dd = Math.sqrt(mean(ex.map((x) => Math.min(x, 0) ** 2)));
  if (dd === 0) return NaN;
  return (mean(ex) * periodsPerYear) / (dd * Math.sqrt(periodsPerYear));
}

export function maxDrawdown(series: DatedValue[]): { mdd: number; peakDate: string | null; troughDate: string | null; recoveryDate: string | null } {
  let peak = -Infinity, peakDate: string | null = null;
  let mdd = 0, pk: string | null = null, tr: string | null = null;
  for (const p of series) {
    if (p.value > peak) { peak = p.value; peakDate = p.date; }
    const dd = p.value / peak - 1;
    if (dd < mdd) { mdd = dd; pk = peakDate; tr = p.date; }
  }
  let recovery: string | null = null;
  if (tr) {
    const peakVal = series.find((p) => p.date === pk)!.value;
    const after = series.filter((p) => p.date > tr!);
    recovery = after.find((p) => p.value >= peakVal)?.date ?? null;
  }
  return { mdd, peakDate: pk, troughDate: tr, recoveryDate: recovery };
}

export function drawdownSeries(series: DatedValue[]): DatedValue[] {
  let peak = -Infinity;
  return series.map((p) => {
    peak = Math.max(peak, p.value);
    return { date: p.date, value: p.value / peak - 1 };
  });
}

export function beta(rp: number[], rb: number[]): number {
  return covariance(rp, rb) / covariance(rb, rb);
}

/** Inner-join several dated series on common dates (ascending). */
export function alignOnDates(series: DatedValue[][]): { dates: string[]; values: number[][] } {
  if (!series.length) return { dates: [], values: [] };
  const maps = series.map((s) => new Map(s.map((p) => [p.date, p.value])));
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  return { dates, values: maps.map((m) => dates.map((d) => m.get(d)!)) };
}

/** Convert an annualized percent yield series (e.g. FRED DTB3) to per-period rates on the given dates (carry forward). */
export function riskFreePerPeriod(dates: string[], ratePct: DatedValue[], periodsPerYear = 252): number[] {
  const sorted = [...ratePct].sort((a, b) => a.date.localeCompare(b.date));
  let j = -1;
  return dates.map((d) => {
    while (j + 1 < sorted.length && sorted[j + 1].date <= d) j++;
    const y = j >= 0 ? sorted[j].value : 0;
    return (1 + y / 100) ** (1 / periodsPerYear) - 1;
  });
}

export interface MetricSet {
  observations: number;
  cumulative: number | null;
  annualized: number | null;
  volatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  beta: number | null;
  correlation: number | null;
  excessVsBenchmark: number | null;
  insufficient: boolean;
}

const fin = (x: number) => (Number.isFinite(x) ? x : null);

/** Full statistic set for a value series against an aligned benchmark series. */
export function computeMetrics(
  portfolio: DatedValue[],
  benchmark: DatedValue[] | null,
  rfPerPeriod: number[] | number = 0,
  periodsPerYear = 252,
): MetricSet {
  const values = portfolio.map((p) => p.value);
  const r = returns(values);
  const ok = r.length >= MIN_OBS;
  let b: number | null = null, c: number | null = null, excess: number | null = null;
  if (benchmark && ok) {
    const { values: v } = alignOnDates([portfolio, benchmark]);
    const rp = returns(v[0]), rb = returns(v[1]);
    if (rp.length >= MIN_OBS) {
      b = fin(beta(rp, rb));
      c = fin(correlation(rp, rb));
      excess = fin(cumulativeReturn(v[0]) - cumulativeReturn(v[1]));
    }
  }
  const rf = Array.isArray(rfPerPeriod) ? rfPerPeriod.slice(1) : rfPerPeriod;
  return {
    observations: r.length,
    cumulative: values.length >= 2 ? fin(cumulativeReturn(values)) : null,
    annualized: ok ? fin(annualizedReturn(values, periodsPerYear)) : null,
    volatility: ok ? fin(annualizedVolatility(r, periodsPerYear)) : null,
    sharpe: ok ? fin(sharpe(r, rf, periodsPerYear)) : null,
    sortino: ok ? fin(sortino(r, rf, periodsPerYear)) : null,
    maxDrawdown: values.length >= 2 ? fin(maxDrawdown(portfolio).mdd) : null,
    beta: b,
    correlation: c,
    excessVsBenchmark: excess,
    insufficient: !ok,
  };
}
