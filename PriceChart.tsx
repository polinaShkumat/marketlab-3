import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ColorType, CrosshairMode, LineStyle, createChart,
  type IChartApi, type ISeriesApi, type LogicalRange, type Time, type WhitespaceData,
} from 'lightweight-charts';
import type { Bar } from '../types';
import { bollinger, macd, rollingVolatility, rsi, sma, type Series } from '../lib/indicators';
import { useDarkMode } from '../lib/hooks';
import { fmtCompact, fmtPrice } from '../lib/format';

export type Range = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | '10Y' | 'MAX';
export type Lower = 'none' | 'rsi' | 'macd' | 'vol';
export interface Overlays { sma20: boolean; sma50: boolean; sma200: boolean; bb: boolean }

const RANGE_DAYS: Record<Range, number | null> = { '1D': 1, '1W': 7, '1M': 31, '3M': 92, '1Y': 366, '5Y': 1827, '10Y': 3653, MAX: null };

const C = { up: '#16A085', down: '#E05A5A', accent: '#4169E1', sma20: '#D19A2A', sma50: '#4169E1', sma200: '#7B61C9', band: '#94A3B8' };

function palette(dark: boolean) {
  return dark
    ? { bg: '#182235', text: '#A9B4C6', grid: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)' }
    : { bg: '#FFFFFF', text: '#475569', grid: 'rgba(15,23,42,0.06)', border: 'rgba(15,23,42,0.12)' };
}

const toLine = (bars: Bar[], s: Series) =>
  bars.map((b, i) => (s[i] == null ? ({ time: b.date } as WhitespaceData) : { time: b.date as Time, value: s[i] as number }));

function baseOptions(dark: boolean, showTime: boolean) {
  const p = palette(dark);
  return {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: p.bg }, textColor: p.text, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11 },
    grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
    rightPriceScale: { borderColor: p.border },
    timeScale: { borderColor: p.border, visible: showTime, rightOffset: 4, minBarSpacing: 0.05 },
    crosshair: { mode: CrosshairMode.Normal },
    handleScroll: true,
    handleScale: true,
  };
}

interface Legend { date: string; o: number; h: number; l: number; c: number; v: number; chg: number | null }

