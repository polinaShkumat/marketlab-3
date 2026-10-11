import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Nav } from '../App';
import type { AssetKind } from '../types';
import { Panel, DataNotice, InfoTip, Segmented, SourceLine, Stat } from '../components/ui';
import { CorrelationMatrix, DrawdownChart, TimeLines } from '../components/Charts';
import { useAccount } from '../store';
import { equityHistory, transactionsCsv, valuate } from '../lib/portfolio';
import { marksFrom, useFred, useHistories, useQuotes } from '../lib/hooks';
import { MIN_OBS, alignOnDates, computeMetrics, correlation, drawdownSeries, returns, riskFreePerPeriod } from '../lib/metrics';
import { fmtDate, fmtDateTime, fmtFrac, fmtPct, fmtPrice, fmtQty, fmtSigned, fmtUsd, toneClass } from '../lib/format';

export default function PortfolioPage({ nav }: { nav: Nav }) {
  const { account, cancel } = useAccount();
  const [bench, setBench] = useState<'SPY' | 'QQQ' | 'IWM' | 'VOO'>('SPY');
  const [tab, setTab] = useState<'orders' | 'transactions' | 'audit'>('transactions');

  const traded = useMemo(() => {
    const m = new Map<string, { symbol: string; kind: AssetKind }>();
    account.transactions.forEach((t) => m.set(`${t.kind}:${t.symbol}`, { symbol: t.symbol, kind: t.kind }));
    Object.values(account.positions).forEach((p) => m.set(`${p.kind}:${p.symbol}`, p));
    return [...m.values()];
  }, [account]);
  const { quotes } = useQuotes(traded, 60_000);
  const priceMap = marksFrom(quotes);
  const val = valuate(account, priceMap);

  const hist = useHistories([...traded, { symbol: bench, kind: 'equity' }]);
  const rf = useFred('DTB3');

  const analytics = useMemo(() => {
    const b = hist[`equity:${bench}`]?.data;
    if (!b || !account.transactions.length) return null;
    const closes: Record<string, Map<string, number>> = {};
    for (const t of traded) {
      const h = hist[`${t.kind}:${t.symbol}`]?.data;
      if (h) closes[`${t.kind}:${t.symbol}`] = new Map(h.bars.map((x) => [x.date, x.close]));
    }
    const calendar = b.bars.map((x) => x.date);
    const eq = equityHistory(account, calendar, closes);
    if (eq.length < 2) return { eq, metrics: null, rfNote: '', bench: [] as Array<{ date: string; value: number }> };

    const benchSeries = b.bars.filter((x) => x.date >= eq[0].date).map((x) => ({ date: x.date, value: x.adjClose }));
    const rfPts = rf.data?.points ?? [];
    const rfArr = riskFreePerPeriod(eq.map((e) => e.date), rfPts);
    const metrics = computeMetrics(eq, benchSeries, rfArr);
    return { eq, metrics, bench: benchSeries, rfNote: rfPts.length ? `3-month T-bill (FRED DTB3), latest ${rfPts.at(-1)!.value}% on ${rfPts.at(-1)!.date}` : 'risk-free rate unavailable (FRED key missing); 0% used' };
  }, [hist, account, traded, bench, rf.data]);

  const corr = useMemo(() => {
    const syms = Object.values(account.positions);
    if (syms.length < 2) return null;
    const s = syms.map((p) => (hist[`${p.kind}:${p.symbol}`]?.data?.bars ?? []).slice(-260).map((b) => ({ date: b.date, value: b.adjClose })));
    if (s.some((x) => x.length < MIN_OBS)) return null;
    const { values, dates } = alignOnDates(s);
    if (dates.length < MIN_OBS + 1) return null;
    const r = values.map(returns);
    return { labels: syms.map((p) => p.symbol), m: r.map((a) => r.map((b) => correlation(a, b))), n: dates.length - 1 };
  }, [account.positions, hist]);

  const weights = val.rows.map((r) => r.weight ?? 0);
  const maxW = Math.max(0, ...weights);
  const invested = weights.reduce((s, w) => s + w, 0);
  const hhi = invested > 0 ? weights.reduce((s, w) => s + (w / invested) ** 2, 0) : 0;

  const exportCsv = () => {
    const blob = new Blob([transactionsCsv(account)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `marketlab-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chartData = useMemo(() => {
    if (!analytics?.eq.length || !analytics.bench.length) return [];
    const bm = new Map(analytics.bench.map((p) => [p.date, p.value]));
    const b0 = bm.get(analytics.eq[0].date);
    return analytics.eq.map((e) => ({ date: e.date, Portfolio: e.value, [bench]: b0 && bm.get(e.date) ? (bm.get(e.date)! / b0) * account.startingCapital : null }));
  }, [analytics, bench, account.startingCapital]);

  const m = analytics?.metrics;
  return (
    <div className="space-y-4">
      <section className="panel grid grid-cols-2 gap-4 p-4 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Starting capital" value={fmtUsd(account.startingCapital)} />
        <Stat label="Available cash" value={fmtUsd(val.cash)} />
        <Stat label="Invested capital" value={fmtUsd(val.invested)} sub="Cost basis of open positions" />
        <Stat label="Total value" value={fmtUsd(val.total)} />
        <Stat label="Unrealized P&L" value={fmtSigned(val.unrealized, fmtUsd)} tone={toneClass(val.unrealized)} />
        <Stat label="Realized P&L" value={fmtSigned(val.realized, fmtUsd)} tone={toneClass(val.realized)} sub={val.dividends ? `+ ${fmtUsd(val.dividends)} dividends` : undefined} />
        <Stat label="Daily return" value={val.dayChange == null ? '—' : fmtSigned(val.dayChange, fmtUsd)} tone={toneClass(val.dayChange)} sub={val.dayChange == null ? 'Quotes pending' : fmtPct((val.dayChange / (val.total - val.dayChange)) * 100)} />
        <Stat label="Total return" value={fmtPct(val.totalReturn * 100)} tone={toneClass(val.totalReturn)} />
      </section>

      <Panel title="Positions" bodyClass="p-0">
        {val.rows.length === 0 ? (
          <div className="p-4 text-sm muted">No open positions. <button className="text-accent hover:underline" onClick={() => nav.go('terminal')}>Go to the Trading Terminal</button> to buy your first asset.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Asset</th><th className="text-right">Quantity</th><th className="text-right">Avg cost</th><th className="text-right">Last</th><th className="text-right">Value</th><th className="text-right">Unrealized</th><th className="text-right">Return</th><th className="text-right">Today</th><th className="text-right">Weight</th></tr></thead>
              <tbody>
                {val.rows.map((r) => (
                  <tr key={`${r.position.kind}:${r.position.symbol}`} className="cursor-pointer" onClick={() => nav.openAsset(r.position.symbol, r.position.kind)}>
                    <td className="font-semibold">{r.position.symbol}</td>
                    <td className="text-right">{fmtQty(r.position.quantity)}</td>
                    <td className="text-right">{fmtPrice(r.position.costBasis / r.position.quantity)}</td>
                    <td className="text-right">{fmtPrice(r.price)}</td>
                    <td className="text-right">{fmtUsd(r.value)}</td>
                    <td className={`text-right ${toneClass(r.unrealized)}`}>{fmtSigned(r.unrealized, fmtUsd)}</td>
                    <td className={`text-right ${toneClass(r.unrealized)}`}>{r.unrealized != null ? fmtFrac(r.unrealized / r.position.costBasis) : '—'}</td>
                    <td className={`text-right ${toneClass(r.dayChange)}`}>{fmtSigned(r.dayChange, fmtUsd)}</td>
                    <td className="text-right">{fmtFrac(r.weight, 1, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 pb-3 pt-2 text-xs muted">
          <span>Largest position {fmtFrac(maxW, 1, false)}</span>
          <span>Effective number of positions {hhi > 0 ? (1 / hhi).toFixed(2) : '—'} (1/Σw² over invested weights)</span>
        </div>
      </Panel>

      <Panel title="Portfolio analytics" actions={<span className="flex items-center gap-2 text-xs"><span className="muted">Benchmark</span><Segmented value={bench} onChange={setBench} options={['SPY', 'QQQ', 'IWM', 'VOO'].map((s) => ({ value: s as 'SPY', label: s }))} /></span>}>
        {!account.transactions.length ? (
          <p className="text-sm muted">Analytics appear after your first trade. For a long-horizon example, run a strategy in the Research Lab backtester or a historical simulation.</p>
        ) : !analytics ? (
          <DataNotice state={hist[`equity:${bench}`]?.state ?? 'loading'} message={hist[`equity:${bench}`]?.message ?? null} onOpenSettings={nav.openSettings} />
        ) : (
          <div className="space-y-4">
            {m && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <Stat label="Cumulative return" value={fmtFrac(m.cumulative)} tone={toneClass(m.cumulative)} />
                <Stat label="Annualized return" info="cagr" value={fmtFrac(m.annualized)} />
                <Stat label="Volatility" info="vol" value={fmtFrac(m.volatility, 2, false)} />
                <Stat label="Sharpe ratio" info="sharpe" value={m.sharpe?.toFixed(2) ?? '—'} />
                <Stat label="Sortino ratio" info="sortino" value={m.sortino?.toFixed(2) ?? '—'} />
                <Stat label="Maximum drawdown" info="mdd" value={fmtFrac(m.maxDrawdown)} tone="text-loss" />
                <Stat label={`Beta vs ${bench}`} info="beta" value={m.beta?.toFixed(2) ?? '—'} />
                <Stat label={`Correlation vs ${bench}`} info="correlation" value={m.correlation?.toFixed(2) ?? '—'} />
                <Stat label={`Excess vs ${bench}`} value={fmtFrac(m.excessVsBenchmark)} tone={toneClass(m.excessVsBenchmark)} />
                <Stat label="Daily observations" value={String(m.observations)} />
              </div>
            )}
            {!m && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                Your first trade was in the most recent session, so there is no end-of-day return yet. Annualized return, volatility, Sharpe, Sortino and beta need at least {MIN_OBS} daily
                observations and are withheld until then.
              </p>
            )}
            {m?.insufficient && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                Only {m.observations} daily return{m.observations === 1 ? '' : 's'} so far. Annualized return, volatility, Sharpe, Sortino and beta need at least {MIN_OBS} observations and are withheld until then.
              </p>
            )}
            {chartData.length > 1 && (
              <>
                <TimeLines data={chartData} keys={[{ key: 'Portfolio', label: 'Portfolio' }, { key: bench, label: `${bench} (rebased, total return)`, dashed: true }]} format={(v) => fmtUsd(v)} />
                <DrawdownChart data={drawdownSeries(analytics.eq)} />
              </>
            )}
            {m && <SourceLine>
              Method: end-of-day account values reconstructed from your transaction log and as-traded closes; dividends enter as cash on ex-dates. Daily simple returns on the
              US trading calendar ({bench} sessions), annualized with 252; crypto holdings are valued at the UTC daily close on those dates. Risk-free rate: {analytics.rfNote}.
              Benchmark uses dividend-adjusted closes. Days with a missing close carry the last close forward and are flagged as stale; no prices are invented.
            </SourceLine>}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={<span className="flex items-center gap-1">Correlation of holdings <InfoTip id="correlation" /></span>}>
          {corr ? <><CorrelationMatrix labels={corr.labels} matrix={corr.m} /><SourceLine>Pearson correlation of daily returns over the last {corr.n} common sessions.</SourceLine></> : <p className="text-sm muted">Needs at least two open positions with {MIN_OBS}+ common sessions of history.</p>}
        </Panel>
        <Panel title="Asset allocation">
          <div className="space-y-2 text-sm">
            {[...val.rows.map((r) => ({ n: r.position.symbol, w: r.weight ?? 0 })), { n: 'Cash', w: val.total > 0 ? val.cash / val.total : 1 }].map((x) => (
              <div key={x.n}>
                <div className="num flex justify-between"><span className="font-medium">{x.n}</span><span>{fmtFrac(x.w, 1, false)}</span></div>
                <div className="h-1.5 rounded bg-slate-100 dark:bg-navy"><div className="h-1.5 rounded bg-accent" style={{ width: `${Math.max(0, Math.min(100, x.w * 100))}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Activity" bodyClass="p-0" actions={<>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'transactions', label: 'Transactions' }, { value: 'orders', label: 'Orders' }, { value: 'audit', label: 'Audit log' }]} />
        <button className="btn-outline text-xs" onClick={exportCsv} disabled={!account.transactions.length}><Download className="h-3.5 w-3.5" /> Export CSV</button>
      </>}>
        <div className="max-h-[420px] overflow-auto">
          {tab === 'transactions' && (
            <table className="table">
              <thead><tr><th>Session</th><th>Type</th><th>Asset</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Fee</th><th className="text-right">Cash change</th><th className="text-right">Realized</th><th>Price basis</th></tr></thead>
              <tbody>{[...account.transactions].reverse().map((t) => (
                <tr key={t.id}><td>{fmtDate(t.sessionDate)}</td><td className="capitalize">{t.type}</td><td className="font-medium">{t.symbol}</td><td className="text-right">{fmtQty(t.quantity)}</td>
                  <td className="text-right">{t.type === 'split' ? `${t.price}:1` : fmtPrice(t.price)}</td><td className="text-right">{fmtUsd(t.fee)}</td>
                  <td className={`text-right ${toneClass(t.cashChange)}`}>{fmtSigned(t.cashChange, fmtUsd)}</td><td className={`text-right ${toneClass(t.realizedPnl)}`}>{t.realizedPnl ? fmtSigned(t.realizedPnl, fmtUsd) : '—'}</td>
                  <td className="muted">{t.priceBasis ?? '—'}{t.priceAsOf ? `, ${fmtDateTime(t.priceAsOf)}` : ''}</td></tr>
              ))}</tbody>
            </table>
          )}
          {tab === 'orders' && (
            <table className="table">
              <thead><tr><th>Placed</th><th>Side</th><th>Asset</th><th>Type</th><th className="text-right">Qty</th><th className="text-right">Limit</th><th>Status</th><th className="text-right">Fill</th><th>Note</th><th /></tr></thead>
              <tbody>{[...account.orders].reverse().map((o) => (
                <tr key={o.id}><td>{fmtDateTime(o.createdAt)}</td><td className="capitalize">{o.side}</td><td className="font-medium">{o.symbol}</td><td className="capitalize">{o.type}</td>
                  <td className="text-right">{fmtQty(o.quantity)}</td><td className="text-right">{o.limitPrice ? fmtPrice(o.limitPrice) : '—'}</td>
                  <td className={o.status === 'rejected' ? 'text-loss' : o.status === 'filled' ? 'text-gain' : ''}>{o.status}</td><td className="text-right">{o.fillPrice ? fmtPrice(o.fillPrice) : '—'}</td>
                  <td className="max-w-[280px] truncate muted" title={o.note ?? ''}>{o.note ?? ''}</td>
                  <td>{o.status === 'pending' && <button className="text-xs text-loss hover:underline" onClick={() => cancel(o.id)}>Cancel order</button>}</td></tr>
              ))}</tbody>
            </table>
          )}
          {tab === 'audit' && (
            <table className="table">
              <thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead>
              <tbody>{[...account.audit].reverse().slice(0, 300).map((a, i) => (<tr key={i}><td>{fmtDateTime(a.at)}</td><td>{a.event}</td><td className="whitespace-normal muted">{a.detail}</td></tr>))}</tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}
