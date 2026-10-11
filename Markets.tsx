import { useMemo, useState } from 'react';
import type { Nav } from '../App';
import { Panel, SourceLine, StatusBadge, Segmented } from '../components/ui';
import { UNIVERSE, equityMarketStatus, quoteFreshness } from '../lib/market';
import { useQuotes } from '../lib/hooks';
import { fmtCompact, fmtDateTime, fmtPct, fmtPrice, fmtSigned, fmtUsdCompact, toneClass } from '../lib/format';

type SortKey = 'symbol' | 'changePct' | 'marketCap';

export default function Markets({ nav }: { nav: Nav }) {
  const [group, setGroup] = useState<'all' | 'Stocks' | 'ETFs' | 'Crypto' | 'Reference'>('all');
  const [sort, setSort] = useState<SortKey>('symbol');
  const { quotes, lastUpdate } = useQuotes(UNIVERSE, 60_000);
  const status = equityMarketStatus();
  const rows = useMemo(() => {
    const list = UNIVERSE.filter((a) => group === 'all' || a.group === group).map((a) => ({ a, e: quotes[`${a.kind}:${a.symbol}`] }));
    return list.sort((x, y) => {
      if (sort === 'symbol') return x.a.symbol.localeCompare(y.a.symbol);
      const vx = x.e?.quote?.[sort] ?? -Infinity, vy = y.e?.quote?.[sort] ?? -Infinity;
      return (vy as number) - (vx as number);
    });
  }, [quotes, group, sort]);

  return (
    <Panel
      title="Markets"
      bodyClass="p-0"
      actions={
        <>
          <Segmented value={group} onChange={setGroup} options={[{ value: 'all', label: 'All' }, { value: 'Stocks', label: 'Stocks' }, { value: 'ETFs', label: 'ETFs' }, { value: 'Crypto', label: 'Crypto' }, { value: 'Reference', label: 'Reference' }]} />
          <Segmented value={sort} onChange={setSort} options={[{ value: 'symbol', label: 'A–Z' }, { value: 'changePct', label: 'Change' }, { value: 'marketCap', label: 'Market cap' }]} />
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Symbol</th><th>Name</th><th className="text-right">Last</th><th className="text-right">Change</th><th className="text-right">%</th>
              <th className="text-right">Volume</th><th className="text-right">Market cap</th><th>Market</th><th>Observed</th><th>Source</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, e }) => {
              const q = e?.quote;
              return (
                <tr key={`${a.kind}:${a.symbol}`} className="cursor-pointer" onClick={() => nav.openAsset(a.symbol, a.kind)}>
                  <td className="font-semibold">{a.symbol}</td>
                  <td className="max-w-[240px] truncate muted">{a.name}</td>
                  <td className="text-right">{fmtPrice(q?.price)}</td>
                  <td className={`text-right ${toneClass(q?.change)}`}>{fmtSigned(q?.change)}</td>
                  <td className={`text-right ${toneClass(q?.changePct)}`}>{fmtPct(q?.changePct)}{a.kind === 'crypto' && q ? ' 24h' : ''}</td>
                  <td className="text-right" title={q?.volumeLabel}>{fmtCompact(q?.volume)}</td>
                  <td className="text-right">{fmtUsdCompact(q?.marketCap)}</td>
                  <td className="muted">{a.kind === 'crypto' ? '24/7' : status.label}</td>
                  <td className="muted">{fmtDateTime(q?.asOf)}</td>
                  <td className="muted">{q?.provider ?? '—'}</td>
                  <td>{!e ? <StatusBadge state="loading" /> : q ? <StatusBadge state={e.state} label={quoteFreshness(q).label} /> : <StatusBadge state={e.state} title={e.message ?? undefined} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3">
        <SourceLine>
          Quotes refresh every 60 seconds (last refresh {fmtDateTime(lastUpdate)}). Equity prices are the IEX last trade when available (single venue), otherwise the last
          consolidated close. Volume for equities is IEX-venue volume unless marked otherwise; hover for the definition. Market capitalization requires the optional
          Finnhub (equities) or CoinGecko (crypto) key and is shown as — when unavailable. Status is derived from each observation's timestamp.
        </SourceLine>
      </div>
    </Panel>
  );
}
