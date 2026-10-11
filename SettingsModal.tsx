import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Modal } from './ui';
import { getStatus, getUserKey, setUserKey, type ProviderStatus } from '../lib/api';
import { useAccount } from '../store';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { account, setFeeBps, reset, persisted } = useAccount();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [tiingo, setTiingo] = useState('');
  const [fred, setFred] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTiingo(getUserKey('tiingo'));
    setFred(getUserKey('fred'));
    setConfirmReset(false);
    getStatus().then(setStatus).catch((e) => setStatusErr(e.message));
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Data and account settings">
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="mb-1 font-semibold">API keys</h3>
          <p className="mb-3 muted">
            Paste free keys here to load stock, index and macro data. They are saved only in this browser and sent only to this website's own server, never stored there.
            Each browser or device needs the keys entered once. Keys set by the site owner on the server work for every visitor without this step.
          </p>
          <KeyField id="tiingo" label="Tiingo key (stocks and ETFs)" help="Free at tiingo.com → Account → API → Token" value={tiingo} onChange={setTiingo}
            server={status?.providers.tiingo?.configured} />
          <KeyField id="fred" label="FRED key (indices, Treasury yields, macro)" help="Free at fredaccount.stlouisfed.org/apikeys" value={fred} onChange={setFred}
            server={status?.providers.fred?.configured} />
          <p className="mb-3 text-xs muted">Crypto prices (Coinbase) need no key.</p>
          {statusErr && <p className="mb-2 text-xs text-loss">The data server is not responding: {statusErr}</p>}
          <button className="btn-primary" onClick={() => { setUserKey('tiingo', tiingo); setUserKey('fred', fred); window.location.reload(); }}>
            Save keys and reload
          </button>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">Simulated trading costs</h3>
          <label className="label" htmlFor="fee">Fee per trade, basis points of notional</label>
          <input id="fee" className="input w-32" type="number" min={0} max={200} step={1} value={account.feeBps} onChange={(e) => setFeeBps(Number(e.target.value))} />
          <p className="mt-1 text-xs muted">{account.feeBps} bps = ${(account.feeBps / 100).toFixed(2)} per $10,000 traded. Applies to new orders.</p>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">Account</h3>
          <p className="mb-2 muted">
            Saved in this browser's local storage{persisted ? '' : ' — saving is currently failing (storage full or disabled)'}. Clearing site data erases it.
          </p>
          {!confirmReset ? (
            <button className="btn-outline" onClick={() => setConfirmReset(true)}>Reset simulation…</button>
          ) : (
            <div className="flex items-center gap-2">
              <span>Erase all positions and history and start again with $100,000?</span>
              <button className="btn bg-loss text-white hover:opacity-90" onClick={() => { reset(); setConfirmReset(false); }}>Reset account</button>
              <button className="btn-ghost" onClick={() => setConfirmReset(false)}>Keep account</button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function KeyField({ id, label, help, value, onChange, server }: { id: string; label: string; help: string; value: string; onChange: (v: string) => void; server: boolean | undefined }) {
  const saved = getUserKey(id as 'tiingo' | 'fred');
  const state = value.trim() && value.trim() !== saved
    ? { icon: <XCircle className="h-3.5 w-3.5 text-amber-500" />, text: 'Not saved yet: press Save keys and reload' }
    : value.trim()
    ? { icon: <CheckCircle2 className="h-3.5 w-3.5 text-gain" />, text: 'Key saved in this browser' }
    : server
      ? { icon: <CheckCircle2 className="h-3.5 w-3.5 text-gain" />, text: 'Provided by the server, nothing to enter' }
      : { icon: <XCircle className="h-3.5 w-3.5 text-slate-400" />, text: 'No key yet' };
  return (
    <div className="mb-3">
      <label className="label" htmlFor={`key-${id}`}>{label}</label>
      <input id={`key-${id}`} className="input" type="password" autoComplete="off" spellCheck={false} placeholder="Paste key" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 flex items-center gap-1 text-xs muted">{state.icon}{state.text}. {help}</p>
    </div>
  );
}
