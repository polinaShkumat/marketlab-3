# Data sources: research notes (October 2026)

Provider terms change; re-check before relying on these notes.

| Provider | Used for | Free access | Notes |
|---|---|---|---|
| **Tiingo** | Stock/ETF daily OHLCV since 2007, adjusted prices, split factor and cash dividend per day, IEX last trade, symbol search | Free account; ~50 requests/hour, ~1,000/day | No redistribution of data. Apps where each user supplies their own token are permitted, hence the per-user key option in Settings. |
| **Coinbase Exchange** (public REST) | Crypto daily candles and last trade, 24 h stats, product list | No key; ~10 requests/second public limit | Max 300 candles per request (paginated in 299-day windows). Intervals without trades are omitted. History begins at each pair's Coinbase listing. |
| **FRED** | Fed funds, CPI, unemployment, GDP, Treasury yields, T-bill (risk-free), VIX, NBER recessions, S&P 500 / Nasdaq / Dow levels | Free API key | FRED's S&P 500 and DJIA series cover about 10 years for licensing reasons. No CORS, so it is proxied. |
| **Finnhub** (optional) | Equity market capitalization, fallback last price | Free key | Historical candles are not on the free tier, so they are not used. |
| **CoinGecko** (optional) | Crypto market capitalization | Demo key or keyless | Demo plan restricts historical data to the past 365 days, so it is not used for history. |

## Considered and not used

| Provider | Reason |
|---|---|
| Alpha Vantage | Free tier is 25 requests/day; too low for a multi-asset dashboard. |
| Financial Modeling Prep | Free tier limits on history depth and request volume; Tiingo covers the same need with split/dividend fields. |
| Stooq | CSV downloads without a documented API, terms or SLA; no per-day corporate action fields. |
| Nasdaq Data Link | The free price datasets historically used for this (e.g. WIKI) are discontinued. |
| Kraken | Public OHLC returns only the most recent ~720 candles per interval; Coinbase gives a longer daily history. |
| World Bank API | Annual, cross-country data; not needed for US market research at daily frequency. |
| Unofficial Yahoo Finance endpoints | Not a licensed, documented API. |

## Fallback chain

- Equity quote: Tiingo IEX last → Finnhub last (if key) → latest Tiingo end-of-day close (labelled "End-of-day close").
- Equity history: Tiingo only. If unavailable, the UI shows the reason; no substitute prices.
- Crypto: Coinbase only for prices; CoinGecko only for market cap.
