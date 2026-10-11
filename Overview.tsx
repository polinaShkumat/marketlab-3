import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowRight, History as HistoryIcon } from 'lucide-react';
import type { Nav } from '../App';
import { Panel, DataNotice, InfoTip, Stat, StatusBadge, SourceLine } from '../components/ui';
import { SERIES_COLORS } from '../components/Charts';
import { CORE_CRYPTO, CORE_EQUITIES, UNIVERSE, quoteFreshness } from '../lib/market';
import { marksFrom, useFred, useHistory, useQuotes, type QuoteEntry } from '../lib/hooks';
import { useAccount } from '../store';
import { valuate } from '../lib/portfolio';
import { rollingVolatility } from '../lib/indicators';
import { fmtDate, fmtDateTime, fmtPct, fmtPrice, fmtQty, fmtSigned, fmtUsd, toneClass } from '../lib/format';
import type { DataState, FredSeries } from '../types';

export default function Overview({ nav }: { nav: Nav }) {
  const { account } = useAccount();
  const items = useMemo(() => [
    ...CORE_EQUITIES.map((s) => ({ symbol: s, kind: 'equity' as const })),
    ...CORE_CRYPTO.map((s) => ({ symbol: s, kind: 'crypto' as const })),
    { symbol: 'GLD', kind: 'equity' as const },
  ], []);
  const held = useMemo(() => Object.values(account.positions).filter((p) => !items.some((i) => i.symbol === p.symbol && i.kind === p.kind)).map((p) => ({ symbol: p.symbol, kind: p.kind })), [account.positions, items]);
  const { quotes, lastUpdate } = useQuotes(useMemo(() => [...items, ...held], [items, held]), 60_000);
  const priceMap = useMemo(() => marksFrom(quotes), [quotes]);
  const val = valuate(account, priceMap);

  const ranked = useMemo(() => Object.values(quotes).map((q) => q.quote).filter((q): q is NonNullable<typeof q> => !!q && q.changePct != null).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)), [quotes]);
  const pie = [...val.rows.filter((r) => r.value).map((r) => ({ name: r.position.symbol, value: r.value as number })), { name: 'Cash', value: val.cash }];

  return (
    <div className="space-y-4">
      <MarketStrip quotes={quotes} onOpenSettings={nav.openSettings} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Virtual account" actions={<button className="btn-ghost text-xs" onClick={() => nav.go('portfolio')}>Open portfolio <ArrowRight className="h-3.5 w-3.5" /></button>} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Portfolio equity" value={fmtUsd(val.total)} sub={`Started with ${fmtUsd(account.startingCapital)}`} />
            <Stat label="Today's change" value={val.dayChange == null ? '—' : fmtSigned(val.dayChange, fmtUsd)} tone={toneClass(val.dayChange)} sub={val.dayChange == null ? 'Waiting for quotes' : 'vs. previous close / 24h'} />
            <Stat label="Available cash" value={fmtUsd(val.cash)} />
            <Stat label="Total return" value={fmtPct(val.totalReturn * 100)} tone={toneClass(val.totalReturn)} sub={`${fmtSigned(val.total - account.startingCapital, fmtUsd)}`} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="h-40">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} stroke="none" isAnimationActive={false}>
                    {pie.map((p, i) => <Cell key={p.name} fill={p.name === 'Cash' ? '#CBD5E1' : SERIES_COLORS[i % SERIES_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtUsd(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium muted">Recent simulated transactions</p>
              {account.transactions.length === 0 ? (
                <p className="text-sm muted">No trades yet. Open the <button className="text-accent hover:underline" onClick={() => nav.go('terminal')}>Trading Terminal</button> to place your first order with virtual funds.</p>
              ) : (
                <table className="table">
                  <tbody>
                    {account.transactions.slice(-5).reverse().map((t) => (
                      <tr key={t.id}><td className="capitalize">{t.type}</td><td className="font-medium">{t.symbol}</td><td>{fmtQty(t.quantity)}</td><td>{t.type === 'split' ? `${t.price}:1` : fmtPrice(t.price)}</td><td className="muted">{fmtDate(t.sessionDate)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </Panel>

        <VolatilityPanel />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Watchlist" className="lg:col-span-2" bodyClass="p-0" actions={<span className="text-[11px] muted">Updated {fmtDateTime(lastUpdate)}</span>}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Symbol</th><th>Name</th><th className="text-right">Price</th><th className="text-right">Change</th><th className="text-right">%</th><th>Data</th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const e = quotes[`${i.kind}:${i.symbol}`];
                  const a = UNIVERSE.find((u) => u.symbol === i.symbol && u.kind === i.kind)!;
                  return (
                    <tr key={`${i.kind}:${i.symbol}`} className="cursor-pointer" onClick={() => nav.openAsset(i.symbol, i.kind)}>
                      <td className="font-semibold">{i.symbol}</td>
                      <td className="max-w-[220px] truncate muted">{a.name}</td>
                      <td className="text-right">{fmtPrice(e?.quote?.price)}</td>
                      <td className={`text-right ${toneClass(e?.quote?.change)}`}>{fmtSigned(e?.quote?.change)}</td>
                      <td className={`text-right ${toneClass(e?.quote?.changePct)}`}>{fmtPct(e?.quote?.changePct)}</td>
                      <td><EntryBadge e={e} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3"><SourceLine>Equity change is versus the previous close; crypto change is versus the price 24 hours earlier on Coinbase.</SourceLine></div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Biggest gainers and losers">
            {ranked.length < 2 ? <p className="text-sm muted">Waiting for at least two quotes.</p> : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[ranked.slice(0, 4), ranked.slice(-4).reverse()].map((list, j) => (
                  <div key={j}>
                    <p className="mb-1 text-xs muted">{j === 0 ? 'Gainers' : 'Losers'}</p>
                    {list.map((q) => (
                      <button key={q.symbol} onClick={() => nav.openAsset(q.symbol, q.kind)} className="num flex w-full justify-between py-0.5 hover:text-accent">
                        <span className="font-medium">{q.symbol}</span><span className={toneClass(q.changePct)}>{fmtPct(q.changePct)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Market Time Machine">
            <p className="text-sm muted">Start on any date since 2007 with $100,000, trade at historical prices without seeing the future, and compare yourself with the S&P 500.</p>
            <button className="btn-primary mt-3" onClick={() => nav.go('history')}><HistoryIcon className="h-4 w-4" /> Start a historical simulation</button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function EntryBadge({ e }: { e: QuoteEntry | undefined }) {
  if (!e) return <StatusBadge state="loading" />;
  if (!e.quote) return <StatusBadge state={e.state} title={e.message ?? undefined} />;
  return <StatusBadge state={e.state} label={quoteFreshness(e.quote).label} title={`${e.quote.provider}, ${fmtDateTime(e.quote.asOf)}`} />;
}

function lastTwo(d: FredSeries | null) {
  const p = d?.points;
  if (!p || !p.length) return null;
  const last = p[p.length - 1], prev = p.length > 1 ? p[p.length - 2] : null;
  return { last, prev };
}

function MarketStrip({ quotes, onOpenSettings }: { quotes: Record<string, QuoteEntry>; onOpenSettings: () => void }) {
  const sp = useFred('SP500'), nd = useFred('NASDAQCOM'), dj = useFred('DJIA'), t10 = useFred('DGS10'), t2 = useFred('DGS2');
  const fredTiles: Array<{ label: string; l: typeof sp; rate?: boolean }> = [
    { label: 'S&P 500', l: sp }, { label: 'Nasdaq Composite', l: nd }, { label: 'Dow Jones', l: dj }, { label: '10Y Treasury', l: t10, rate: true }, { label: '2Y Treasury', l: t2, rate: true },
  ];
  const quoteTiles = [
    { label: 'Bitcoin', k: 'crypto:BTC' }, { label: 'Ethereum', k: 'crypto:ETH' }, { label: 'Gold (GLD ETF)', k: 'equity:GLD' },
  ];
  const configRequired = fredTiles.some((t) => t.l.state === 'config-required');
  return (
    <section className="panel">
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 xl:grid-cols-8 xl:divide-y-0 dark:divide-slate-700/60">
        {fredTiles.map(({ label, l, rate }) => {
          const lt = lastTwo(l.data);
          const chg = lt?.prev ? (rate ? lt.last.value - lt.prev.value : (lt.last.value / lt.prev.value - 1) * 100) : null;
          return (
            <Tile key={label} label={label} state={l.state} message={l.message}
              value={lt ? (rate ? `${lt.last.value.toFixed(2)}%` : lt.last.value.toLocaleString('en-US', { maximumFractionDigits: 2 })) : null}
              change={chg == null ? null : rate ? `${chg > 0 ? '+' : ''}${(chg * 100).toFixed(0)} bp` : fmtPct(chg)} tone={toneClass(chg)}
              foot={lt ? `FRED close, ${fmtDate(lt.last.date)}` : undefined} />
          );
        })}
        {quoteTiles.map(({ label, k }) => {
          const e = quotes[k];
          return (
            <Tile key={label} label={label} state={e?.quote ? e.state : e?.state ?? 'loading'} message={e?.message ?? null}
              value={e?.quote ? fmtPrice(e.quote.price) : null} change={e?.quote ? fmtPct(e.quote.changePct) + (k.startsWith('crypto') ? ' 24h' : '') : null}
              tone={toneClass(e?.quote?.changePct)} foot={e?.quote ? `${e.quote.provider}, ${quoteFreshness(e.quote).label.toLowerCase()}` : undefined} />
          );
        })}
      </div>
      {configRequired && <div className="border-t border-slate-100 p-3 dark:border-slate-700/60"><DataNotice state="config-required" message="Index levels and Treasury yields come from FRED, which needs a free API key on the server." onOpenSettings={onOpenSettings} /></div>}
    </section>
  );
}

function Tile({ label, value, change, tone, foot, state, message }: { label: string; value: string | null; change: string | null; tone: string; foot?: string; state: DataState; message: string | null }) {
  return (
    <div className="min-w-0 px-3 py-2.5" title={message ?? undefined}>
      <p className="truncate text-xs muted">{label}</p>
      {value ? (
        <>
          <p className="num text-[15px] font-semibold text-slate-900 dark:text-white">{value}</p>
          <p className={`num text-xs ${tone}`}>{change ?? '—'}</p>
          {foot && <p className="truncate text-[10px] muted">{foot}</p>}
        </>
      ) : (
        <div className="mt-1"><StatusBadge state={state === 'eod' ? 'unavailable' : state} /></div>
      )}
    </div>
  );
}

function VolatilityPanel() {
  const spy = useHistory('SPY', 'equity');
  const vix = useFred('VIXCLS');
  const realized = useMemo(() => {
    const bars = spy.data?.bars;
    if (!bars || bars.length < 260) return null;
    const v = rollingVolatility(bars.map((b) => b.adjClose), 21);
    const last = v[v.length - 1] as number;
    const year = v.slice(-252).filter((x): x is number => x != null).sort((a, b) => a - b);
    const pct = year.filter((x) => x <= last).length / year.length;
    return { last, pct, date: bars[bars.length - 1].date };
  }, [spy.data]);
  const vixLast = vix.data?.points.at(-1) ?? null;
  return (
    <Panel title={<span className="flex items-center gap-1">Market volatility <InfoTip id="vol" /></span>}>
      {!realized && !vixLast ? (
        <DataNotice state={spy.state === 'loading' ? 'loading' : spy.state} message={spy.message ?? vix.message} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="S&P 500 realized (21d)" value={realized ? `${realized.last.toFixed(1)}%` : '—'} sub={realized ? `SPY, to ${fmtDate(realized.date)}` : spy.message ?? ''} />
            <Stat label="VIX (implied, 30d)" value={vixLast ? vixLast.value.toFixed(1) : '—'} sub={vixLast ? `FRED, ${fmtDate(vixLast.date)}` : vix.message ?? ''} />
          </div>
          {realized && (
            <p className="text-sm leading-relaxed">
              Realized volatility is in the {Math.round(realized.pct * 100)}th percentile of the past year.
              {vixLast && <> The VIX {vixLast.value > realized.last ? 'is above' : 'is below'} realized volatility by {Math.abs(vixLast.value - realized.last).toFixed(1)} points. Implied volatility usually exceeds realized volatility on average; the gap is called the variance risk premium, the compensation option sellers earn for bearing crash risk.</>}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
