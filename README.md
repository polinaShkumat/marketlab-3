# MARKETLAB — Financial Markets Research & Trading Simulator

An educational paper-trading and market-research platform for economics and finance students.
It uses **real market data** and **simulated execution**: no real money, brokerage accounts or orders are involved.

> MARKETLAB is an independent educational project. It is not affiliated with or endorsed by any
> university, exchange or data provider, and nothing in it is investment advice.

## What it does

| Section | Features |
|---|---|
| Overview | Index levels (FRED), BTC/ETH, gold proxy, Treasury yields, account summary, watchlist, gainers/losers, allocation, realized vs. implied volatility |
| Markets | Quote table for the asset universe, with source, observation time and freshness status per row |
| Trading Terminal | Asset search, candlestick/line chart (TradingView Lightweight Charts), volume, crosshair OHLC, zoom/pan, 1D–MAX ranges, SMA 20/50/200, Bollinger Bands, RSI, MACD, rolling volatility, raw vs. adjusted prices, market/limit order entry |
| Portfolio | $100,000 virtual account, positions, realized/unrealized P&L, dividends, analytics vs. benchmark (Sharpe, Sortino, drawdown, beta…), correlation of holdings, orders, transactions, audit log, CSV export, reset |
| Historical Simulator | **Market Time Machine** (trade from any date since 2007 with no look-ahead, then review) and **Financial Crisis Explorer** (10 events, all figures computed from data) |
| Research Lab | Correlation matrix and rolling correlation, risk/return scatter, long-only efficient frontier, five backtest strategies, macro indicators with recession shading |
| Learning Center | 8 modules with exercises; contextual explanations next to every indicator and metric |

## Quick start (local)

Requirements: **Node.js 20 or newer**.

```bash
npm install
cp .env.example .env.local      # then paste your keys into .env.local
npm run dev                     # http://localhost:5173
```

`npm run dev` serves both the website and the `/api` functions (a small Vite plugin runs the same
files Vercel uses in production), so you do not need the Vercel CLI locally.

Other commands:

```bash
npm test          # unit tests (financial calculations, order execution, API handling)
npm run build     # type-check frontend + API, then production build into dist/
npm run preview   # serve the production build (API routes are NOT available in preview)
```

## API keys (all free)

| Variable | Needed for | How to get it |
|---|---|---|
| `TIINGO_API_KEY` | **Required** for stocks & ETFs (or paste in Settings) | Register at https://www.tiingo.com → Account → API → Token |
| `FRED_API_KEY` | **Required** for indices, yields, risk-free rate, macro tab (or paste in Settings) | https://fredaccount.stlouisfed.org/apikeys (free account) |
| `FINNHUB_API_KEY` | Optional: equity market cap, fallback quote | https://finnhub.io/register |
| `COINGECKO_DEMO_KEY` | Optional: crypto market cap (works keyless at low limits) | https://www.coingecko.com/en/api/pricing → Demo |

Crypto data (Coinbase Exchange public API) needs **no key**, so crypto works even before you add any keys.

Without a key the app does not invent data: affected panels show **"API key required"** and a
banner links to Settings, where both keys can be pasted (stored only in that browser). Keys set on
the server take effect for everyone; keys pasted in Settings only for that browser.

## Easiest deployment: no terminal, keys pasted on the website

1. Unzip the project. Create a **private** repository at https://github.com/new, click *uploading an existing file*, drag in everything inside the `marketlab` folder and click *Commit changes*.
2. At https://vercel.com sign in with GitHub → *Add New → Project* → *Import* `marketlab` → *Deploy*. Add no environment variables.
3. Open your new site, click the banner link **Paste keys in Settings** (or the gear icon), paste your free Tiingo and FRED keys and press **Save keys and reload**.

Keys entered this way are stored only in that browser and are sent only to your site's own `/api`
server. Each browser or device needs them entered once, so this is ideal for presenting from your own
laptop. Data fetched with such keys is never stored in the shared CDN cache, so other visitors cannot
receive it without their own keys (Tiingo forbids redistribution). If you want the site to work for
every visitor with no setup, use the server-side environment variables below instead.

## Deploy to Vercel with server-side keys

**Option A: GitHub (recommended)**
1. Create a GitHub repository and push this folder (`.gitignore` already excludes `node_modules`, `dist` and `.env*`).
2. On https://vercel.com → *Add New… → Project* → import the repository. Vercel detects Vite; `vercel.json` sets the build command (`npm run build`) and output (`dist`).
3. In *Settings → Environment Variables* add `TIINGO_API_KEY` and `FRED_API_KEY` (and optionally the two others) for Production and Preview.
4. Deploy. If you add keys after the first deploy, trigger *Redeploy*.

