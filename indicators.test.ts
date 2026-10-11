import { describe, expect, it } from 'vitest';
import { bollinger, ema, macd, rollingVolatility, rsi, sma } from '../src/lib/indicators';

describe('indicators', () => {
  it('SMA', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it('EMA seeded with SMA, alpha = 2/(n+1)', () => {
    const e = ema([1, 2, 3, 4], 3);
    expect(e[2]).toBeCloseTo(2);
    expect(e[3]).toBeCloseTo(4 * 0.5 + 2 * 0.5);
  });
  it('RSI is 100 for monotone gains, 0 for monotone losses', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const dn = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(rsi(up, 14)[29]).toBe(100);
    expect(rsi(dn, 14)[29]).toBe(0);
    expect(rsi(up, 14)[13]).toBeNull();
  });
  it('RSI matches a hand computation with Wilder smoothing', () => {
    const c = [10, 11, 10, 12, 11, 13];
    // n=2: first avg gain=(1+0)/2=0.5, loss=(0+1)/2=0.5 → RSI 50 at i=2
    const r = rsi(c, 2);
    expect(r[2]).toBeCloseTo(50);
    // i=3: d=+2 → g=(0.5+2)/2=1.25, l=(0.5+0)/2=0.25 → RS=5 → 83.333
    expect(r[3]).toBeCloseTo(100 - 100 / 6);
  });
  it('MACD histogram = line − signal', () => {
    const c = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const m = macd(c);
    const i = 70;
    expect(m.hist[i]).toBeCloseTo((m.line[i] as number) - (m.signal[i] as number));
    expect(m.line[24]).toBeNull();
    expect(m.signal[25 + 7]).toBeNull();
    expect(m.signal[25 + 8]).not.toBeNull();
  });
  it('Bollinger bands are symmetric around the SMA with population sd', () => {
    const b = bollinger([1, 2, 3, 4, 5], 5, 2);
    const sd = Math.sqrt(2); // population variance of 1..5 = 2
    expect(b.mid[4]).toBeCloseTo(3);
    expect(b.upper[4]).toBeCloseTo(3 + 2 * sd);
    expect(b.lower[4]).toBeCloseTo(3 - 2 * sd);
  });
  it('rolling volatility is zero for constant growth', () => {
    const c = Array.from({ length: 40 }, (_, i) => 100 * 1.01 ** i);
    expect(rollingVolatility(c, 21)[39]).toBeCloseTo(0, 8);
  });
});
