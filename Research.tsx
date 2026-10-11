import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Play } from 'lucide-react';
import type { Nav } from '../App';
import type { AssetKind, Bar, History } from '../types';
import { Panel, DataNotice, InfoTip, Segmented, SourceLine, Stat } from '../components/ui';
import { CorrelationMatrix, DrawdownChart, SERIES_COLORS, TimeLines, useAxisColors } from '../components/Charts';
import { UNIVERSE } from '../lib/market';
import { useFred, useHistories, type Loadable } from '../lib/hooks';
import {
  MIN_OBS, annualizedReturn, annualizedVolatility, computeMetrics, correlation, drawdownSeries, returns, riskFreePerPeriod, type MetricSet,
} from '../lib/metrics';
import {
  annualizedMoments, buildPanel, buyAndHold, dollarCostAveraging, efficientFrontier, maCrossover, momentum, periodicRebalance, randomPortfolios, runBacktest,
  type BacktestResult, type Strategy,
} from '../lib/backtest';
import { fmtFrac, fmtUsd, toneClass } from '../lib/format';

type Tab = 'corr' | 'riskret' | 'frontier' | 'backtest' | 'macro';

export default function Research({ nav }: { nav: Nav }) {
  const [tab, setTab] = useState<Tab>('corr');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Quantitative Research Lab</h1>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'corr', label: 'Correlation' }, { value: 'riskret', label: 'Risk and return' }, { value: 'frontier', label: 'Efficient frontier' },
          { value: 'backtest', label: 'Strategy backtest' }, { value: 'macro', label: 'Macro' },
        ]} />
      </div>
      {tab === 'corr' && <CorrelationTab nav={nav} />}
      {tab === 'riskret' && <RiskReturnTab nav={nav} />}
      {tab === 'frontier' && <FrontierTab nav={nav} />}
      {tab === 'backtest' && <BacktestTab nav={nav} />}
      {tab === 'macro' && <MacroTab nav={nav} />}
    </div>
  );
}

/* ---------------- shared controls ---------------- */

const CHOICES = UNIVERSE;
type Key = string; // kind:symbol

function AssetPicker({ value, onChange, max = 10 }: { value: Key[]; onChange: (v: Key[]) => void; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHOICES.map((a) => {
        const k = `${a.kind}:${a.symbol}`;
        const on = value.includes(k);
        return (
          <button key={k} onClick={() => onChange(on ? value.filter((x) => x !== k) : value.length < max ? [...value, k] : value)}
            className={`rounded border px-2 py-0.5 text-xs font-medium ${on ? 'border-accent bg-accent/10 text-accent' : 'border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300'}`}>
            {a.symbol}
          </button>
        );
      })}
    </div>
  );
}

