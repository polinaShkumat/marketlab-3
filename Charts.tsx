import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDarkMode } from '../lib/hooks';

export const SERIES_COLORS = ['#4169E1', '#16A085', '#D19A2A', '#7B61C9', '#E05A5A', '#2E9CCA', '#8C6D46', '#C2577A'];

export function useAxisColors() {
  const dark = useDarkMode();
  return { text: dark ? '#94A3B8' : '#64748B', grid: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)', tooltipBg: dark ? '#182235' : '#FFFFFF', border: dark ? '#334155' : '#E2E8F0' };
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
/** Axis ticks stay short so they never get clipped; tooltips keep full precision. */
export const axisTick = (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));

export interface TimeRow { date: string; [k: string]: number | string | null }

export function TimeLines({ data, keys, height = 280, format = (v: number) => v.toFixed(2), shade, yDomain }: {
  data: TimeRow[]; keys: Array<{ key: string; label: string; color?: string; axis?: 'left' | 'right'; dashed?: boolean }>; height?: number;
  format?: (v: number) => string; shade?: Array<{ from: string; to: string }>; yDomain?: [number | 'auto', number | 'auto'];
}) {
  const c = useAxisColors();
  const hasRight = keys.some((k) => k.axis === 'right');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: hasRight ? 8 : 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: c.text, fontSize: 11 }} minTickGap={48} tickLine={false} axisLine={{ stroke: c.border }} />
        <YAxis yAxisId="left" tick={{ fill: c.text, fontSize: 11 }} tickFormatter={axisTick} width={56} tickLine={false} axisLine={false} domain={yDomain ?? ['auto', 'auto']} />
        {hasRight && <YAxis yAxisId="right" orientation="right" tick={{ fill: c.text, fontSize: 11 }} tickFormatter={axisTick} width={56} tickLine={false} axisLine={false} domain={['auto', 'auto']} />}
        <Tooltip contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12 }} formatter={(v: number) => (typeof v === 'number' ? format(v) : v)} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {shade?.map((s, i) => <ReferenceArea key={i} yAxisId="left" x1={s.from} x2={s.to} fill="#94A3B8" fillOpacity={0.15} ifOverflow="extendDomain" />)}
        {keys.map((k, i) => (
          <Line key={k.key} yAxisId={k.axis ?? 'left'} type="monotone" dataKey={k.key} name={k.label} stroke={k.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={1.6} dot={false} connectNulls={false} isAnimationActive={false} strokeDasharray={k.dashed ? '4 3' : undefined} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({ data, height = 160 }: { data: Array<{ date: string; value: number }>; height?: number }) {
  const c = useAxisColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: c.text, fontSize: 11 }} minTickGap={48} tickLine={false} axisLine={{ stroke: c.border }} />
        <YAxis tick={{ fill: c.text, fontSize: 11 }} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} width={64} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12 }} formatter={(v: number) => `${(v * 100).toFixed(2)}%`} />
        <Area type="monotone" dataKey="value" name="Drawdown" stroke="#E05A5A" fill="#E05A5A" fillOpacity={0.18} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Correlation heatmap rendered as an HTML grid (readable values, accessible). */
export function CorrelationMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const color = (v: number) => {
    const a = Math.min(1, Math.abs(v));
    return v >= 0 ? `rgba(65,105,225,${0.12 + a * 0.75})` : `rgba(224,90,90,${0.12 + a * 0.75})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="num border-separate border-spacing-0.5 text-xs">
        <thead><tr><th />{labels.map((l) => <th key={l} className="px-1 pb-1 font-medium muted">{l}</th>)}</tr></thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th className="pr-2 text-right font-medium muted">{labels[i]}</th>
              {row.map((v, j) => (
                <td key={j} className="h-9 w-14 rounded text-center font-medium" style={{ background: color(v), color: Math.abs(v) > 0.55 ? 'white' : undefined }} title={`${labels[i]} / ${labels[j]}: ${v.toFixed(3)}`}>
                  {Number.isFinite(v) ? v.toFixed(2) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
