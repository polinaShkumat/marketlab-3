import { useEffect, useState } from 'react';
import { BookOpen, FlaskConical, History as HistoryIcon, LayoutDashboard, LineChart, Moon, Settings, Sun, TableProperties, Wallet } from 'lucide-react';
import Overview from './pages/Overview';
import Markets from './pages/Markets';
import Terminal from './pages/Terminal';
import PortfolioPage from './pages/Portfolio';
import HistoryPage from './pages/History';
import Research from './pages/Research';
import Learn from './pages/Learn';
import SettingsModal from './components/SettingsModal';
import { equityMarketStatus } from './lib/market';
import { getStatus, getUserKey } from './lib/api';
import type { AssetKind } from './types';

export type Page = 'overview' | 'markets' | 'terminal' | 'portfolio' | 'history' | 'research' | 'learn';

const NAV: Array<{ id: Page; label: string; icon: typeof LineChart }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'markets', label: 'Markets', icon: TableProperties },
  { id: 'terminal', label: 'Trading Terminal', icon: LineChart },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'history', label: 'Historical Simulator', icon: HistoryIcon },
  { id: 'research', label: 'Research Lab', icon: FlaskConical },
  { id: 'learn', label: 'Learning Center', icon: BookOpen },
];

export interface Nav {
  go: (p: Page) => void;
  openAsset: (symbol: string, kind: AssetKind) => void;
  openSettings: () => void;
}

function parseHash(): { page: Page; symbol?: string; kind?: AssetKind } {
  const [p, q] = window.location.hash.replace(/^#\/?/, '').split('?');
  const page = (NAV.some((n) => n.id === p) ? p : 'overview') as Page;
  const params = new URLSearchParams(q ?? '');
  const symbol = params.get('symbol') ?? undefined;
  const kind = (params.get('kind') as AssetKind | null) ?? undefined;
  return { page, symbol, kind };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [settings, setSettings] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [status, setStatus] = useState(() => equityMarketStatus());
  const [server, setServer] = useState<{ ok: boolean; message: string; missing: string[] } | null>(null);

  useEffect(() => {
    getStatus()
      .then((s) => setServer({ ok: true, message: '', missing: (['tiingo', 'fred'] as const).filter((k) => !s.providers[k]?.configured && !getUserKey(k)) }))
      .catch((e) => setServer({ ok: false, message: e instanceof Error ? e.message : String(e), missing: [] }));
  }, []);

  useEffect(() => {
    const h = () => setRoute(parseHash());
    window.addEventListener('hashchange', h);
    const t = window.setInterval(() => setStatus(equityMarketStatus()), 30_000);
    return () => { window.removeEventListener('hashchange', h); window.clearInterval(t); };
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('marketlab:theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
    setDark(next);
  };

  const nav: Nav = {
    go: (p) => { window.location.hash = `/${p}`; },
    openAsset: (symbol, kind) => { window.location.hash = `/terminal?symbol=${encodeURIComponent(symbol)}&kind=${kind}`; },
    openSettings: () => setSettings(true),
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-navy text-slate-200">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4">
          <a href="#/overview" className="flex items-center gap-2 py-3 pr-2">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="6" fill="#182235" /><path d="M6 22l6-7 5 4 9-11" stroke="#4169E1" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="text-[15px] font-semibold tracking-tight text-white">MARKETLAB</span>
          </a>
          <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" aria-label="Main">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#/${n.id}`}
                aria-current={route.page === n.id ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-3 text-[13px] font-medium transition-colors ${
                  route.page === n.id ? 'border-accent text-white' : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <n.icon className="h-4 w-4" />
                <span className="hidden lg:inline">{n.label}</span>
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 text-xs md:flex" title={`${status.detail}${status.calendarVerified ? '' : ' (holiday table not verified for this year)'}`}>
            <span className={`h-2 w-2 rounded-full ${status.open ? 'bg-gain' : 'bg-slate-500'}`} />
            <span>US equities {status.label.toLowerCase()}</span>
          </div>
          <button className="rounded p-1.5 text-slate-300 hover:bg-white/10" onClick={toggleTheme} aria-label="Toggle dark mode">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button className="rounded p-1.5 text-slate-300 hover:bg-white/10" onClick={() => setSettings(true)} aria-label="Data and account settings">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {server && !server.ok && (
        <div role="alert" className="border-b border-loss/30 bg-loss/10 px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
          <div className="mx-auto max-w-[1600px]">
            <p className="font-semibold text-loss">No market data: the MARKETLAB data server is not responding.</p>
            <p className="mt-0.5">{server.message}</p>
            <p className="mt-0.5 muted">Check: opening <code>/api/status</code> on this site should show JSON. Locally, use <code>npm run dev</code>; <code>npm run preview</code> and opening <code>dist/index.html</code> serve no data.</p>
          </div>
        </div>
      )}
      {server?.ok && server.missing.length > 0 && (
        <div className="border-b border-accent/20 bg-accent/5 px-4 py-2 text-sm">
          <div className="mx-auto max-w-[1600px]">
            {server.missing.map((m) => (m === 'tiingo' ? 'Tiingo' : 'FRED')).join(' and ')} key{server.missing.length > 1 ? 's are' : ' is'} not set, so
            {server.missing.includes('tiingo') ? ' stocks and ETFs' : ''}{server.missing.length > 1 ? ' and' : ''}{server.missing.includes('fred') ? ' indices and macro data' : ''} will be empty. Crypto works without keys.{' '}
            <button className="font-medium text-accent hover:underline" onClick={() => setSettings(true)}>Paste keys in Settings</button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {route.page === 'overview' && <Overview nav={nav} />}
        {route.page === 'markets' && <Markets nav={nav} />}
        {route.page === 'terminal' && <Terminal nav={nav} initialSymbol={route.symbol} initialKind={route.kind} />}
        {route.page === 'portfolio' && <PortfolioPage nav={nav} />}
        {route.page === 'history' && <HistoryPage nav={nav} />}
        {route.page === 'research' && <Research nav={nav} />}
        {route.page === 'learn' && <Learn nav={nav} />}
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-8 text-[11px] leading-relaxed muted">
        MARKETLAB is an independent educational project for studying financial markets. It is not affiliated with or endorsed by any university,
        exchange or data provider. All trading is simulated with virtual money; nothing here is investment advice. Market data: Tiingo (equities/ETFs),
        Coinbase Exchange (crypto), FRED® Federal Reserve Bank of St. Louis (macro), Finnhub and CoinGecko (optional market capitalization).
      </footer>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
