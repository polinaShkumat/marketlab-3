import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CircleDot, Info, KeyRound, Loader2, X } from 'lucide-react';
import type { DataState } from '../types';
import { GLOSSARY } from '../data/learning';

export function Panel({ title, actions, children, className = '', bodyClass = 'p-4' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          <h2 className="panel-title">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const STATE_STYLE: Record<DataState, { label: string; cls: string }> = {
  loading: { label: 'Loading', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300' },
  connected: { label: 'Real-time', cls: 'bg-gain/10 text-gain' },
  delayed: { label: 'Delayed', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  eod: { label: 'End-of-day', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300' },
  unavailable: { label: 'Data unavailable', cls: 'bg-loss/10 text-loss' },
  'rate-limited': { label: 'Rate limit reached', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  'config-required': { label: 'API key required', cls: 'bg-accent/10 text-accent' },
};

export function StatusBadge({ state, label, title }: { state: DataState; label?: string; title?: string }) {
  const s = STATE_STYLE[state];
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {state === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleDot className="h-3 w-3" />}
      {label ?? s.label}
    </span>
  );
}

/** Full explanation block for an empty or failed data region — never a fake value. */
export function DataNotice({ state, message, onOpenSettings }: { state: DataState; message: string | null; onOpenSettings?: () => void }) {
  if (state === 'loading') {
    return <div className="flex items-center gap-2 py-6 text-sm muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading data…</div>;
  }
  const icon = state === 'config-required' ? <KeyRound className="h-4 w-4 text-accent" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-slate-300 p-3 text-sm dark:border-slate-600">
      {icon}
      <div>
        <p className="font-medium">{STATE_STYLE[state].label}</p>
        {message && <p className="muted mt-0.5">{message}</p>}
        {state === 'config-required' && onOpenSettings && (
          <button className="mt-2 text-accent underline-offset-2 hover:underline" onClick={onOpenSettings}>Open data settings</button>
        )}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone, info }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string; info?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs muted">{label}{info && <InfoTip id={info} />}</div>
      <div className={`num mt-0.5 text-lg font-semibold ${tone ?? 'text-slate-900 dark:text-white'}`}>{value}</div>
      {sub && <div className="num text-xs muted">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'sm' }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; size?: 'xs' | 'sm' }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-navy">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-2 ${size === 'xs' ? 'py-0.5 text-[11px]' : 'py-1 text-xs'} font-medium transition-colors ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm dark:bg-charcoal dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Contextual glossary popover. */
export function InfoTip({ id }: { id: string }) {
  const g = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  if (!g) return null;
  return (
    <span ref={ref} className="relative inline-flex">
      <button aria-label={`About ${g.term}`} onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-accent">
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute left-1/2 top-5 z-50 w-80 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs leading-relaxed text-slate-700 shadow-lg dark:border-slate-600 dark:bg-charcoal dark:text-slate-200">
          <span className="mb-1 flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{g.term}</span>
            <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-3.5 w-3.5" /></button>
          </span>
          <span className="block">{g.measures}</span>
          <span className="my-1.5 block rounded bg-slate-50 px-2 py-1 font-medium text-slate-800 dark:bg-navy dark:text-slate-100">{g.formula}</span>
          <span className="block"><b>How it is used.</b> {g.use}</span>
          <span className="mt-1 block"><b>Limitations.</b> {g.limits}</span>
        </span>
      )}
    </span>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-navy/50 p-4 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="panel w-full max-w-xl shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="panel-head">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost px-1.5" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function SourceLine({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-snug muted">{children}</p>;
}