function Period({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (s: string) => void; setTo: (s: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div><label className="label">From</label><input className="input py-1" type="date" min="2007-01-01" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div><label className="label">To</label><input className="input py-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <div className="flex gap-1 pb-0.5">
        {[['2007-01-01', 'Since 2007'], ['2016-01-01', '10Y'], [new Date(Date.now() - 3 * 365 * 86400_000).toISOString().slice(0, 10), '3Y']].map(([d, l]) => (
          <button key={l} className="btn-outline px-2 py-1 text-xs" onClick={() => { setFrom(d); setTo(today()); }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const toItems = (keys: Key[]) => keys.map((k) => { const [kind, symbol] = k.split(':'); return { kind: kind as AssetKind, symbol }; });

/** Load histories, report problems, and build an inner-joined adjusted-close panel. */
function usePanelData(keys: Key[], from: string, to: string) {
  const hist = useHistories(toItems(keys));
  return useMemo(() => {
    const loading = keys.some((k) => !hist[k] || hist[k].state === 'loading');
    const problems: Array<{ k: Key; l: Loadable<History> }> = [];
    const series: Record<string, Bar[]> = {};
    for (const k of keys) {
      const l = hist[k];
      if (l?.data?.bars.length) {
        const inRange = l.data.bars.filter((b) => b.date >= from && b.date <= to);
        if (inRange.length > MIN_OBS) series[k.split(':')[1]] = inRange;
        else problems.push({ k, l: { ...l, state: 'unavailable', message: `${k.split(':')[1]}: not enough data in the selected period (first available ${l.data.firstDate}).` } });
      } else if (l && l.state !== 'loading') problems.push({ k, l });
    }
    const symbols = Object.keys(series);
    const panel = symbols.length ? buildPanel(series, from, to) : null;
    const allCrypto = keys.every((k) => k.startsWith('crypto:'));
    return { loading, problems, panel, ppy: allCrypto ? 365 : 252, hist };
  }, [hist, keys, from, to]);
}

function Problems({ problems, nav }: { problems: Array<{ k: Key; l: Loadable<History> }>; nav: Nav }) {
  if (!problems.length) return null;
  const cfg = problems.find((p) => p.l.state === 'config-required');
  return (
    <div className="space-y-2">
      {cfg && <DataNotice state="config-required" message={cfg.l.message} onOpenSettings={nav.openSettings} />}
      {problems.filter((p) => p.l.state !== 'config-required').map((p) => <p key={p.k} className="text-xs text-amber-700 dark:text-amber-300">{p.l.message ?? `${p.k}: data unavailable`}</p>)}
    </div>
  );
}

function SampleNote({ dates, ppy }: { dates: string[]; ppy: number }) {
  return <SourceLine>Common sample: {dates[0]} to {dates[dates.length - 1]}, {dates.length - 1} daily returns on dates where every selected asset traded (inner join). Adjusted closes (dividends and splits). Annualization factor {ppy}.</SourceLine>;
}

/* ---------------- Correlation ---------------- */

function CorrelationTab({ nav }: { nav: Nav }) {
  const [keys, setKeys] = useState<Key[]>(['equity:SPY', 'equity:TLT', 'equity:GLD', 'crypto:BTC', 'equity:JPM', 'equity:AAPL']);
  const [from, setFrom] = useState('2016-01-01');
  const [to, setTo] = useState(today());
  const [win, setWin] = useState(63);
  const { loading, problems, panel, ppy } = usePanelData(keys, from, to);

  const res = useMemo(() => {
    if (!panel || panel.dates.length < MIN_OBS + 1) return null;
    const r = panel.close.map(returns);
    const m = r.map((a) => r.map((b) => correlation(a, b)));
    let rolling: Array<{ date: string; v: number | null }> = [];
    if (r.length >= 2) {
      rolling = panel.dates.slice(1).map((d, i) => ({ date: d, v: i + 1 >= win ? correlation(r[0].slice(i + 1 - win, i + 1), r[1].slice(i + 1 - win, i + 1)) : null }));
    }
    return { m, rolling };
  }, [panel, win]);

  return (
    <Panel title={<span className="flex items-center gap-1">Return correlations <InfoTip id="correlation" /></span>}>
      <div className="space-y-3">
        <AssetPicker value={keys} onChange={setKeys} />
        <Period from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Problems problems={problems} nav={nav} />
        {loading && <DataNotice state="loading" message={null} />}
        {res && panel && (
          <>
            <CorrelationMatrix labels={panel.symbols} matrix={res.m} />
            <SampleNote dates={panel.dates} ppy={ppy} />
            {panel.symbols.length >= 2 && (
              <div className="pt-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium">Rolling correlation: {panel.symbols[0]} vs {panel.symbols[1]}</p>
                  <Segmented size="xs" value={String(win)} onChange={(v) => setWin(Number(v))} options={[{ value: '21', label: '21d' }, { value: '63', label: '63d' }, { value: '126', label: '126d' }]} />
                </div>
                <TimeLines data={res.rolling.map((x) => ({ date: x.date, Correlation: x.v }))} keys={[{ key: 'Correlation', label: 'Correlation' }]} format={(v) => v.toFixed(2)} height={200} yDomain={[-1, 1]} />
                <SourceLine>Order the first two selected assets to choose the pair. Watch how correlations shift in stress periods such as March 2020 or 2022.</SourceLine>
              </div>
            )}
          </>
        )}
        {!loading && !res && !problems.length && <p className="text-sm muted">Select at least two assets with overlapping history.</p>}
      </div>
    </Panel>
  );
}

/* ---------------- Risk and return ---------------- */

function RiskReturnTab({ nav }: { nav: Nav }) {
  const [keys, setKeys] = useState<Key[]>(['equity:AAPL', 'equity:MSFT', 'equity:NVDA', 'equity:KO', 'equity:JPM', 'equity:SPY', 'equity:TLT', 'equity:GLD', 'crypto:BTC']);
  const [from, setFrom] = useState('2016-01-01');
  const [to, setTo] = useState(today());
  const { loading, problems, panel, ppy } = usePanelData(keys, from, to);
  const c = useAxisColors();
  const pts = useMemo(() => panel && panel.dates.length > MIN_OBS ? panel.symbols.map((s, i) => ({ s, x: annualizedVolatility(returns(panel.close[i]), ppy) * 100, y: annualizedReturn(panel.close[i], ppy) * 100 })) : null, [panel, ppy]);
  return (
    <Panel title="Risk versus return">
      <div className="space-y-3">
        <AssetPicker value={keys} onChange={setKeys} max={14} />
        <Period from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Problems problems={problems} nav={nav} />
        {loading && <DataNotice state="loading" message={null} />}
        {pts && panel && (
          <>
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
                <CartesianGrid stroke={c.grid} />
                <XAxis type="number" dataKey="x" name="Volatility" unit="%" tick={{ fill: c.text, fontSize: 11 }} label={{ value: 'Annualized volatility (%)', position: 'insideBottom', offset: -12, fill: c.text, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="Return" unit="%" tick={{ fill: c.text, fontSize: 11 }} label={{ value: 'Annualized return (%)', angle: -90, position: 'insideLeft', fill: c.text, fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, fontSize: 12 }} />
                <Scatter data={pts} fill="#4169E1" isAnimationActive={false}><LabelList dataKey="s" position="top" style={{ fill: c.text, fontSize: 11 }} /></Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <SampleNote dates={panel.dates} ppy={ppy} />
            <SourceLine>Return is the geometric annualized return (CAGR) over the common sample; volatility is the annualized sample standard deviation of daily simple returns. Past realized values are not expected returns.</SourceLine>
          </>
        )}
      </div>
    </Panel>
  );
}

/* ---------------- Efficient frontier ---------------- */

function FrontierTab({ nav }: { nav: Nav }) {
  const [keys, setKeys] = useState<Key[]>(['equity:SPY', 'equity:TLT', 'equity:GLD', 'equity:QQQ', 'equity:IWM']);
  const [from, setFrom] = useState('2016-01-01');
  const [to, setTo] = useState(today());
  const { loading, problems, panel } = usePanelData(keys, from, to);
  const rf = useFred('DTB3');
  const c = useAxisColors();

  const res = useMemo(() => {
    if (!panel || panel.symbols.length < 2 || panel.dates.length < 60) return null;
    const { mu, cov } = annualizedMoments(panel, 252);
    const rfPts = (rf.data?.points ?? []).filter((p) => p.date >= panel.dates[0] && p.date <= panel.dates[panel.dates.length - 1]);
    const rfAnn = rfPts.length ? rfPts.reduce((s, p) => s + p.value, 0) / rfPts.length / 100 : 0;
    const ef = efficientFrontier(mu, cov, rfAnn, 40);
    const cloud = randomPortfolios(mu, cov, 1500).map((p) => ({ x: p.vol * 100, y: p.ret * 100 }));
    const assets = panel.symbols.map((s, i) => ({ s, x: Math.sqrt(cov[i][i]) * 100, y: mu[i] * 100 }));
    return { ef, cloud, assets, rfAnn, rfFromData: rfPts.length > 0 };
  }, [panel, rf.data]);

  return (
    <Panel title={<span className="flex items-center gap-1">Mean–variance efficient frontier (long-only) <InfoTip id="frontier" /></span>}>
      <div className="space-y-3">
        <AssetPicker value={keys} onChange={setKeys} max={10} />
        <Period from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Problems problems={problems} nav={nav} />
        {loading && <DataNotice state="loading" message={null} />}
        {res && panel && (
          <>
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
                <CartesianGrid stroke={c.grid} />
                <XAxis type="number" dataKey="x" unit="%" domain={['auto', 'auto']} tick={{ fill: c.text, fontSize: 11 }} label={{ value: 'Annualized volatility (%)', position: 'insideBottom', offset: -12, fill: c.text, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" unit="%" domain={['auto', 'auto']} tick={{ fill: c.text, fontSize: 11 }} label={{ value: 'Expected return, μ (%)', angle: -90, position: 'insideLeft', fill: c.text, fontSize: 11 }} />
                <ZAxis range={[12, 12]} />
                <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Scatter name="Random long-only portfolios" data={res.cloud} fill="#94A3B8" fillOpacity={0.35} isAnimationActive={false} />
                <Line name="Efficient frontier" data={res.ef.frontier.map((p) => ({ x: p.vol * 100, y: p.ret * 100 }))} dataKey="y" stroke="#4169E1" strokeWidth={2} dot={false} isAnimationActive={false} type="monotone" />
                <Scatter name="Single assets" data={res.assets} fill="#D19A2A" isAnimationActive={false}><LabelList dataKey="s" position="top" style={{ fill: c.text, fontSize: 11 }} /></Scatter>
                <Scatter name="Minimum variance" data={[{ x: res.ef.minVar.vol * 100, y: res.ef.minVar.ret * 100 }]} fill="#16A085" shape="diamond" isAnimationActive={false} />
                <Scatter name="Maximum Sharpe" data={[{ x: res.ef.maxSharpe.vol * 100, y: res.ef.maxSharpe.ret * 100 }]} fill="#E05A5A" shape="star" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="grid gap-4 md:grid-cols-2">
              {[['Minimum-variance portfolio', res.ef.minVar], ['Maximum-Sharpe portfolio', res.ef.maxSharpe]].map(([label, p]) => {
                const pt = p as typeof res.ef.minVar;
                return (
                  <div key={label as string} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <p className="font-medium">{label as string}</p>
                    <p className="num text-xs muted">μ {fmtFrac(pt.ret)}, σ {fmtFrac(pt.vol, 2, false)}, Sharpe {pt.sharpe.toFixed(2)}</p>
                    <div className="mt-2 space-y-1">
                      {panel.symbols.map((s, i) => (
                        <div key={s} className="num flex items-center gap-2 text-xs">
                          <span className="w-12 font-medium">{s}</span>
                          <div className="h-1.5 flex-1 rounded bg-slate-100 dark:bg-navy"><div className="h-1.5 rounded" style={{ width: `${pt.weights[i] * 100}%`, background: SERIES_COLORS[i % SERIES_COLORS.length] }} /></div>
                          <span className="w-12 text-right">{(pt.weights[i] * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <SampleNote dates={panel.dates} ppy={252} />
            <SourceLine>
              Optimization: for λ on a log grid, minimize wᵀΣw − λμᵀw subject to Σw = 1, w ≥ 0, by projected gradient descent (exact Euclidean projection onto the simplex).
              μ = mean daily return × 252, Σ = sample covariance × 252. Sharpe uses the average 3-month T-bill rate over the sample ({(res.rfAnn * 100).toFixed(2)}%{res.rfFromData ? ', FRED DTB3' : ', FRED unavailable so 0%'}).
              This is an in-sample frontier: it shows what would have been optimal with hindsight, not a forecast. Grey points are 1,500 random long-only portfolios for context.
            </SourceLine>
          </>
        )}
        {!loading && !res && !problems.length && <p className="text-sm muted">Select at least two assets with 60+ common sessions.</p>}
      </div>
    </Panel>
  );
}

/* ---------------- Strategy backtest ---------------- */

type StratId = 'bh' | 'dca' | 'ma' | 'mom' | 'rebal';

function BacktestTab({ nav }: { nav: Nav }) {
  const [keys, setKeys] = useState<Key[]>(['equity:SPY', 'equity:TLT', 'equity:GLD']);
  const [from, setFrom] = useState('2007-01-01');
  const [to, setTo] = useState(today());
  const [strat, setStrat] = useState<StratId>('rebal');
  const [capital, setCapital] = useState(100_000);
  const [fee, setFee] = useState(5);
  const [months, setMonths] = useState(3);
  const [fast, setFast] = useState(50);
  const [slow, setSlow] = useState(200);
  const [lookback, setLookback] = useState(126);
  const [topK, setTopK] = useState(1);
  const [installments, setInstallments] = useState(12);
  const [weightsTxt, setWeightsTxt] = useState('60,30,10');
  const [run, setRun] = useState<{ r: BacktestResult; name: string; bench: Array<{ date: string; value: number }>; m: MetricSet; mb: MetricSet; rfNote: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { loading, problems, panel } = usePanelData(keys, from, to);
  const spyData = usePanelData(['equity:SPY'], from, to);
  const rf = useFred('DTB3');

  const parseWeights = (n: number) => {
    const w = weightsTxt.split(/[ ,;]+/).map(Number).filter((x) => Number.isFinite(x) && x >= 0);
    if (w.length !== n) return Array(n).fill(1 / n);
    const s = w.reduce((a, b) => a + b, 0);
    return s > 0 ? w.map((x) => x / s) : Array(n).fill(1 / n);
  };

  const execute = () => {
    setErr(null);
    if (!panel || panel.dates.length < 60) { setErr('Not enough common history for the selected assets and period.'); return; }
    const n = panel.symbols.length;
    const w = parseWeights(n);
    let s: Strategy;
    if (strat === 'bh') s = buyAndHold(w);
    else if (strat === 'dca') s = dollarCostAveraging(w, installments, capital);
    else if (strat === 'ma') { if (fast >= slow) { setErr('Fast window must be shorter than slow window.'); return; } s = maCrossover(fast, slow); }
    else if (strat === 'mom') s = momentum(lookback, Math.max(1, Math.min(topK, n)));
    else s = periodicRebalance(w, months);
    const r = runBacktest(panel, s, capital, fee);
    const spyBars = spyData.panel;
    const eq = r.dates.map((d, i) => ({ date: d, value: r.equity[i] }));
    let bench: Array<{ date: string; value: number }> = [];
    if (spyBars) {
      const m = new Map(spyBars.dates.map((d, i) => [d, { o: spyBars.open[0][i], c: spyBars.close[0][i] }]));
      // benchmark: SPY bought at the second session's open (same timing as the strategy's first fill)
      const startD = r.dates[1];
      const o = m.get(startD)?.o;
      if (o) bench = r.dates.map((d, i) => ({ date: d, value: i === 0 ? capital : m.get(d) ? (m.get(d)!.c / o) * capital : NaN })).filter((p) => Number.isFinite(p.value));
    }
    const rfArr = riskFreePerPeriod(eq.map((e) => e.date), rf.data?.points ?? []);
    const metrics = computeMetrics(eq, bench.length ? bench : null, rfArr);
    const mb = computeMetrics(bench, null, riskFreePerPeriod(bench.map((e) => e.date), rf.data?.points ?? []));
    setRun({ r, name: s.name, bench, m: metrics, mb, rfNote: rf.data ? 'FRED DTB3, daily, carried forward' : 'unavailable (0% used)' });
  };

  const data = run ? run.r.dates.map((d, i) => ({ date: d, Strategy: run.r.equity[i], 'SPY buy-and-hold': run.bench.find((b) => b.date === d)?.value ?? null })) : [];
  const syms = panel?.symbols ?? toItems(keys).map((i) => i.symbol);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="Strategy setup" className="self-start">
        <div className="space-y-3 text-sm">
          <AssetPicker value={keys} onChange={setKeys} max={8} />
          <Period from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <div>
            <label className="label">Strategy</label>
            <select className="input" value={strat} onChange={(e) => setStrat(e.target.value as StratId)}>
              <option value="bh">Buy and hold</option>
              <option value="dca">Dollar-cost averaging</option>
              <option value="ma">Moving-average crossover</option>
              <option value="mom">Momentum (cross-sectional)</option>
              <option value="rebal">Periodic rebalancing</option>
            </select>
          </div>
          {(strat === 'bh' || strat === 'dca' || strat === 'rebal') && (
            <div>
              <label className="label">Target weights, in order: {syms.join(', ')}</label>
              <input className="input num" value={weightsTxt} onChange={(e) => setWeightsTxt(e.target.value)} />
              <p className="mt-0.5 text-[11px] muted">Comma-separated; normalized to 100%. Equal weights if the count does not match.</p>
            </div>
          )}
          {strat === 'rebal' && <NumField label="Rebalance every (months)" value={months} set={setMonths} min={1} max={12} />}
          {strat === 'dca' && <NumField label="Monthly installments" value={installments} set={setInstallments} min={2} max={120} />}
          {strat === 'ma' && <div className="grid grid-cols-2 gap-2"><NumField label="Fast SMA" value={fast} set={setFast} min={5} max={250} /><NumField label="Slow SMA" value={slow} set={setSlow} min={10} max={400} /></div>}
          {strat === 'mom' && <div className="grid grid-cols-2 gap-2"><NumField label="Lookback (sessions)" value={lookback} set={setLookback} min={20} max={260} /><NumField label="Hold top k" value={topK} set={setTopK} min={1} max={8} /></div>}
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Initial capital" value={capital} set={setCapital} min={1000} max={10_000_000} step={1000} />
            <NumField label="Fee (bps)" value={fee} set={setFee} min={0} max={100} />
          </div>
          <Problems problems={problems} nav={nav} />
          <button className="btn-primary w-full" disabled={loading || !panel} onClick={execute}><Play className="h-4 w-4" /> Run backtest</button>
          {loading && <p className="text-xs muted">Loading history…</p>}
          {err && <p className="text-xs text-loss">{err}</p>}
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        {!run ? (
          <Panel title="Results"><p className="text-sm muted">Configure a strategy and run it. Results use only information available at each decision date.</p></Panel>
        ) : (
          <Panel title={`Results: ${run.name}`}>
            <TimeLines data={data} keys={[{ key: 'Strategy', label: run.name }, { key: 'SPY buy-and-hold', label: 'SPY buy-and-hold', dashed: true }]} format={(v) => fmtUsd(v)} />
            <DrawdownChart data={drawdownSeries(run.r.dates.map((d, i) => ({ date: d, value: run.r.equity[i] })))} />
            <div className="mt-3 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Statistic</th><th className="text-right">Strategy</th><th className="text-right">SPY</th></tr></thead>
                <tbody>
                  {([
                    ['Cumulative return', '', (m: MetricSet) => fmtFrac(m.cumulative)],
                    ['Annualized return', 'cagr', (m: MetricSet) => fmtFrac(m.annualized)],
                    ['Volatility', 'vol', (m: MetricSet) => fmtFrac(m.volatility, 2, false)],
                    ['Sharpe ratio', 'sharpe', (m: MetricSet) => m.sharpe?.toFixed(2) ?? '—'],
                    ['Sortino ratio', 'sortino', (m: MetricSet) => m.sortino?.toFixed(2) ?? '—'],
                    ['Maximum drawdown', 'mdd', (m: MetricSet) => fmtFrac(m.maxDrawdown)],
                  ] as const).map(([l, info, f]) => (
                    <tr key={l}><td className="flex items-center gap-1">{l}{info && <InfoTip id={info} />}</td><td className="text-right">{f(run.m)}</td><td className="text-right">{f(run.mb)}</td></tr>
                  ))}
                  <tr><td className="flex items-center gap-1">Beta vs SPY <InfoTip id="beta" /></td><td className="text-right">{run.m.beta?.toFixed(2) ?? '—'}</td><td className="text-right">1.00</td></tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Final value" value={fmtUsd(run.r.equity.at(-1))} tone={toneClass(run.r.equity.at(-1)! - capital)} />
              <Stat label="Trades" value={String(run.r.trades)} />
              <Stat label="Fees paid" value={fmtUsd(run.r.fees)} />
              <Stat label="Turnover" value={`${run.r.turnover.toFixed(2)}×`} sub="Traded notional / avg equity" />
            </div>
            <SourceLine>
              Methodology: signals are computed at the close of day t from prices up to t (enforced in code: any access to t+1 throws) and executed at the adjusted open of t+1.
              Prices are dividend- and split-adjusted, so dividends are reinvested. Fractional units, no leverage or shorting; uninvested cash earns 0%. Fees of {fee} bps on traded notional.
              Common sample of all selected assets ({run.r.dates[0]} to {run.r.dates.at(-1)}). Risk-free: {run.rfNote}. Assets are today's listings, so results carry survivorship bias.
            </SourceLine>
          </Panel>
        )}
      </div>
    </div>
  );
}

function NumField({ label, value, set, min, max, step = 1 }: { label: string; value: number; set: (n: number) => void; min: number; max: number; step?: number }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input num" type="number" min={min} max={max} step={step} value={value} onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value))))} />
    </div>
  );
}

/* ---------------- Macro ---------------- */

const MACRO = ['DFF', 'CPIAUCSL', 'UNRATE', 'GDPC1', 'DGS10', 'DGS2', 'T10Y2Y', 'VIXCLS'];
const MACRO_LABEL: Record<string, string> = {
  DFF: 'Fed funds rate (%)', CPIAUCSL: 'CPI inflation, 12-month (%)', UNRATE: 'Unemployment rate (%)', GDPC1: 'Real GDP growth, year over year (%)',
  DGS10: '10-year Treasury yield (%)', DGS2: '2-year Treasury yield (%)', T10Y2Y: '10Y–2Y spread (pp)', VIXCLS: 'VIX',
};

function MacroTab({ nav }: { nav: Nav }) {
  const [series, setSeries] = useState('DFF');
  const [asset, setAsset] = useState<Key>('equity:SPY');
  const [recessions, setRecessions] = useState(true);
  const s = useFred(series);
  const usrec = useFred('USREC');
  const hist = useHistories(asset ? toItems([asset]) : []);
  const h = asset ? hist[asset] : null;

  const view = useMemo(() => {
    if (!s.data) return null;
    // month-end values for every series so mixed frequencies line up
    const monthly = (pts: Array<{ date: string; value: number }>) => {
      const m = new Map<string, number>();
      for (const p of pts) m.set(p.date.slice(0, 7), p.value);
      return m;
    };
    let m = monthly(s.data.points);
    if (series === 'CPIAUCSL') m = yoy(m, 12);
    if (series === 'GDPC1') m = yoyQuarterly(s.data.points);
    const a = h?.data ? monthly(h.data.bars.map((b) => ({ date: b.date, value: b.adjClose }))) : null;
    const months = [...new Set([...m.keys(), ...(a ? a.keys() : [])])].filter((k) => k >= '2007-01').sort();
    const rows = months.map((k) => ({ date: k, [MACRO_LABEL[series]]: m.get(k) ?? null, [asset.split(':')[1]]: a?.get(k) ?? null }));
    const shade: Array<{ from: string; to: string }> = [];
    if (recessions && usrec.data) {
      let start: string | null = null;
      for (const p of usrec.data.points) {
        const k = p.date.slice(0, 7);
        if (p.value === 1 && !start) start = k;
        if (p.value === 0 && start) { shade.push({ from: start, to: k }); start = null; }
      }
      if (start) shade.push({ from: start, to: months[months.length - 1] });
    }
    return { rows, shade };
  }, [s.data, h?.data, usrec.data, recessions, series, asset]);

  return (
    <Panel title="Macroeconomic indicators and asset prices">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label">Indicator (FRED)</label>
            <select className="input" value={series} onChange={(e) => setSeries(e.target.value)}>{MACRO.map((m) => <option key={m} value={m}>{MACRO_LABEL[m]}</option>)}</select></div>
          <div><label className="label">Overlay asset (right axis)</label>
            <select className="input" value={asset} onChange={(e) => setAsset(e.target.value)}>{UNIVERSE.map((a) => <option key={`${a.kind}:${a.symbol}`} value={`${a.kind}:${a.symbol}`}>{a.symbol}</option>)}</select></div>
          <label className="flex items-center gap-1.5 pb-1.5 text-sm"><input type="checkbox" className="accent-accent" checked={recessions} onChange={(e) => setRecessions(e.target.checked)} />Shade NBER recessions</label>
        </div>
        {s.state !== 'eod' && <DataNotice state={s.state} message={s.message} onOpenSettings={nav.openSettings} />}
        {h && h.state !== 'eod' && h.state !== 'loading' && <DataNotice state={h.state} message={h.message} onOpenSettings={nav.openSettings} />}
        {view && (
          <TimeLines data={view.rows} height={360} shade={view.shade}
            keys={[{ key: MACRO_LABEL[series], label: MACRO_LABEL[series] }, { key: asset.split(':')[1], label: `${asset.split(':')[1]} (adjusted close)`, axis: 'right', dashed: true }]}
            format={(v) => v.toFixed(2)} />
        )}
        {s.data && (
          <SourceLine>
            {s.data.title} ({s.data.units}, {s.data.frequency}); FRED last updated {s.data.lastUpdated ?? 'n/a'}. Values shown at month-end; CPI and GDP transformed to year-over-year growth.
            {' '}Data are the latest vintage: macro series such as GDP, CPI (seasonal factors) and payrolls are revised after first publication, and each observation is published with a lag
            (CPI about two weeks after month-end, GDP advance estimate about a month after quarter-end). A chart of today's data therefore shows information that investors did not have
            at the time. For point-in-time research use ALFRED vintages. Recession shading: FRED USREC (NBER dates, announced months after the fact). {s.data.attribution}
          </SourceLine>
        )}
      </div>
    </Panel>
  );
}

function yoy(m: Map<string, number>, lag: number): Map<string, number> {
  const keys = [...m.keys()].sort();
  const out = new Map<string, number>();
  keys.forEach((k, i) => { if (i >= lag) out.set(k, (m.get(k)! / m.get(keys[i - lag])! - 1) * 100); });
  return out;
}

function yoyQuarterly(points: Array<{ date: string; value: number }>): Map<string, number> {
  const out = new Map<string, number>();
  points.forEach((p, i) => { if (i >= 4) out.set(p.date.slice(0, 7), (p.value / points[i - 4].value - 1) * 100); });
  return out;
}

