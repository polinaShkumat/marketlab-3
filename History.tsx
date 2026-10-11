import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FastForward, Flag, Loader2, Play, RotateCcw } from 'lucide-react';
import type { Nav } from '../App';
import type { AssetKind, Bar } from '../types';
import type { TimeRow } from '../components/Charts';
import { Panel, DataNotice, InfoTip, Segmented, SourceLine, Stat } from '../components/ui';
import { DrawdownChart, TimeLines } from '../components/Charts';
import PriceChart from '../components/PriceChart';
import { CRISES, type Crisis } from '../data/crises';
import { UNIVERSE } from '../lib/market';
import { getFred, getHistory, describeFailure } from '../lib/api';
import { useHistories } from '../lib/hooks';
import { useAccount } from '../store';
import {
  advance, jumpTo, makeAssets, markToMarket, openPrice, sessionsUntil, startSimulation, today, trade, visibleBars,
  type TMAsset, type TMState,
} from '../lib/timeMachine';
import { alignOnDates, annualizedVolatility, computeMetrics, drawdownSeries, maxDrawdown, returns, riskFreePerPeriod } from '../lib/metrics';
import { fmtDate, fmtFrac, fmtPrice, fmtQty, fmtUsd, toneClass } from '../lib/format';

export default function HistoryPage({ nav }: { nav: Nav }) {
  const [tab, setTab] = useState<'tm' | 'crisis'>('tm');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Historical Simulator</h1>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'tm', label: 'Market Time Machine' }, { value: 'crisis', label: 'Financial Crisis Explorer' }]} />
      </div>
      {tab === 'tm' ? <TimeMachine nav={nav} /> : <CrisisExplorer nav={nav} />}
    </div>
  );
}

/* ====================================================================== */
/* Market Time Machine                                                     */
/* ====================================================================== */

const TM_CHOICES = UNIVERSE.filter((a) => a.group !== 'Reference' || ['GLD', 'TLT'].includes(a.symbol));

