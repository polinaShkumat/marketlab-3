# MARKETLAB methodology

This document states every simulation rule and statistical convention used in the platform.
Code references point to the implementation; unit tests in `tests/` check the formulas.

## 1. Prices

- **As-traded (raw) prices**: the prices that actually printed on each date. Used for order execution, the Time Machine, and live portfolio valuation.
- **Adjusted prices**: Tiingo's split- and dividend-adjusted series. Used for return statistics, backtests, correlations, the efficient frontier and crisis comparisons (total-return basis).
- A current adjusted series rescales the past using events that had not yet happened, so it is **never treated as the price you could have traded at**.
- Missing data is never interpolated or fabricated. Gaps are reported (`gaps` in `/api/history`); valuation carries the last close forward and flags the value as stale.

## 2. Paper-trading execution (`src/lib/portfolio.ts`)

| Rule | Implementation |
|---|---|
| Market order | Fills at the reference price: the latest available observation (Tiingo IEX last trade, Finnhub last, Coinbase last trade, or the last end-of-day close). The price basis and observation timestamp are stored with the fill. Warnings are shown for delayed quotes, end-of-day prices, single-venue IEX prices and closed markets. |
| Limit order, marketable on entry | Buy limit ≥ reference, or sell limit ≤ reference → fills at the reference price. |
| Limit order, resting | Evaluated against daily bars **after** the session in which it was placed. Buy fills if the low ≤ limit, at min(open, limit); sell fills if the high ≥ limit, at max(open, limit). It can also fill against a later quote that crosses the limit. Never filled with random prices. |
| Reservations | Resting buys reserve cash (notional + fee); resting sells reserve shares. |
| Corporate action while resting | A split after placement cancels the order (the price scale changed). |
| Validation | Quantity > 0; no buying beyond available cash; no selling beyond unreserved holdings (no shorting, no leverage). |
| Fees | Notional × fee bps / 10,000 (default 5 bps, user-configurable). Added to the cost basis on buys, deducted from proceeds on sells. |
| Accounting | Average cost. Realized P&L = proceeds − fee − average cost × quantity sold. |
| Quantities | Fractional, rounded to 6 decimals (allows "buy $5,000 worth"). |
| Splits & dividends | Applied from Tiingo daily fields. Entitlement = shares held **before** the ex-date session (shares bought on the ex-date receive nothing). Idempotent. |
| Today's change | Shares held at the previous close move from the reference price (previous close; 24 h earlier for crypto); shares bought this session move from their fill price; shares sold this session realize fill − reference; this session's fees are subtracted. |
| Audit | Every order, fill, rejection, cancellation and corporate action is appended to an audit log. |

## 3. Market Time Machine (`src/lib/timeMachine.ts`)

- The student stands at the **opening bell** of session *t*. Visible information: all bars dated before *t*, plus the opening price of *t*.
- Orders fill at the raw open of *t*. Advancing closes the session (marked at raw closes), then applies the next session's splits and dividends.
- The trading calendar is US equity sessions (SPY dates). Crypto held in a simulation is valued at its UTC daily close on those dates.
- Assets cannot be traded before their first real price or after their last one (delisting/renaming). Held assets that stop trading are valued at their last close and flagged.
- Retrospective mode is entered explicitly. Only then are post-simulation prices shown.
- Benchmark: SPY bought at the adjusted open of the first session and valued at adjusted closes.

## 4. Backtests (`src/lib/backtest.ts`)

- Decision at the **close of day t** using prices with index ≤ t; execution at the **adjusted open of t+1**. The strategy receives a `PriceView` that throws `LookAheadError` if it requests index > t (tested).
- Sample: inner join of dates on which every selected asset has data.
- Strategies:
  - **Buy and hold**: target weights on day 1.
  - **Dollar-cost averaging**: capital released in N equal monthly installments, each invested at target weights; unreleased capital stays in cash.
  - **Moving-average crossover**: each asset held at 1/N while its fast SMA > slow SMA, otherwise cash.
  - **Momentum**: on the first session of each month, hold the top-k assets by trailing L-session return, equal weight; assets with negative momentum are not held.
  - **Periodic rebalancing**: back to target weights on the first session of every M-th month (executed next session).