export default function PriceChart({ bars, mode, adjusted, overlays, lower, range, height = 420 }: {
  bars: Bar[]; mode: 'candle' | 'line'; adjusted: boolean; overlays: Overlays; lower: Lower; range: Range; height?: number;
}) {
  const dark = useDarkMode();
  const mainRef = useRef<HTMLDivElement>(null);
  const lowerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);

  const data = useMemo(() => {
    const px = bars.map((b) => adjusted
      ? { date: b.date, o: b.adjOpen, h: b.adjHigh, l: b.adjLow, c: b.adjClose, v: b.volume }
      : { date: b.date, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume });
    const closes = px.map((p) => p.c);
    return { px, closes };
  }, [bars, adjusted]);

  const isCrypto = useMemo(() => bars.some((b) => new Date(b.date + 'T00:00:00Z').getUTCDay() % 6 === 0), [bars]);

  useEffect(() => {
    if (!mainRef.current || !bars.length) return;
    const chart = createChart(mainRef.current, baseOptions(dark, lower === 'none'));
    chartRef.current = chart;
    const { px, closes } = data;
    let priceSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
    if (mode === 'candle') {
      const s = chart.addCandlestickSeries({ upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down });
      s.setData(px.map((p) => ({ time: p.date as Time, open: p.o, high: p.h, low: p.l, close: p.c })));
      priceSeries = s;
    } else {
      const s = chart.addLineSeries({ color: C.accent, lineWidth: 2 });
      s.setData(px.map((p) => ({ time: p.date as Time, value: p.c })));
      priceSeries = s;
    }
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(px.map((p, i) => ({ time: p.date as Time, value: p.v, color: i > 0 && p.c < px[i - 1].c ? 'rgba(224,90,90,0.35)' : 'rgba(22,160,133,0.35)' })));

    const addLine = (s: Series, color: string, style = LineStyle.Solid) => {
      const l = chart.addLineSeries({ color, lineWidth: 1, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      l.setData(toLine(bars, s));
    };
    if (overlays.sma20) addLine(sma(closes, 20), C.sma20);
    if (overlays.sma50) addLine(sma(closes, 50), C.sma50);
    if (overlays.sma200) addLine(sma(closes, 200), C.sma200);
    if (overlays.bb) {
      const b = bollinger(closes, 20, 2);
      addLine(b.upper, C.band, LineStyle.Dashed);
      addLine(b.lower, C.band, LineStyle.Dashed);
    }

    let lowerChart: IChartApi | null = null;
    if (lower !== 'none' && lowerRef.current) {
      lowerChart = createChart(lowerRef.current, baseOptions(dark, true));
      const add = (s: Series, color: string) => {
        const l = lowerChart!.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
        l.setData(toLine(bars, s));
        return l;
      };
      if (lower === 'rsi') {
        const l = add(rsi(closes, 14), C.sma200);
        l.createPriceLine({ price: 70, color: C.down, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: true, title: '' });
        l.createPriceLine({ price: 30, color: C.up, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: true, title: '' });
      } else if (lower === 'macd') {
        const m = macd(closes);
        const h = lowerChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
        h.setData(bars.map((b, i) => (m.hist[i] == null ? ({ time: b.date } as WhitespaceData) : { time: b.date as Time, value: m.hist[i] as number, color: (m.hist[i] as number) >= 0 ? 'rgba(22,160,133,0.5)' : 'rgba(224,90,90,0.5)' })));
        add(m.line, C.accent);
        add(m.signal, C.sma20);
      } else {
        add(rollingVolatility(closes, 21, isCrypto ? 365 : 252), C.sma20);
      }
      const a = chart.timeScale(), b2 = lowerChart.timeScale();
      let syncing = false;
      const sync = (to: typeof a) => (r: LogicalRange | null) => {
        if (!r || syncing) return;
        syncing = true; to.setVisibleLogicalRange(r); syncing = false;
      };
      a.subscribeVisibleLogicalRangeChange(sync(b2));
      b2.subscribeVisibleLogicalRangeChange(sync(a));
    }

    // Crosshair legend
    const byDate = new Map(px.map((p, i) => [p.date, i]));
    const setFor = (i: number) => {
      const p = px[i];
      setLegend({ date: p.date, o: p.o, h: p.h, l: p.l, c: p.c, v: p.v, chg: i > 0 ? p.c / px[i - 1].c - 1 : null });
    };
    setFor(px.length - 1);
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { setFor(px.length - 1); return; }
      const i = byDate.get(String(param.time));
      if (i != null) setFor(i);
    });

    // Initial visible range
    const days = RANGE_DAYS[range];
    const last = px[px.length - 1].date;
    if (days == null) chart.timeScale().fitContent();
    else {
      const fromDate = new Date(Date.parse(last + 'T00:00:00Z') - (range === '1D' ? 5 : days) * 86400_000).toISOString().slice(0, 10);
      const first = px.findIndex((p) => p.date >= fromDate);
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, first) - 0.5, to: px.length - 0.5 + 3 });
    }
    void priceSeries;

    return () => {
      chart.remove();
      lowerChart?.remove();
      chartRef.current = null;
    };
  }, [bars, data, mode, overlays.sma20, overlays.sma50, overlays.sma200, overlays.bb, lower, range, dark, isCrypto]);

  return (
    <div>
      {legend && (
        <div className="num flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 pb-2 text-xs">
          <span className="font-medium text-slate-900 dark:text-white">{legend.date}</span>
          <span><span className="muted">O</span> {fmtPrice(legend.o)}</span>
          <span><span className="muted">H</span> {fmtPrice(legend.h)}</span>
          <span><span className="muted">L</span> {fmtPrice(legend.l)}</span>
          <span><span className="muted">C</span> {fmtPrice(legend.c)}</span>
          {legend.chg != null && <span className={legend.chg >= 0 ? 'text-gain' : 'text-loss'}>{legend.chg >= 0 ? '+' : ''}{(legend.chg * 100).toFixed(2)}%</span>}
          <span><span className="muted">Vol</span> {fmtCompact(legend.v)}</span>
          {overlays.sma20 && <Key color={C.sma20} label="SMA 20" />}
          {overlays.sma50 && <Key color={C.sma50} label="SMA 50" />}
          {overlays.sma200 && <Key color={C.sma200} label="SMA 200" />}
          {overlays.bb && <Key color={C.band} label="Bollinger 20, 2σ" />}
        </div>
      )}
      <div ref={mainRef} style={{ height }} className="w-full" />
      {lower !== 'none' && <div ref={lowerRef} style={{ height: 130 }} className="mt-1 w-full border-t border-slate-100 dark:border-slate-700/60" />}
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1 muted"><span className="inline-block h-0.5 w-3" style={{ background: color }} />{label}</span>;
}
