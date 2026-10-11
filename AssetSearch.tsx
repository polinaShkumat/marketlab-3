import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { UNIVERSE, registerAsset } from '../lib/market';
import { searchAssets, type SearchResult } from '../lib/api';
import type { AssetKind } from '../types';

/** Searches the built-in universe instantly, then provider search for anything else. */
export default function AssetSearch({ onSelect, placeholder = 'Search symbol or company' }: { onSelect: (symbol: string, kind: AssetKind) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const local = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return UNIVERSE.filter((a) => a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)).slice(0, 8);
  }, [q]);

  useEffect(() => {
    const s = q.trim();
    setRemote([]); setNote(null);
    if (s.length < 2) return;
    const t = window.setTimeout(() => {
      searchAssets(s)
        .then((r) => { setRemote(r.results.filter((x) => !UNIVERSE.some((u) => u.symbol === x.symbol && u.kind === x.kind))); setNote(r.notes[0] ?? null); })
        .catch((e) => setNote(e.message));
    }, 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const pick = (symbol: string, kind: AssetKind, name: string) => {
    registerAsset({ symbol, kind, name, group: kind === 'crypto' ? 'Crypto' : 'Stocks' });
    onSelect(symbol, kind);
    setQ(''); setOpen(false);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
      <input
        className="input pl-8" value={q} placeholder={placeholder} aria-label="Search assets"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const f = local[0] ?? remote[0]; if (f) pick(f.symbol, f.kind, f.name); } }}
      />
      {open && q.trim() && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-charcoal">
          {[...local, ...remote].map((a) => (
            <button key={`${a.kind}:${a.symbol}`} onMouseDown={() => pick(a.symbol, a.kind, a.name)} className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40">
              <span><span className="font-semibold">{a.symbol}</span> <span className="muted">{a.name}</span></span>
              <span className="text-[11px] muted">{a.kind === 'crypto' ? 'Crypto' : 'Stock/ETF'}</span>
            </button>
          ))}
          {!local.length && !remote.length && <p className="px-3 py-2 text-sm muted">{q.trim().length < 2 ? 'Keep typing…' : 'No matches yet.'}</p>}
          {note && <p className="border-t border-slate-100 px-3 py-1.5 text-xs muted dark:border-slate-700">{note}</p>}
        </div>
      )}
    </div>
  );
}
