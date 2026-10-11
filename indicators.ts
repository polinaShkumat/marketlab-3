/**
 * Technical indicators. All functions return arrays aligned with the input,
 * with null where the indicator is undefined (insufficient look-back).
 * Each value at index t uses only inputs at indices ≤ t (no look-ahead).
 */
export type Series = Array<number | null>;

export function sma(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** EMA with α = 2/(n+1), seeded by the SMA of the first n observations. */
export function ema(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI with Wilder smoothing (Wilder, 1978). RSI = 100 − 100/(1+RS), RS = avgGain/avgLoss. */
export function rsi(closes: number[], n = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / n, avgL = loss / n;
  const val = () => (avgL === 0 ? (avgG === 0 ? 50 : 100) : 100 - 100 / (1 + avgG / avgL));
  out[n] = val();
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (n - 1) + Math.max(d, 0)) / n;
    avgL = (avgL * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = val();
  }
  return out;
}

/** MACD (Appel): EMA(fast) − EMA(slow); signal = EMA(signal) of MACD; histogram = MACD − signal. */
export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const line: Series = closes.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null));
  const firstIdx = line.findIndex((v) => v != null);
  const sig: Series = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const sub = ema(line.slice(firstIdx) as number[], signal);
    sub.forEach((v, j) => (sig[firstIdx + j] = v));
  }
  const hist: Series = line.map((v, i) => (v != null && sig[i] != null ? v - (sig[i] as number) : null));
  return { line, signal: sig, hist };
}

/** Bollinger Bands (Bollinger, 2001): SMA(n) ± k·σ, σ = population standard deviation over the window. */
export function bollinger(closes: number[], n = 20, k = 2) {
  const mid = sma(closes, n);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    const m = mid[i] as number;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (closes[j] - m) ** 2;
    const sd = Math.sqrt(s / n);
    upper[i] = m + k * sd;
    lower[i] = m - k * sd;
  }
  return { mid, upper, lower };
}

/** Rolling annualized volatility of log returns (sample stdev × √periodsPerYear), in percent. */
export function rollingVolatility(closes: number[], n = 21, periodsPerYear = 252): Series {
  const out: Series = new Array(closes.length).fill(null);
  const r: number[] = closes.map((c, i) => (i === 0 ? 0 : Math.log(c / closes[i - 1])));
  for (let i = n; i < closes.length; i++) {
    let mean = 0;
    for (let j = i - n + 1; j <= i; j++) mean += r[j];
    mean /= n;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (r[j] - mean) ** 2;
    out[i] = Math.sqrt(s / (n - 1)) * Math.sqrt(periodsPerYear) * 100;
  }
  return out;
}
