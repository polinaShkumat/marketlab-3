import type { Bar } from '../src/types';

/** Synthetic bars for unit tests ONLY (never used by the application). */
export function bar(date: string, close: number, o: Partial<Bar> = {}): Bar {
  return {
    date, open: close, high: close, low: close, close, volume: 1000,
    adjOpen: close, adjHigh: close, adjLow: close, adjClose: close, dividend: 0, split: 1, ...o,
  };
}

export function series(start: string, closes: number[]): Bar[] {
  const d0 = Date.parse(start + 'T00:00:00Z');
  return closes.map((c, i) => bar(new Date(d0 + i * 86400000).toISOString().slice(0, 10), c));
}