**Option B: Vercel CLI**
```bash
npm i -g vercel
vercel            # first run links the project
vercel env add TIINGO_API_KEY
vercel env add FRED_API_KEY
vercel --prod
```

Files in `api/` become serverless functions (`/api/history`, `/api/quote`, `/api/search`,
`/api/fred`, `/api/status`); files in `api/_lib/` are shared code, not routes. API keys are only
ever read on the server.

## Verification checklist after deploying

These could not be tested in the build environment (no network access to the providers) and
should be checked once on your deployment:

1. Open `/api/status`: `tiingo` and `fred` should show `"configured": true`.
2. Open `/api/history?symbol=AAPL&kind=equity`: JSON with `bars` starting 2007-01-03.
3. Open `/api/history?symbol=BTC&kind=crypto`: bars starting in 2015 (Coinbase BTC-USD listing).
4. Open `/api/quote?kind=equity&symbols=AAPL,MSFT` and `/api/quote?kind=crypto&symbols=BTC`.
5. Open `/api/fred?series=DGS10`.
6. In the app: Terminal → AAPL chart loads; buy $5,000; Portfolio shows the position; refresh the page and it persists.

If a check fails, the JSON `error.code` tells you why: `CONFIG_REQUIRED` (missing/invalid key),
`RATE_LIMITED`, `NOT_FOUND`, `UPSTREAM_ERROR`.

## Rate limits and caching

Tiingo's free plan allows about 50 requests/hour and 1,000/day. To stay within it:
- History responses are cached for 6 hours on Vercel's CDN (`s-maxage`) and in function memory; quotes for 60 s (crypto 30 s).
- The browser de-duplicates in-flight requests and caches per session.
- Each function keeps a local request budget and returns `RATE_LIMITED` instead of hammering a provider.
- Upstream calls retry with exponential backoff on network errors, 429 and 5xx.

A first visit to the Markets page loads many symbols; subsequent visits by anyone are served from cache.

## Project structure

```
api/                    Vercel serverless functions (server-side, keys live here)
  _lib/core.ts          errors, TTL cache, rate guard, fetch with retry/backoff, validation
  _lib/providers.ts     Tiingo, Coinbase, Finnhub, CoinGecko, FRED adapters + normalization
  history.ts quote.ts search.ts fred.ts status.ts
src/
  lib/indicators.ts     SMA, EMA, RSI (Wilder), MACD, Bollinger, rolling volatility
  lib/metrics.ts        returns, CAGR, volatility, Sharpe, Sortino, drawdown, beta, correlation
  lib/portfolio.ts      paper-trading engine: orders, fills, limits, corporate actions, valuation
  lib/backtest.ts       backtester with look-ahead guard, 5 strategies, mean-variance optimizer
  lib/timeMachine.ts    historical simulation engine (raw prices + splits/dividends)
  lib/market.ts         asset universe, NYSE session calendar, quote freshness
  lib/api.ts hooks.ts   client data layer
  pages/ components/    UI
  data/                 crisis case studies, learning modules, glossary (narrative only)
tests/                  Vitest unit tests
e2e/run_e2e.py          Playwright browser test (uses synthetic fixtures; see file header)
docs/                   METHODOLOGY.md, DATA_SOURCES.md
```

## Persistence

The account (cash, positions, orders, transactions, audit log) is saved in the browser's
`localStorage` under `marketlab:account:v1`. It survives refreshes and redeploys, is private to
each browser, and is erased if the user clears site data. Settings → *Reset simulation* starts over.
A multi-user version would replace `loadAccount`/`saveAccount` in `src/lib/portfolio.ts` with a database.

## Known limitations

- **Intraday data**: free tiers used here provide daily bars only; the 1D range shows recent daily sessions.
- **Equity quotes** are the IEX last trade (a single exchange) during market hours, otherwise the last consolidated close. Status badges are derived from the observation timestamp and never call delayed data live.
- **Index levels** from FRED: S&P 500 and Dow cover about the last 10 years (licence); ETF proxies (SPY, QQQ, DIA) are used for long histories.
- **Crypto** history starts at each pair's Coinbase listing (BTC 2015, ETH 2016, SOL/ADA 2021, XRP 2019 with a 2021–2023 suspension gap). Earlier prices are not shown.
- **Survivorship bias**: the default universe consists of companies that exist today.
- **NYSE holiday table** covers 2025–2027 and must be extended each year (`src/lib/market.ts`).
- **Market cap** appears only with the optional Finnhub/CoinGecko keys.

## Licences and attribution

- Tiingo data may not be redistributed; deploy for your own/class use with your key, or let users supply theirs.
- FRED® data: Federal Reserve Bank of St. Louis; index levels are copyright of their owners.
- TradingView Lightweight Charts™ (Apache-2.0) displays a TradingView attribution logo, as its licence requires; keep it.
