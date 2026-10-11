import { useEffect, useMemo, useState } from 'react';
import type { Nav } from '../App';
import type { AssetKind } from '../types';
import { Panel, DataNotice, InfoTip, Segmented, SourceLine, StatusBadge } from '../components/ui';
import AssetSearch from '../components/AssetSearch';
import PriceChart, { type Lower, type Overlays, type Range } from '../components/PriceChart';
import OrderTicket from '../components/OrderTicket';
import { UNIVERSE, findAsset, quoteFreshness, equityMarketStatus } from '../lib/market';
import { useHistory, useQuotes } from '../lib/hooks';
import { fmtDateTime, fmtPct, fmtPrice, fmtSigned, fmtUsdCompact, fmtCompact, toneClass } from '../lib/format';

const RANGES: Range[] = ['1D', '1W', '1M', '3M', '1Y', '5Y', '10Y', 'MAX'];

export default function Terminal({ nav, initialSymbol, initialKind }: { nav: Nav; initialSymbol?: string; initialKind?: AssetKind }) {
  const [sel, setSel] = useState<{ symbol: string; kind: AssetKind }>({ symbol: initialSymbol ?? 'AAPL', kind: initialKind ?? 'equity' });
  useEffect(() => { if (initialSymbol) setSel({ symbol: initialSymbol, kind: initialKind ?? 'equity' }); }, [initialSymbol, initialKind]);

  const [range, setRange] = useState<Range>('1Y');
  const [mode, setMode] = useState<'candle' | 'line'>('candle');
  const [adjusted, setAdjusted] = useState(false);
  const [overlays, setOverlays] = useState<Overlays>({ sma20: false, sma50: true, sma200: true, bb: false });
  const [lower, setLower] = useState<Lower>('rsi');

  const watch = useMemo(() => {
    const base = UNIVERSE.filter((a) => a.group !== 'Reference');
    return base.some((a) => a.symbol === sel.symbol && a.kind === sel.kind) ? base : [...base, findAsset(sel.symbol, sel.kind) ?? { symbol: sel.symbol, kind: sel.kind, name: sel.symbol, group: 'Stocks' as const }];
  }, [sel]);
  const { quotes } = useQuotes(watch, 60_000);
  const hist = useHistory(sel.symbol, sel.kind);
  const qe = quotes[`${sel.kind}:${sel.symbol}`];
  const quote = qe?.quote ?? null;
  const asset = findAsset(sel.symbol, sel.kind);
  const fresh = quote ? quoteFreshness(quote) : null;
  const status = equityMarketStatus();

  const select = (symbol: string, kind: AssetKind) => { setSel({ symbol, kind }); window.history.replaceState(null, '', `#/terminal?symbol=${symbol}&kind=${kind}`); };

  return (
    <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_320px] lg:grid-cols-[230px_minmax(0,1fr)]">
      {/* LEFT — asset explorer */}
      <Panel title="Assets" bodyClass="p-0" className="self-start">
        <div className="p-3"><AssetSearch onSelect={select} /></div>
        <div className="max-h-[70vh] overflow-y-auto pb-2">
          {(['Stocks', 'ETFs', 'Crypto'] as const).map((g) => (
            <div key={g}>
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium muted">{g}</p>
              {watch.filter((a) => (g === 'Crypto' ? a.kind === 'crypto' : a.group === g || (g === 'Stocks' && a.kind === 'equity' && !['Stocks', 'ETFs'].includes(a.group)))).map((a) => {
                const q = quotes[`${a.kind}:${a.symbol}`]?.quote;
                const active = a.symbol === sel.symbol && a.kind === sel.kind;
                return (
                  <button key={`${a.kind}:${a.symbol}`} onClick={() => select(a.symbol, a.kind)}
                    className={`num flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] ${active ? 'bg-accent/10 text-accent' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                    <span className="font-medium">{a.symbol}</span>
                    <span className="flex gap-2">
                      <span>{q ? fmtPrice(q.price) : '—'}</span>
                      <span className={`w-14 text-right ${toneClass(q?.changePct)}`}>{q ? fmtPct(q.changePct) : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>

      {/* CENTER — chart */}
      <div className="min-w-0 space-y-4">
        <section className="panel p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{sel.symbol}</h1>
                <span className="muted">{hist.data?.name && hist.data.kind === 'equity' ? hist.data.name : asset?.name}</span>
              </div>
              <div className="num mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{quote ? fmtPrice(quote.price) : hist.data?.bars.at(-1) ? fmtPrice(hist.data.bars.at(-1)!.close) : '—'}</span>
                {quote && <span className={`text-sm font-medium ${toneClass(quote.change)}`}>{fmtSigned(quote.change)} ({fmtPct(quote.changePct)}){sel.kind === 'crypto' ? ' 24h' : ''}</span>}
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="flex flex-wrap justify-end gap-1.5">
                {qe ? <StatusBadge state={qe.state} label={fresh?.label} title={qe.message ?? undefined} /> : <StatusBadge state="loading" />}
                {sel.kind === 'equity' && <StatusBadge state={status.open ? 'connected' : 'eod'} label={`Market ${status.label.toLowerCase()}`} title={status.detail} />}
                {sel.kind === 'crypto' && <StatusBadge state="connected" label="Trades 24/7" />}
              </div>
              <div className="num mt-1.5 space-x-3 muted">
                <span>Vol {fmtCompact(quote?.volume)}</span>
                <span>Mkt cap {fmtUsdCompact(quote?.marketCap)}</span>
              </div>
              {quote && <div className="mt-0.5 muted">{quote.provider}, as of {fmtDateTime(quote.asOf)}</div>}
            </div>
          </div>
          {qe?.message && !quote && <div className="mt-3"><DataNotice state={qe.state} message={qe.message} onOpenSettings={nav.openSettings} /></div>}
        </section>

        <section className="panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700/60">
            <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r }))} />
            <Segmented value={mode} onChange={setMode} options={[{ value: 'candle', label: 'Candles' }, { value: 'line', label: 'Line' }]} />
            <Segmented value={adjusted ? 'adj' : 'raw'} onChange={(v) => setAdjusted(v === 'adj')} options={[{ value: 'raw', label: 'As traded' }, { value: 'adj', label: 'Adjusted' }]} />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {([['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['sma200', 'SMA 200'], ['bb', 'Bollinger']] as const).map(([k, l]) => (
                <label key={k} className="flex cursor-pointer items-center gap-1">
                  <input type="checkbox" className="accent-accent" checked={overlays[k]} onChange={(e) => setOverlays({ ...overlays, [k]: e.target.checked })} />{l}
                </label>
              ))}
              <InfoTip id="sma" /><InfoTip id="bollinger" />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Segmented value={lower} onChange={setLower} options={[{ value: 'none', label: 'None' }, { value: 'rsi', label: 'RSI' }, { value: 'macd', label: 'MACD' }, { value: 'vol', label: 'Volatility' }]} />
              {lower !== 'none' && <InfoTip id={lower} />}
            </div>
          </div>
          <div className="p-3">
            {hist.state === 'loading' || !hist.data ? (
              <DataNotice state={hist.state} message={hist.message} onOpenSettings={nav.openSettings} />
            ) : hist.data.bars.length ? (
              <PriceChart bars={hist.data.bars} mode={mode} adjusted={adjusted} overlays={overlays} lower={lower} range={range} />
            ) : (
              <DataNotice state="unavailable" message={hist.data.coverageNote} />
            )}
            {hist.data && (
              <>
                {range === '1D' && <SourceLine>Intraday bars are not available from the free data tiers used here; 1D shows the latest daily sessions.</SourceLine>}
                {hist.data.coverageNote && <SourceLine><b>Coverage:</b> {hist.data.coverageNote}</SourceLine>}
                {hist.data.gaps.length > 0 && <SourceLine><b>Gaps in data:</b> {hist.data.gaps.slice(0, 4).map((g) => `${g.from} → ${g.to}`).join('; ')}{hist.data.gaps.length > 4 ? ` and ${hist.data.gaps.length - 4} more` : ''}. No prices are interpolated.</SourceLine>}
                <SourceLine>
                  Daily bars {hist.data.firstDate} to {hist.data.lastDate}. {hist.data.attribution} {adjusted ? 'Adjusted prices include splits and dividends.' : 'As-traded prices; splits show as discontinuities.'} Retrieved {fmtDateTime(hist.data.fetchedAt)}.
                </SourceLine>
              </>
            )}
          </div>
        </section>
      </div>

      {/* RIGHT — order entry */}
      <Panel title={`Order entry: ${sel.symbol}`} className="self-start lg:col-span-2 xl:col-span-1">
        <OrderTicket key={`${sel.kind}:${sel.symbol}`} symbol={sel.symbol} kind={sel.kind} quote={quote} bars={hist.data?.bars ?? null} />
      </Panel>
    </div>
  );
}
