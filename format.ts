const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
const numCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export const fmtUsd = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : usd.format(v));
export const fmtUsdCompact = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : usdCompact.format(v));
export const fmtCompact = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : numCompact.format(v));

/** Price with precision that suits the magnitude (crypto under $1 needs more decimals). */
export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const d = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 2 : 4;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtPct(v: number | null | undefined, digits = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const x = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v; // avoid "-0.00%"
  return `${signed && x > 0 ? '+' : ''}${x.toFixed(digits)}%`;
}

/** Fraction (0.05) → "+5.00%" */
export const fmtFrac = (v: number | null | undefined, digits = 2, signed = true) =>
  v == null || !Number.isFinite(v) ? '—' : fmtPct(v * 100, digits, signed);

export function fmtSigned(v: number | null | undefined, fmt: (x: number) => string = fmtPrice): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const x = Math.abs(v) < 0.005 ? 0 : v;
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmt(Math.abs(x))}`;
}

export function fmtQty(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date.length === 10 ? date + 'T12:00:00Z' : date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export const toneClass = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) || v === 0 ? 'text-slate-500 dark:text-slate-400' : v > 0 ? 'text-gain' : 'text-loss';
