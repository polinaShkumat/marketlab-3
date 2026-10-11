import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Nav, Page } from '../App';
import { GLOSSARY, MODULES, type Exercise } from '../data/learning';
import { Panel } from '../components/ui';

export default function Learn({ nav }: { nav: Nav }) {
  const [id, setId] = useState(MODULES[0].id);
  const m = MODULES.find((x) => x.id === id)!;
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Panel title="Learning Center" bodyClass="p-1" className="self-start">
        {MODULES.map((x, i) => (
          <button key={x.id} onClick={() => setId(x.id)} className={`flex w-full gap-2 rounded px-3 py-2 text-left text-sm ${x.id === id ? 'bg-accent/10 font-medium text-accent' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
            <span className="num w-4 muted">{i + 1}</span>{x.title}
          </button>
        ))}
      </Panel>
      <div className="min-w-0 space-y-4">
        <Panel title={m.title}>
          <p className="mb-4 text-sm muted">{m.summary}</p>
          <div className="max-w-3xl space-y-4">
            {m.sections.map((s) => (
              <section key={s.heading}>
                <h3 className="mb-1 text-[15px] font-semibold text-slate-900 dark:text-white">{s.heading}</h3>
                <p className="text-sm leading-relaxed">{s.body}</p>
              </section>
            ))}
          </div>
          {m.tryIt && <button className="btn-outline mt-4" onClick={() => nav.go(m.tryIt!.page as Page)}>{m.tryIt.label}</button>}
        </Panel>
        <Panel title="Exercises">
          <div className="space-y-5">{m.exercises.map((e, i) => <Quiz key={`${m.id}-${i}`} e={e} n={i + 1} />)}</div>
        </Panel>
        <Panel title="Reference: indicators and metrics used in MARKETLAB">
          <div className="grid gap-3 md:grid-cols-2">
            {Object.values(GLOSSARY).map((g) => (
              <div key={g.term} className="rounded-md border border-slate-200 p-3 text-xs leading-relaxed dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{g.term}</p>
                <p>{g.measures}</p>
                <p className="my-1 rounded bg-slate-50 px-2 py-1 dark:bg-navy">{g.formula}</p>
                <p className="muted">{g.limits}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Quiz({ e, n }: { e: Exercise; n: number }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{n}. {e.question}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {e.options.map((o, i) => {
          const chosen = pick === i, correct = i === e.answer;
          const cls = pick == null ? 'border-slate-200 hover:border-accent dark:border-slate-600' : correct ? 'border-gain bg-gain/10' : chosen ? 'border-loss bg-loss/10' : 'border-slate-200 opacity-60 dark:border-slate-600';
          return <button key={i} disabled={pick != null} onClick={() => setPick(i)} className={`rounded-md border px-3 py-1.5 text-left text-sm ${cls}`}>{o}</button>;
        })}
      </div>
      {pick != null && (
        <p className={`mt-2 flex gap-1.5 text-sm ${pick === e.answer ? 'text-gain' : 'text-loss'}`}>
          {pick === e.answer ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span><b>{pick === e.answer ? 'Correct.' : 'Not quite.'}</b> <span className="text-slate-700 dark:text-slate-300">{e.explanation}</span></span>
        </p>
      )}
      {pick != null && <button className="mt-1 text-xs text-accent hover:underline" onClick={() => setPick(null)}>Try again</button>}
    </div>
  );
}