function TimeMachine({ nav }: { nav: Nav }) {
  const [start, setStart] = useState('2008-01-02');
  const [capital, setCapital] = useState(100_000);
  const [feeBps, setFeeBps] = useState(5);
  const [picked, setPicked] = useState<string[]>(['equity:AAPL', 'equity:MSFT', 'equity:SPY']);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [assets, setAssets] = useState<Record<string, TMAsset> | null>(null);
  const [bench, setBench] = useState<Bar[] | null>(null);
  const [state, setState] = useState<TMState | null>(null);
  const [review, setReview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errKind, setErrKind] = useState<'config' | 'server' | 'other' | null>(null);

  const begin = async () => {
    setErrKind(null);
    setLoading(true); setNotes([]); setErr(null);
    const list = picked.map((k) => { const [kind, symbol] = k.split(':'); return { symbol, kind: kind as AssetKind }; });
    const loaded: Array<{ symbol: string; kind: AssetKind; bars: Bar[] }> = [];
    const n: string[] = [];
    const codes: string[] = [];
    for (const it of list) {
      try {
        const h = await getHistory(it.symbol, it.kind);
        if (!h.bars.some((b) => b.date >= start)) { n.push(`${it.symbol}: no data on or after ${start}.`); continue; }
        if (h.firstDate && h.firstDate > start) n.push(`${it.symbol}: first available price is ${h.firstDate}; it cannot be traded before then.`);
        loaded.push({ symbol: it.symbol, kind: it.kind, bars: h.bars });
      } catch (e) {
        const f = describeFailure(e);
        codes.push(f.code);
        n.push(`${it.symbol}: ${f.message}`);
      }
    }
    let b: Bar[] | null = null;
    try { b = (await getHistory('SPY', 'equity')).bars; } catch (e) { n.push(`Benchmark SPY unavailable: ${describeFailure(e).message}`); }
    setNotes(n);
    setLoading(false);
    if (!loaded.length) {
      if (codes.length && codes.every((c) => c === 'API_UNREACHABLE' || c === 'NETWORK')) {
        setErrKind('server');
        setErr('The data server is not reachable, so no prices could be loaded.');
      } else if (codes.length && codes.every((c) => c === 'CONFIG_REQUIRED' || c === 'API_UNREACHABLE')) {
        setErrKind('config');
        setErr('Stock and ETF prices need a Tiingo API key, which is not configured.');
      } else if (codes.length) {
        setErrKind('other');
        setErr('Price data could not be loaded for any selected asset. Reasons per asset are listed below.');
      } else {
        setErrKind('other');
        setErr(`None of the selected assets has price data on or after ${start}. Choose a later start date or other assets.`);
      }
      return;
    }
    // Calendar from equities (and SPY when available) so sessions match the US market.
    const a = makeAssets(loaded);
    const calSrc = b ? makeAssets([...loaded, { symbol: '__SPY', kind: 'equity', bars: b }]) : a;
    const s = startSimulation(calSrc, start, capital, feeBps);
    setAssets(a); setBench(b); setState(s); setReview(false);
  };

  if (!state || !assets) {
    return (
      <Panel title="Set up a simulation">
        <div className="grid gap-5 md:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="tm-start">Start date</label>
              <input id="tm-start" className="input" type="date" min="2007-01-03" max={new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10)} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="tm-cap">Initial capital (USD)</label>
              <input id="tm-cap" className="input num" type="number" min={1000} step={1000} value={capital} onChange={(e) => setCapital(Math.max(1000, Number(e.target.value)))} />
            </div>
            <div>
              <label className="label" htmlFor="tm-fee">Fee (bps of notional)</label>
              <input id="tm-fee" className="input num" type="number" min={0} max={100} value={feeBps} onChange={(e) => setFeeBps(Math.max(0, Number(e.target.value)))} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[['2008-01-02', 'Jan 2008'], ['2010-05-03', 'May 2010'], ['2020-01-02', 'Jan 2020'], ['2022-01-03', 'Jan 2022']].map(([d, l]) => (
                <button key={d} className="btn-outline px-2 py-1 text-xs" onClick={() => setStart(d)}>{l}</button>
              ))}
            </div>
            <button className="btn-primary w-full py-2" disabled={loading || !picked.length} onClick={begin}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start simulation
            </button>
            {err && (
              <div className="rounded-md border border-loss/40 bg-loss/5 p-3 text-sm">
                <p className="font-medium text-loss">{err}</p>
                {errKind === 'config' && (
                  <p className="mt-1">Add <code>TIINGO_API_KEY</code> in Vercel (then redeploy) or in <code>.env.local</code> (then restart <code>npm run dev</code>), or paste your own key in{' '}
                    <button className="text-accent hover:underline" onClick={nav.openSettings}>Settings</button>. Crypto needs no key: select only BTC or ETH with a start date after 2016 to test the simulator now.</p>
                )}
                {errKind === 'server' && <p className="mt-1">Run the app with <code>npm run dev</code>, or open your Vercel deployment. You can check the server directly at <code>/api/status</code>.</p>}
              </div>
            )}
            {notes.length > 0 && (
              <ul className="space-y-1 text-xs">
                {notes.map((x) => <li key={x} className="text-slate-700 dark:text-slate-300">{x}</li>)}
              </ul>
            )}
          </div>
          <div>
            <p className="label">Assets available in the simulation</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
              {TM_CHOICES.map((a) => {
                const k = `${a.kind}:${a.symbol}`;
                return (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <input type="checkbox" className="accent-accent" checked={picked.includes(k)} onChange={(e) => setPicked(e.target.checked ? [...picked, k] : picked.filter((x) => x !== k))} />
                    <span className="font-medium">{a.symbol}</span><span className="truncate text-xs muted">{a.name}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 space-y-1.5 text-sm muted">
              <p>You stand at the opening bell of each session. You see every price before today plus today's opening price, and your orders fill at that open. Nothing after today is loaded into the decision screen.</p>
              <p>Execution uses as-traded prices; stock splits adjust your share count and cash dividends are credited on ex-dates. Assets that did not yet exist (for example META before 2012 or SOL before 2021) cannot be traded until their first real price.</p>
              <p>The asset list contains companies that exist today, which introduces survivorship bias: no simulated investor in 2008 could have known which firms would survive.</p>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  if (review) return <Retrospective state={state} assets={assets} bench={bench} onRestart={() => { setState(null); setReview(false); }} onBack={() => setReview(false)} nav={nav} />;
  return <TMSession state={state} setState={setState} assets={assets} notes={notes} onReview={() => setReview(true)} onQuit={() => setState(null)} />;
}

function TMSession({ state, setState, assets, notes, onReview, onQuit }: { state: TMState; setState: (s: TMState) => void; assets: Record<string, TMAsset>; notes: string[]; onReview: () => void; onQuit: () => void }) {
  const syms = Object.keys(assets);
  const [focus, setFocus] = useState(syms[0]);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [mode, setMode] = useState<'dollars' | 'shares'>('dollars');
  const [amount, setAmount] = useState('10000');
  const [msg, setMsg] = useState<string | null>(null);
  const [jump, setJump] = useState('');

  const a = assets[focus];
  const px = openPrice(a, state);
  const visible = useMemo(() => visibleBars(a, state), [a, state]);
  const d = today(state);
  const valueNow = markToMarket(state, assets, d, 'open');
  const qty = px ? Math.floor((mode === 'dollars' ? Number(amount) / px : Number(amount)) * 1e6) / 1e6 : 0;

  const doTrade = () => {
    const r = trade(state, a, side, qty);
    setMsg(r.error ?? `${side === 'buy' ? 'Bought' : 'Sold'} ${fmtQty(qty)} ${focus} at ${fmtPrice(px)} (open of ${fmtDate(d)}).`);
    if (!r.error) setState(r.state);
  };
  const step = (u: 'day' | 'week' | 'month' | 'year') => { setMsg(null); setState(advance(state, assets, sessionsUntil(state, u))); };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs muted">Market open</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">{new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
            <p className="num text-xs muted">Session {state.cursor + 1} of the available history{state.finished ? ', simulation finished' : ''}</p>
          </div>
          <div className="num flex gap-6">
            <Stat label="Portfolio at today's open" value={fmtUsd(valueNow.value)} sub={fmtFrac(valueNow.value / state.capital - 1)} tone={toneClass(valueNow.value - state.capital)} />
            <Stat label="Cash" value={fmtUsd(state.cash)} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['day', 'week', 'month', 'year'] as const).map((u) => (
              <button key={u} className="btn-outline px-2 py-1 text-xs" disabled={state.finished} onClick={() => step(u)}><FastForward className="h-3 w-3" /> 1 {u}</button>
            ))}
            <input className="input w-36 py-1 text-xs" type="date" value={jump} min={d} onChange={(e) => setJump(e.target.value)} aria-label="Jump to date" />
            <button className="btn-outline px-2 py-1 text-xs" disabled={!jump || state.finished} onClick={() => { setState(jumpTo(state, assets, jump)); setMsg(null); }}>Jump</button>
            <button className="btn-primary px-2 py-1 text-xs" onClick={onReview}><Flag className="h-3 w-3" /> Finish and review</button>
          </div>
        </section>

        <Panel title={`${focus}: prices up to the previous close`} actions={<select className="input w-auto py-1 text-xs" value={focus} onChange={(e) => setFocus(e.target.value)}>{syms.map((s) => <option key={s}>{s}</option>)}</select>}>
          {visible.length >= 2 ? (
            <PriceChart bars={visible} mode="candle" adjusted={false} overlays={{ sma20: false, sma50: true, sma200: true, bb: false }} lower="none" range="1Y" height={320} />
          ) : (
            <p className="py-10 text-center text-sm muted">{visible.length ? 'Only one session of history so far.' : `${focus} has no trading history before ${fmtDate(d)}.`}</p>
          )}
          <SourceLine>Chart deliberately stops at the previous close. Today's opening price{px ? `: ${fmtPrice(px)}` : ' is not available'}.</SourceLine>
        </Panel>

        {state.equity.length > 1 && (
          <Panel title="Your equity so far">
            <TimeLines data={state.equity.map((e) => ({ date: e.date, Value: e.value }))} keys={[{ key: 'Value', label: 'Portfolio value' }]} format={(v) => fmtUsd(v)} height={200} />
          </Panel>
        )}
      </div>

      <div className="space-y-4">
        <Panel title="Trade at today's open">
          <div className="space-y-3 text-sm">
            <select className="input" value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Asset">{syms.map((s) => <option key={s}>{s}</option>)}</select>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 dark:bg-navy">
              {(['buy', 'sell'] as const).map((s) => <button key={s} onClick={() => setSide(s)} className={`rounded py-1 font-semibold capitalize ${side === s ? (s === 'buy' ? 'bg-gain text-white' : 'bg-loss text-white') : ''}`}>{s}</button>)}
            </div>
            <div className="flex items-center justify-between"><span className="label mb-0">Amount</span><Segmented size="xs" value={mode} onChange={setMode} options={[{ value: 'dollars', label: 'USD' }, { value: 'shares', label: 'Units' }]} /></div>
            <input className="input num" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount" />
            <p className="num text-xs muted">Open {fmtPrice(px)} → {fmtQty(qty)} units, fee {fmtUsd(qty * (px ?? 0) * state.feeBps / 10_000)}</p>
            <button className="btn-primary w-full" disabled={!px || qty <= 0 || state.finished} onClick={doTrade}>Place {side} order</button>
            {msg && <p className="text-xs">{msg}</p>}
          </div>
        </Panel>

        <Panel title="Holdings" bodyClass="p-0">
          {Object.keys(state.qty).length === 0 ? <p className="p-4 text-sm muted">All cash.</p> : (
            <table className="table">
              <thead><tr><th>Asset</th><th className="text-right">Units</th><th className="text-right">Value at open</th></tr></thead>
              <tbody>{Object.entries(state.qty).map(([s, q]) => {
                const p = openPrice(assets[s], state);
                return <tr key={s}><td className="font-medium">{s}</td><td className="text-right">{fmtQty(q)}</td><td className="text-right">{p ? fmtUsd(q * p) : 'no session'}</td></tr>;
              })}</tbody>
            </table>
          )}
        </Panel>

        <Panel title="Event log">
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {[...state.events].reverse().map((e, i) => <li key={i}><span className="num muted">{e.date}</span> {e.text}</li>)}
            {[...state.trades].reverse().slice(0, 30).map((t, i) => <li key={`t${i}`}><span className="num muted">{t.date}</span> {t.side} {fmtQty(t.quantity)} {t.symbol} @ {fmtPrice(t.price)}</li>)}
          </ul>
          {notes.map((n) => <p key={n} className="mt-1 text-[11px] muted">{n}</p>)}
        </Panel>
        <button className="btn-ghost text-xs" onClick={onQuit}><RotateCcw className="h-3.5 w-3.5" /> Abandon and set up a new simulation</button>
      </div>
    </div>
  );
}

function Retrospective({ state, assets, bench, onRestart, onBack, nav }: { state: TMState; assets: Record<string, TMAsset>; bench: Bar[] | null; onRestart: () => void; onBack: () => void; nav: Nav }) {
  const [rf, setRf] = useState<Array<{ date: string; value: number }> | null>(null);
  useEffect(() => { getFred('DTB3').then((d) => setRf(d.points)).catch(() => setRf([])); }, []);
  const eq = state.equity;
  const benchSeries = useMemo(() => {
    if (!bench || !eq.length) return null;
    const first = bench.find((b) => b.date >= eq[0].date);
    if (!first) return null;
    return bench.filter((b) => b.date >= eq[0].date && b.date <= eq[eq.length - 1].date).map((b) => ({ date: b.date, value: (b.adjClose / first.adjOpen) * state.capital }));
  }, [bench, eq, state.capital]);
  if (eq.length < 2) {
    return <Panel title="Retrospective"><p className="text-sm muted">Advance at least two sessions before reviewing.</p><button className="btn-outline mt-3" onClick={onBack}>Back to the simulation</button></Panel>;
  }
  const rfArr = riskFreePerPeriod(eq.map((e) => e.date), rf ?? []);
  const m = computeMetrics(eq, benchSeries, rfArr);
  const mb = benchSeries ? computeMetrics(benchSeries, null, riskFreePerPeriod(benchSeries.map((e) => e.date), rf ?? [])) : null;
  const bm = new Map((benchSeries ?? []).map((p) => [p.date, p.value]));
  const data = eq.map((e) => ({ date: e.date, Portfolio: e.value, 'SPY buy-and-hold': bm.get(e.date) ?? null }));
  const end = eq[eq.length - 1].date;
  const after = Object.values(assets).map((a) => {
    const atEnd = a.bars.filter((b) => b.date <= end).at(-1);
    const last = a.bars.at(-1);
    return { s: a.symbol, r: atEnd && last && last.date > end ? last.adjClose / atEnd.adjClose - 1 : null, last: last?.date };
  });

  const rows: Array<[string, string, (x: typeof m) => string]> = [
    ['Cumulative return', '', (x) => fmtFrac(x.cumulative)], ['Annualized return', 'cagr', (x) => fmtFrac(x.annualized)],
    ['Volatility', 'vol', (x) => fmtFrac(x.volatility, 2, false)], ['Sharpe ratio', 'sharpe', (x) => x.sharpe?.toFixed(2) ?? '—'],
    ['Sortino ratio', 'sortino', (x) => x.sortino?.toFixed(2) ?? '—'], ['Maximum drawdown', 'mdd', (x) => fmtFrac(x.maxDrawdown)],
  ];

  return (
    <div className="space-y-4">
      <Panel title={`Retrospective: ${fmtDate(eq[0].date)} to ${fmtDate(end)}`} actions={<><button className="btn-outline text-xs" onClick={onBack} disabled={state.finished}>Continue simulation</button><button className="btn-primary text-xs" onClick={onRestart}>New simulation</button></>}>
        <TimeLines data={data} keys={[{ key: 'Portfolio', label: 'Your portfolio' }, { key: 'SPY buy-and-hold', label: 'SPY buy-and-hold (total return)', dashed: true }]} format={(v) => fmtUsd(v)} />
        <DrawdownChart data={drawdownSeries(eq)} />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <table className="table">
            <thead><tr><th>Statistic</th><th className="text-right">Portfolio</th><th className="text-right">SPY</th></tr></thead>
            <tbody>
              {rows.map(([label, info, f]) => <tr key={label}><td className="flex items-center gap-1">{label}{info && <InfoTip id={info} />}</td><td className="text-right">{f(m)}</td><td className="text-right">{mb ? f(mb) : '—'}</td></tr>)}
              <tr><td className="flex items-center gap-1">Beta vs SPY<InfoTip id="beta" /></td><td className="text-right">{m.beta?.toFixed(2) ?? '—'}</td><td className="text-right">1.00</td></tr>
              <tr><td>Trades / fees paid</td><td className="text-right">{state.trades.length} / {fmtUsd(state.trades.reduce((s, t) => s + t.fee, 0))}</td><td className="text-right">1 / —</td></tr>
            </tbody>
          </table>
          <div>
            <p className="mb-1 text-sm font-medium">What happened next</p>
            <p className="mb-2 text-xs muted">Now that the simulation is over, future prices are no longer hidden. Total return from your end date to the latest available close:</p>
            <ul className="num space-y-1 text-sm">
              {after.map((x) => <li key={x.s} className="flex justify-between"><button className="font-medium hover:text-accent" onClick={() => nav.openAsset(x.s, assets[x.s].kind)}>{x.s}</button><span className={toneClass(x.r)}>{x.r == null ? 'no later data' : `${fmtFrac(x.r)} to ${x.last}`}</span></li>)}
            </ul>
          </div>
        </div>
        <SourceLine>
          {m.insufficient ? `Only ${m.observations} daily returns: annualized statistics are withheld below 30. ` : ''}Your equity is marked at as-traded closes with dividends as cash.
          SPY benchmark is bought at the adjusted open of the first session and valued at adjusted closes (dividends reinvested). Risk-free rate: FRED DTB3{rf && rf.length ? '' : ' (unavailable; 0% used)'}.
        </SourceLine>
      </Panel>
    </div>
  );
}

/* ====================================================================== */
/* Financial Crisis Explorer                                               */
/* ====================================================================== */

function CrisisExplorer({ nav }: { nav: Nav }) {
  const [id, setId] = useState(CRISES[0].id);
  const c = CRISES.find((x) => x.id === id)!;
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Panel title="Events" bodyClass="p-1" className="self-start">
        {CRISES.map((x) => (
          <button key={x.id} onClick={() => setId(x.id)} className={`block w-full rounded px-3 py-2 text-left text-sm ${x.id === id ? 'bg-accent/10 font-medium text-accent' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
            {x.title}
          </button>
        ))}
      </Panel>
      <CrisisDetail key={c.id} c={c} nav={nav} />
    </div>
  );
}

function CrisisDetail({ c, nav }: { c: Crisis; nav: Nav }) {
  const { account } = useAccount();
  const items = useMemo(() => {
    const m = new Map<string, { symbol: string; kind: AssetKind }>();
    c.instruments.forEach((i) => m.set(`${i.kind}:${i.symbol}`, i));
    m.set('equity:SPY', { symbol: 'SPY', kind: 'equity' });
    Object.values(account.positions).forEach((p) => m.set(`${p.kind}:${p.symbol}`, p));
    return [...m.values()];
  }, [c, account.positions]);
  const hist = useHistories(items);

  const inWindow = (bars: Bar[] | undefined, from: string, to: string) => (bars ?? []).filter((b) => b.date >= from && b.date <= to);

  const stats = c.instruments.map((ins) => {
    const h = hist[`${ins.kind}:${ins.symbol}`];
    const bars = h?.data?.bars;
    const stress = inWindow(bars, c.stress.start, c.stress.end);
    const pre = (bars ?? []).filter((b) => b.date < c.stress.start).slice(-61);
    const ok = stress.length > 5 && stress[0].date <= addDays(c.stress.start, 7);
    const s = stress.map((b) => ({ date: b.date, value: b.adjClose }));
    const ppy = ins.kind === 'crypto' ? 365 : 252;
    return {
      ins, h, ok,
      ret: ok ? s[s.length - 1].value / s[0].value - 1 : null,
      mdd: ok ? maxDrawdown(s).mdd : null,
      volPre: pre.length > 30 ? annualizedVolatility(returns(pre.map((b) => b.adjClose)), ppy) : null,
      volIn: ok && s.length > 20 ? annualizedVolatility(returns(s.map((p) => p.value)), ppy) : null,
      worst: ok ? Math.min(...returns(s.map((p) => p.value))) : null,
    };
  });

  const chart = useMemo(() => {
    const series = c.instruments.map((ins) => inWindow(hist[`${ins.kind}:${ins.symbol}`]?.data?.bars, c.window.start, c.window.end));
    const byDate = new Map<string, TimeRow>();
    series.forEach((bars, i) => {
      if (!bars.length) return;
      const base = bars[0].adjClose;
      bars.forEach((b) => {
        const row = byDate.get(b.date) ?? ({ date: b.date } as TimeRow);
        row[c.instruments[i].symbol] = (b.adjClose / base) * 100;
        byDate.set(b.date, row);
      });
    });
    // keep US sessions only when any equity is present so crypto weekends do not create gaps
    const hasEq = c.instruments.some((i) => i.kind === 'equity');
    const eqDates = hasEq ? new Set(series.flatMap((bars, i) => (c.instruments[i].kind === 'equity' ? bars.map((b) => b.date) : []))) : null;
    return [...byDate.values()].filter((r) => !eqDates || eqDates.has(r.date as string)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [hist, c]);

  // "What would have happened to your portfolio?"
  const [useMine, setUseMine] = useState(Object.keys(account.positions).length > 0);
  const [custom, setCustom] = useState<Record<string, number>>(() => ({ 'equity:SPY': 60, 'equity:TLT': 40 }));
  const customItems = useMemo(() => [{ symbol: 'TLT', kind: 'equity' as const }, { symbol: 'GLD', kind: 'equity' as const }, ...items], [items]);
  const customHist = useHistories(customItems);
  const weights: Record<string, number> = useMemo(() => {
    if (useMine) {
      const out: Record<string, number> = {};
      Object.entries(account.positions).forEach(([k, p]) => (out[k] = p.costBasis));
      return out;
    }
    return custom;
  }, [useMine, account.positions, custom]);

  const scenario = useMemo(() => {
    const keys = Object.keys(weights).filter((k) => weights[k] > 0);
    if (!keys.length) return null;
    const usable: string[] = [], excluded: string[] = [];
    for (const k of keys) {
      const bars = (customHist[k] ?? hist[k])?.data?.bars;
      const w = inWindow(bars, c.stress.start, c.stress.end);
      if (w.length > 5 && w[0].date <= addDays(c.stress.start, 7)) usable.push(k); else excluded.push(k.split(':')[1]);
    }
    if (!usable.length) return { excluded, result: null };
    const tot = usable.reduce((s, k) => s + weights[k], 0);
    const { dates, values } = alignOnDates(usable.map((k) => inWindow((customHist[k] ?? hist[k])!.data!.bars, c.stress.start, c.stress.end).map((b) => ({ date: b.date, value: b.adjClose }))));
    if (dates.length < 2) return { excluded, result: null };
    const port = dates.map((d, t) => ({ date: d, value: usable.reduce((s, k, i) => s + (weights[k] / tot) * 100_000 * (values[i][t] / values[i][0]), 0) }));
    const spy = inWindow(hist['equity:SPY']?.data?.bars, c.stress.start, c.stress.end);
    const spyMap = new Map(spy.map((b) => [b.date, b.adjClose]));
    const s0 = spyMap.get(dates[0]);
    const spyRet = s0 && spyMap.get(dates[dates.length - 1]) ? spyMap.get(dates[dates.length - 1])! / s0 - 1 : null;
    return { excluded, result: { ret: port[port.length - 1].value / 100_000 - 1, mdd: maxDrawdown(port).mdd, final: port[port.length - 1].value, spyRet, from: dates[0], to: dates[dates.length - 1], weights: usable.map((k) => [k.split(':')[1], weights[k] / tot] as const) } };
  }, [weights, customHist, hist, c]);

  const anyConfig = Object.values(hist).find((h) => h.state === 'config-required');

  return (
    <div className="min-w-0 space-y-4">
      <Panel title={c.title}>
        <p className="text-sm leading-relaxed">{c.context}</p>
        {c.dataNote && <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs dark:bg-navy">{c.dataNote}</p>}
        <div className="mt-4">
          {anyConfig && <div className="mb-3"><DataNotice state="config-required" message={anyConfig.message} onOpenSettings={nav.openSettings} /></div>}
          {chart.length > 1 ? (
            <TimeLines data={chart} keys={c.instruments.map((i) => ({ key: i.symbol, label: i.symbol }))} format={(v) => v.toFixed(0)} shade={[{ from: firstOnOrAfter(chart, c.stress.start), to: lastOnOrBefore(chart, c.stress.end) }]} height={300} />
          ) : (
            <DataNotice state={Object.values(hist).some((h) => h.state === 'loading') ? 'loading' : 'unavailable'} message="No price history loaded for this window." />
          )}
          <SourceLine>Total-return index (adjusted closes), rebased to 100 at {fmtDate(c.window.start)}. Shaded: acute phase {fmtDate(c.stress.start)} to {fmtDate(c.stress.end)}.</SourceLine>
        </div>
      </Panel>

      <Panel title="Market behaviour during the acute phase" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Instrument</th><th>Role</th><th className="text-right">Return</th><th className="text-right">Max drawdown</th><th className="text-right">Worst day</th><th className="text-right">Vol before</th><th className="text-right">Vol during</th></tr></thead>
            <tbody>{stats.map((s) => (
              <tr key={s.ins.symbol}>
                <td className="font-semibold">{s.ins.symbol}</td><td className="whitespace-normal text-xs muted">{s.ins.why}</td>
                {s.ok ? (<>
                  <td className={`text-right ${toneClass(s.ret)}`}>{fmtFrac(s.ret)}</td><td className="text-right text-loss">{fmtFrac(s.mdd)}</td>
                  <td className="text-right text-loss">{fmtFrac(s.worst)}</td><td className="text-right">{fmtFrac(s.volPre, 1, false)}</td><td className="text-right">{fmtFrac(s.volIn, 1, false)}</td>
                </>) : <td colSpan={5} className="text-right text-xs muted">{s.h?.state === 'loading' ? 'Loading…' : s.h?.message && s.h.state !== 'eod' ? s.h.message : 'No price data for this period (asset not trading on the data source).'}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="px-4 pb-3"><SourceLine>Returns from adjusted closes. Volatility annualized from daily returns: "before" = 60 sessions preceding the acute phase. Worst day = most negative close-to-close return.</SourceLine></div>
      </Panel>

      <Panel title="What would have happened to your portfolio during this event?">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <Segmented value={useMine ? 'mine' : 'custom'} onChange={(v) => setUseMine(v === 'mine')} options={[{ value: 'mine', label: 'My current holdings' }, { value: 'custom', label: 'Custom weights' }]} />
          {useMine && !Object.keys(account.positions).length && <span className="text-xs muted">You hold no positions yet; switch to custom weights.</span>}
        </div>
        {!useMine && (
          <div className="mb-3 flex flex-wrap gap-3">
            {customItems.map((i) => {
              const k = `${i.kind}:${i.symbol}`;
              return (
                <label key={k} className="flex items-center gap-1 text-sm"><span className="w-12 font-medium">{i.symbol}</span>
                  <input className="input w-16 py-1 text-xs num" type="number" min={0} max={100} value={custom[k] ?? 0} onChange={(e) => setCustom({ ...custom, [k]: Math.max(0, Number(e.target.value)) })} />%</label>
              );
            })}
          </div>
        )}
        {scenario?.result ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="$100,000 became" value={fmtUsd(scenario.result.final)} tone={toneClass(scenario.result.ret)} sub={`${fmtDate(scenario.result.from)} to ${fmtDate(scenario.result.to)}`} />
            <Stat label="Portfolio return" value={fmtFrac(scenario.result.ret)} tone={toneClass(scenario.result.ret)} />
            <Stat label="Max drawdown" info="mdd" value={fmtFrac(scenario.result.mdd)} tone="text-loss" />
            <Stat label="S&P 500 (SPY) return" value={fmtFrac(scenario.result.spyRet)} tone={toneClass(scenario.result.spyRet)} />
            <p className="text-xs muted md:col-span-4">
              Weights used: {scenario.result.weights.map(([s, w]) => `${s} ${(w * 100).toFixed(0)}%`).join(', ')}{useMine ? ' (by current cost basis)' : ''}. Buy-and-hold from the first common session, adjusted closes, no rebalancing or fees.
              {scenario.excluded.length > 0 && <> Excluded for lack of data in this window: {scenario.excluded.join(', ')}; remaining weights were rescaled.</>}
            </p>
          </div>
        ) : (
          <p className="text-sm muted">{scenario?.excluded.length ? `None of the selected assets has price data in this window (${scenario.excluded.join(', ')}).` : 'Choose weights to evaluate.'}</p>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Timeline">
          <ol className="space-y-2 text-sm">{c.timeline.map((t) => <li key={t.date} className="grid grid-cols-[96px_1fr] gap-2"><span className="num text-xs muted">{fmtDate(t.date)}</span><span>{t.text}</span></li>)}</ol>
        </Panel>
        <Panel title="Academic explanation">
          <p className="text-sm leading-relaxed">{c.explanation}</p>
          <p className="mb-1 mt-3 text-xs font-medium muted">Sources</p>
          <ul className="space-y-1 text-xs">{c.references.map((r) => <li key={r.label}>{r.label}{r.url && <> <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href={r.url} target="_blank" rel="noreferrer">link <ExternalLink className="h-3 w-3" /></a></>}</li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}

function addDays(d: string, n: number) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10); }
function firstOnOrAfter(rows: Array<Record<string, unknown>>, d: string) { return (rows.find((r) => (r.date as string) >= d)?.date as string) ?? d; }
function lastOnOrBefore(rows: Array<Record<string, unknown>>, d: string) { return ([...rows].reverse().find((r) => (r.date as string) <= d)?.date as string) ?? d; }
