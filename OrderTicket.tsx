import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { AssetKind, Bar, Quote } from '../types';
import { useAccount } from '../store';
import { availableCash, availableShares, feeFor, type Order, type PriceRef } from '../lib/portfolio';
import { equityMarketStatus, quoteFreshness, sessionDateOf } from '../lib/market';
import { fmtDateTime, fmtPrice, fmtQty, fmtUsd } from '../lib/format';
import { Segmented } from './ui';

export function referencePrice(kind: AssetKind, quote: Quote | null, bars: Bar[] | null): (PriceRef & { label: string }) | null {
  if (quote) {
    return { price: quote.price, asOf: quote.asOf, basis: quote.basis, sessionDate: sessionDateOf(kind, quote.asOf), label: `${quote.provider}, ${quoteFreshness(quote).label}` };
  }
  const last = bars?.at(-1);
  if (last) return { price: last.close, asOf: `${last.date}T21:00:00Z`, basis: 'eod-close', sessionDate: last.date, label: `Close of ${last.date} (end-of-day)` };
  return null;
}

export default function OrderTicket({ symbol, kind, quote, bars }: { symbol: string; kind: AssetKind; quote: Quote | null; bars: Bar[] | null }) {
  const { account, submit, cancel } = useAccount();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [mode, setMode] = useState<'shares' | 'dollars'>('dollars');
  const [amount, setAmount] = useState('5000');
  const [limit, setLimit] = useState('');
  const [review, setReview] = useState(false);
  const [result, setResult] = useState<Order | null>(null);

  const ref = referencePrice(kind, quote, bars);
  const status = equityMarketStatus();
  const pricing = type === 'limit' && Number(limit) > 0 ? Number(limit) : ref?.price ?? 0;
  const qty = useMemo(() => {
    const a = Number(amount);
    if (!(a > 0) || !(pricing > 0)) return 0;
    return Math.floor((mode === 'shares' ? a : a / pricing) * 1e6) / 1e6;
  }, [amount, mode, pricing]);
  const notional = qty * pricing;
  const fee = feeFor(notional, account.feeBps);
  const cash = availableCash(account);
  const shares = availableShares(account, kind, symbol);
  const unit = kind === 'crypto' ? symbol : 'shares';

  const problems: string[] = [];
  if (!ref) problems.push('No executable reference price is available for this asset right now.');
  if (qty <= 0) problems.push('Enter a quantity greater than zero.');
  if (type === 'limit' && !(Number(limit) > 0)) problems.push('Enter a limit price.');
  if (side === 'buy' && notional + fee > cash + 1e-9) problems.push(`Insufficient available cash (${fmtUsd(cash)}).`);
  if (side === 'sell' && qty > shares + 1e-9) problems.push(`You can sell at most ${fmtQty(shares)} ${unit}.`);

  const warnings: string[] = [];
  if (ref && ref.basis === 'eod-close') warnings.push('Using the last end-of-day close as the reference price; the actual next trade could differ.');
  if (ref && quote && quoteFreshness(quote).state === 'delayed') warnings.push('The reference quote is delayed. A real order would execute at a different price.');
  if (kind === 'equity' && !status.open) warnings.push(`US equity market is ${status.label.toLowerCase()}. A market order fills at the latest available price shown, which a real broker could not guarantee.`);
  if (quote?.basis === 'iex-last') warnings.push('IEX last trade is from a single venue and may differ from the consolidated price.');

  const pending = account.orders.filter((o) => o.status === 'pending' && o.symbol === symbol && o.kind === kind);
  const held = account.positions[`${kind}:${symbol}`];

  const confirm = () => {
    if (!ref || problems.length) return;
    const order = submit({ symbol, kind, side, type, quantity: qty, limitPrice: type === 'limit' ? Number(limit) : null }, ref);
    setResult(order);
    setReview(false);
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 dark:bg-navy">
        {(['buy', 'sell'] as const).map((s) => (
          <button key={s} onClick={() => { setSide(s); setReview(false); setResult(null); }}
            className={`rounded py-1.5 text-sm font-semibold capitalize ${side === s ? (s === 'buy' ? 'bg-gain text-white' : 'bg-loss text-white') : 'text-slate-600 dark:text-slate-300'}`}>{s}</button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="label mb-0">Order type</span>
        <Segmented value={type} onChange={(v) => { setType(v); setReview(false); }} options={[{ value: 'market', label: 'Market' }, { value: 'limit', label: 'Limit' }]} />
      </div>

      {type === 'limit' && (
        <div>
          <label className="label" htmlFor="lp">Limit price (USD)</label>
          <input id="lp" className="input num" inputMode="decimal" value={limit} placeholder={ref ? fmtPrice(ref.price) : ''} onChange={(e) => { setLimit(e.target.value); setReview(false); }} />
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="label mb-0" htmlFor="amt">{mode === 'dollars' ? 'Amount (USD)' : `Quantity (${unit})`}</label>
          <Segmented size="xs" value={mode} onChange={(v) => { setMode(v); setAmount(''); setReview(false); }} options={[{ value: 'dollars', label: 'USD' }, { value: 'shares', label: kind === 'crypto' ? 'Units' : 'Shares' }]} />
        </div>
        <input id="amt" className="input num" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setReview(false); }} />
      </div>

      <dl className="num space-y-1 rounded-md bg-slate-50 p-3 text-[13px] dark:bg-navy">
        <Row k="Reference price" v={ref ? fmtPrice(ref.price) : '—'} />
        <p className="text-[11px] muted">{ref ? `${ref.label}, observed ${fmtDateTime(ref.asOf)}` : 'No price available'}</p>
        <Row k="Quantity" v={`${fmtQty(qty)} ${unit}`} />
        <Row k={`Estimated ${side === 'buy' ? 'cost' : 'proceeds'}`} v={fmtUsd(notional)} />
        <Row k={`Estimated fee (${account.feeBps} bps)`} v={fmtUsd(fee)} />
        <Row k={side === 'buy' ? 'Total debit' : 'Net credit'} v={fmtUsd(side === 'buy' ? notional + fee : notional - fee)} strong />
        <Row k="Available cash" v={fmtUsd(cash)} />
        {side === 'sell' && <Row k="Available to sell" v={`${fmtQty(shares)} ${unit}`} />}
      </dl>

      {warnings.length > 0 && (
        <ul className="space-y-1 text-[12px] text-amber-800 dark:text-amber-300">
          {warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}
        </ul>
      )}

      {!review ? (
        <button className="btn-primary w-full py-2" disabled={problems.length > 0} onClick={() => { setReview(true); setResult(null); }}>
          Review {side} order
        </button>
      ) : (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
          <p className="mb-2">
            {side === 'buy' ? 'Buy' : 'Sell'} <b className="num">{fmtQty(qty)} {unit}</b> of {symbol}{' '}
            {type === 'market' ? <>at the reference price <b className="num">{fmtPrice(ref?.price)}</b></> : <>with a limit of <b className="num">{fmtPrice(Number(limit))}</b></>}.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={confirm} disabled={problems.length > 0}>Confirm order</button>
            <button className="btn-outline" onClick={() => setReview(false)}>Edit</button>
          </div>
        </div>
      )}
      {problems.length > 0 && amount !== '' && <p className="text-[12px] text-loss">{problems[0]}</p>}

      {result && (
        <div className={`flex gap-2 rounded-md p-3 text-[13px] ${result.status === 'rejected' ? 'bg-loss/10 text-loss' : 'bg-gain/10 text-gain'}`} role="status">
          {result.status === 'rejected' ? <XCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>
            {result.status === 'filled' && <>Filled: {result.side} {fmtQty(result.quantity)} {result.symbol} at {fmtPrice(result.fillPrice)}, fee {fmtUsd(result.fee)}.</>}
            {result.status === 'pending' && <>Limit order resting at {fmtPrice(result.limitPrice)}. It fills when later market data reaches your price.</>}
            {result.status === 'rejected' && <>Rejected: {result.note}</>}
          </span>
        </div>
      )}

      {held && (
        <div className="num rounded-md border border-slate-200 p-3 text-[13px] dark:border-slate-700">
          <p className="mb-1 font-medium">Your position</p>
          <Row k="Holding" v={`${fmtQty(held.quantity)} ${unit}`} />
          <Row k="Average cost" v={fmtPrice(held.costBasis / held.quantity)} />
          {ref && <Row k="Unrealized P&L" v={fmtUsd(held.quantity * ref.price - held.costBasis)} />}
        </div>
      )}

      {pending.length > 0 && (
        <div className="text-[13px]">
          <p className="mb-1 font-medium">Resting limit orders</p>
          {pending.map((o) => (
            <div key={o.id} className="num flex items-center justify-between border-t border-slate-100 py-1.5 dark:border-slate-700">
              <span className="capitalize">{o.side} {fmtQty(o.quantity)} @ {fmtPrice(o.limitPrice)}</span>
              <button className="text-xs text-loss hover:underline" onClick={() => cancel(o.id)}>Cancel order</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className="flex justify-between gap-2"><dt className="muted">{k}</dt><dd className={strong ? 'font-semibold' : ''}>{v}</dd></div>;
}