- Sells are executed before buys; buys are capped by available cash. Cash earns 0%. Fees on traded notional.
- Turnover = total traded notional / average equity.
- Universe = today's listings → **survivorship bias**; results are not claimed to be free of it.

## 5. Performance statistics (`src/lib/metrics.ts`)

| Statistic | Definition |
|---|---|
| Returns | Simple period returns rₜ = Vₜ/Vₜ₋₁ − 1 on the sampling calendar (daily sessions). |
| Cumulative return | V_T / V_0 − 1 |
| Annualized return | Geometric: (V_T/V_0)^(A/N) − 1, N = number of returns, A = 252 (365 for crypto-only samples) |
| Volatility | Sample standard deviation (n − 1) of rₜ × √A |
| Sharpe | mean(rₜ − r_f,ₜ) / sd(rₜ − r_f,ₜ) × √A |
| Sortino | mean(rₜ − r_f,ₜ) × A / (√mean(min(rₜ − r_f,ₜ, 0)²) × √A), target = risk-free rate |
| Maximum drawdown | minₜ(Vₜ / maxₛ≤ₜVₛ − 1), with peak, trough and recovery dates |
| Beta | Cov(r_p, r_b) / Var(r_b) on common dates |
| Correlation | Pearson correlation of daily simple returns on common dates |
| Minimum sample | Annualized return, volatility, Sharpe, Sortino, beta and correlation are **withheld below 30 returns**. |

**Risk-free rate**: FRED DTB3 (3-month Treasury bill, secondary market, % p.a.), converted per day as (1 + y/100)^(1/252) − 1 and carried forward over non-publication days. If FRED is unavailable, 0% is used and the UI says so.

**Benchmark**: SPY by default (selectable: QQQ, IWM, VOO), on adjusted closes (total return).

**Portfolio equity history**: reconstructed from the transaction log and raw closes for each US session since the first trade; dividends enter as cash on ex-dates.

## 6. Technical indicators (`src/lib/indicators.ts`)

SMA(n); EMA with α = 2/(n+1) seeded by SMA; RSI(14) with Wilder smoothing; MACD(12, 26, 9);
Bollinger(20, 2σ population); rolling volatility = sample sd of 21 daily log returns × √252 (√365 for crypto).
Every value at index t uses only data at indices ≤ t.

## 7. Efficient frontier

μ = mean daily return × 252, Σ = sample covariance × 252 on the common sample. For λ on a log grid,
solve min wᵀΣw − λμᵀw subject to Σw = 1, w ≥ 0 by projected gradient descent with exact Euclidean
projection onto the simplex (Duchi et al., 2008). λ = 0 gives the minimum-variance portfolio; the
maximum-Sharpe point is selected along the traced frontier using the sample-average T-bill rate.
The frontier is **in-sample** and therefore optimistic.

## 8. Macroeconomic data

FRED series are the **latest vintage**. Many are revised (GDP, payrolls; CPI seasonal factors) and
published with lags, so historical charts show information that was not available at the time. For
point-in-time studies use ALFRED vintages. Recession shading uses USREC (NBER dates, which are
themselves announced months after the fact). Mixed frequencies are aligned at month-end; CPI and real GDP
are shown as year-over-year growth.

## 9. Market status

NYSE regular hours 09:30–16:00 America/New_York, early closes 13:00, holiday table for 2025–2027
(`src/lib/market.ts`, extend annually). Quote status is derived from the observation timestamp:
≤ 2 minutes old during market hours = real-time; older = delayed; outside hours or EOD basis = end-of-day.
