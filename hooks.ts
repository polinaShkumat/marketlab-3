import { useEffect, useRef, useState } from 'react';
import type { AssetKind, DataState, FredSeries, History, Quote } from '../types';
import { describeFailure, getFred, getHistory, getQuotes } from './api';
import { quoteFreshness, sessionDateOf } from './market';
import type { MarkPrice } from './portfolio';

export interface Loadable<T> { state: DataState; data: T | null; message: string | null }

export function useHistory(symbol: string | null, kind: AssetKind): Loadable<History> {
  const [s, set] = useState<Loadable<History>>({ state: 'loading', data: null, message: null });
  useEffect(() => {
    if (!symbol) return;
    let live = true;
    set({ state: 'loading', data: null, message: null });
    getHistory(symbol, kind)
      .then((h) => live && set({ state: h.bars.length ? 'eod' : 'unavailable', data: h, message: h.coverageNote }))
      .catch((e) => { if (live) { const f = describeFailure(e); set({ state: f.state, data: null, message: f.message }); } });
    return () => { live = false; };
  }, [symbol, kind]);
  return s;
}

/** Load several histories; resolves each independently so one failure does not blank the rest. */
export function useHistories(items: Array<{ symbol: string; kind: AssetKind }>) {
  const key = items.map((i) => `${i.kind}:${i.symbol}`).sort().join('|');
  const [map, setMap] = useState<Record<string, Loadable<History>>>({});
  useEffect(() => {
    let live = true;
    const init: Record<string, Loadable<History>> = {};
    items.forEach((i) => (init[`${i.kind}:${i.symbol}`] = { state: 'loading', data: null, message: null }));
    setMap(init);
    items.forEach((i) => {
      const k = `${i.kind}:${i.symbol}`;
      getHistory(i.symbol, i.kind)
        .then((h) => live && setMap((m) => ({ ...m, [k]: { state: h.bars.length ? 'eod' : 'unavailable', data: h, message: h.coverageNote } })))
        .catch((e) => { if (live) { const f = describeFailure(e); setMap((m) => ({ ...m, [k]: { state: f.state, data: null, message: f.message } })); } });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

export interface QuoteEntry { quote: Quote | null; state: DataState; message: string | null }

/** Poll quotes for equities and crypto, refreshing every `intervalMs`. */
export function useQuotes(items: Array<{ symbol: string; kind: AssetKind }>, intervalMs = 60_000) {
  const key = items.map((i) => `${i.kind}:${i.symbol}`).sort().join('|');
  const [map, setMap] = useState<Record<string, QuoteEntry>>({});
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const groups: Record<AssetKind, string[]> = { equity: [], crypto: [] };
      items.forEach((i) => groups[i.kind].push(i.symbol));
      for (const kind of ['equity', 'crypto'] as AssetKind[]) {
        if (!groups[kind].length) continue;
        try {
          const res = await getQuotes(groups[kind], kind, intervalMs / 2);
          if (!live) return;
          setMap((m) => {
            const next = { ...m };
            for (const r of res) {
              next[`${kind}:${r.symbol}`] = r.quote
                ? { quote: r.quote, state: quoteFreshness(r.quote).state, message: null }
                : { quote: null, state: r.error?.code === 'RATE_LIMITED' ? 'rate-limited' : r.error?.code === 'CONFIG_REQUIRED' ? 'config-required' : 'unavailable', message: r.error?.message ?? null };
            }
            return next;
          });
          setLastUpdate(new Date().toISOString());
        } catch (e) {
          if (!live) return;
          const f = describeFailure(e);
          setMap((m) => {
            const next = { ...m };
            for (const s of groups[kind]) {
              const k = `${kind}:${s}`;
              // keep the last good quote but mark the failure
              next[k] = m[k]?.quote ? { ...m[k], message: f.message } : { quote: null, state: f.state, message: f.message };
            }
            return next;
          });
        }
      }
    };
    load();
    timer.current = window.setInterval(load, intervalMs);
    return () => { live = false; if (timer.current) window.clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs]);
  return { quotes: map, lastUpdate };
}

export function useFred(series: string | null, start = '2007-01-01'): Loadable<FredSeries> {
  const [s, set] = useState<Loadable<FredSeries>>({ state: 'loading', data: null, message: null });
  useEffect(() => {
    if (!series) return;
    let live = true;
    set({ state: 'loading', data: null, message: null });
    getFred(series, start)
      .then((d) => live && set({ state: d.points.length ? 'eod' : 'unavailable', data: d, message: null }))
      .catch((e) => { if (live) { const f = describeFailure(e); set({ state: f.state, data: null, message: f.message }); } });
    return () => { live = false; };
  }, [series, start]);
  return s;
}

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Convert quote entries into marks for valuation (price, reference and session date). */
export function marksFrom(quotes: Record<string, QuoteEntry>): Record<string, MarkPrice | undefined> {
  return Object.fromEntries(Object.entries(quotes).map(([k, v]) => [k, v.quote ? { price: v.quote.price, reference: v.quote.reference, sessionDate: sessionDateOf(v.quote.kind, v.quote.asOf) } : undefined]));
}
