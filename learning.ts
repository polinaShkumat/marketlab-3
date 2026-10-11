export interface GlossaryEntry { term: string; measures: string; formula: string; use: string; limits: string }

/** Contextual explanations shown next to indicators and metrics. */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  sma: {
    term: 'Simple moving average (SMA)',
    measures: 'The average closing price over the last n sessions; a smoothed trend estimate.',
    formula: 'SMAₜ = (Pₜ + Pₜ₋₁ + … + Pₜ₋ₙ₊₁) / n',
    use: 'Price above a rising long SMA is read as an uptrend; crossovers of a fast and slow SMA are classic trend signals.',
    limits: 'Lags by construction (about n/2 sessions). Whipsaws in range-bound markets.',
  },
  rsi: {
    term: 'Relative Strength Index (RSI)',
    measures: 'The balance of recent gains versus losses, scaled 0–100 (Wilder, 1978).',
    formula: 'RSI = 100 − 100/(1 + RS), RS = Wilder-smoothed average gain / average loss over n = 14',
    use: 'Readings above 70 are conventionally "overbought", below 30 "oversold"; divergences from price are watched for reversals.',
    limits: 'In strong trends RSI can stay extreme for long periods. Thresholds are conventions, not statistically derived bounds.',
  },
  macd: {
    term: 'MACD',
    measures: 'Momentum as the gap between a fast and a slow exponential moving average (Appel).',
    formula: 'MACD = EMA₁₂(P) − EMA₂₆(P); Signal = EMA₉(MACD); Histogram = MACD − Signal',
    use: 'MACD crossing above its signal line is read as strengthening momentum; the histogram shows acceleration.',
    limits: 'Built from lagging averages; unbounded, so levels are not comparable across assets.',
  },
  bollinger: {
    term: 'Bollinger Bands',
    measures: 'A volatility envelope around a 20-session SMA.',
    formula: 'Mid = SMA₂₀; Upper/Lower = Mid ± 2σ₂₀ (population standard deviation of closes)',
    use: 'Band width tracks volatility; touches of the bands are read relative to trend, not as automatic signals.',
    limits: 'Prices are not normally distributed, so "±2σ" does not imply a 95% containment probability.',
  },
  vol: {
    term: 'Realized volatility',
    measures: 'How much returns fluctuate, annualized.',
    formula: 'σ = sd(ln(Pₜ/Pₜ₋₁)) × √252 over a rolling 21-session window (√365 for crypto)',
    use: 'Compares risk across assets and periods; spikes mark stress regimes.',
    limits: 'Backward-looking; treats up and down moves symmetrically; sensitive to window length.',
  },
  sharpe: {
    term: 'Sharpe ratio',
    measures: 'Excess return per unit of total risk (Sharpe, 1966).',
    formula: 'S = mean(rₜ − r_f,ₜ) / sd(rₜ − r_f,ₜ) × √252',
    use: 'Ranks strategies by risk-adjusted performance; higher is better for a given investment horizon.',
    limits: 'Assumes volatility captures risk; penalizes upside volatility; unstable with short samples and fat tails; not comparable across sampling frequencies without care.',
  },
  sortino: {
    term: 'Sortino ratio',
    measures: 'Excess return per unit of downside risk.',
    formula: 'Sortino = mean(rₜ − r_f,ₜ) × 252 / (√mean(min(rₜ − r_f,ₜ, 0)²) × √252)',
    use: 'Prefers strategies whose volatility is mostly on the upside.',
    limits: 'Few downside observations make the denominator noisy; depends on the chosen target (here, the risk-free rate).',
  },
  mdd: {
    term: 'Maximum drawdown',
    measures: 'The largest peak-to-trough decline in value.',
    formula: 'MDD = minₜ (Vₜ / maxₛ≤ₜ Vₛ − 1)',
    use: 'Captures the worst loss an investor would have experienced — closely tied to whether a strategy is survivable in practice.',
    limits: 'A single path statistic; says nothing about frequency, and lengthens with sample size.',
  },
  beta: {
    term: 'Beta',
    measures: 'Sensitivity of portfolio returns to benchmark returns (CAPM).',
    formula: 'β = Cov(r_p, r_b) / Var(r_b)',
    use: 'β > 1 amplifies market moves; β < 1 dampens them. Used to separate market exposure from stock selection.',
    limits: 'Assumes a stable linear relation; betas change across regimes and rise in crises.',
  },
  correlation: {
    term: 'Correlation',
    measures: 'Co-movement of two return series, from −1 to +1 (Pearson).',
    formula: 'ρ = Cov(r₁, r₂) / (σ₁ σ₂), on daily simple returns over common dates',
    use: 'Low or negative correlation is what makes diversification work.',
    limits: 'Linear only; correlations tend to rise in sell-offs, exactly when diversification is needed.',
  },
  cagr: {
    term: 'Annualized return (CAGR)',
    measures: 'The constant yearly growth rate that reproduces the total return.',
    formula: 'CAGR = (V_T / V_0)^(252/N) − 1, N = number of daily returns',
    use: 'Compares performance over different horizons.',
    limits: 'Hides the path; very short samples produce misleading extrapolations, so it is withheld under 30 observations.',
  },
  frontier: {
    term: 'Efficient frontier',
    measures: 'The set of long-only portfolios with the lowest variance for each expected return (Markowitz, 1952).',
    formula: 'min wᵀΣw − λ μᵀw subject to Σwᵢ = 1, wᵢ ≥ 0, traced over λ ≥ 0',
    use: 'Shows the risk–return trade-off; the tangency (maximum-Sharpe) portfolio combines with the risk-free asset.',
    limits: 'Extremely sensitive to estimated mean returns; in-sample frontiers overstate achievable out-of-sample performance.',
  },
};

export interface Exercise { question: string; options: string[]; answer: number; explanation: string }
export interface Module { id: string; title: string; summary: string; sections: Array<{ heading: string; body: string }>; exercises: Exercise[]; tryIt?: { label: string; page: string } }

export const MODULES: Module[] = [
  {
    id: 'markets-101', title: 'Financial Markets 101',
    summary: 'How orders become prices, and what the numbers on a quote screen mean.',
    sections: [
      { heading: 'Exchanges and order books', body: 'US equities trade on many venues (NYSE, Nasdaq, IEX and others) linked by best-execution rules. Each venue keeps a limit order book: resting buy (bid) and sell (ask) orders. A market order executes immediately against the best available prices; a limit order sets the worst acceptable price and may wait. The bid–ask spread is the cost of immediacy.' },
      { heading: 'What a quote is', body: 'A "price" is the last trade or a quote at a specific time and venue. MARKETLAB shows the source, basis and timestamp of every price. An IEX last trade comes from one venue only; an end-of-day close is the official consolidated closing price. They can differ, and delayed data must never be called live.' },
      { heading: 'Adjusted versus raw prices', body: 'Splits and dividends create discontinuities in raw prices. Adjusted series rescale history so that returns are continuous and include dividends. They are right for measuring returns but wrong for asking what price you could have traded at on a past date — the Time Machine therefore trades at raw prices and applies corporate actions explicitly.' },
    ],
    exercises: [
      { question: 'You place a buy limit at $100 when the stock trades at $104. The next session opens at $98. Under MARKETLAB\'s rules, what is your fill?', options: ['$100', '$98', '$104', 'No fill'], answer: 1, explanation: 'The market opened through your limit, so you are filled at the better available price, the $98 open.' },
      { question: 'A 4-for-1 split occurs. Which statement is true for the adjusted price series?', options: ['Prices before the split are divided by 4', 'Prices after the split are multiplied by 4', 'Nothing changes', 'Returns on the split day show −75%'], answer: 0, explanation: 'Adjustment rescales pre-split history so the split-day return reflects only the true price move.' },
    ],
    tryIt: { label: 'Place a limit order in the Trading Terminal', page: 'terminal' },
  },
  {
    id: 'valuation', title: 'Equity Valuation Basics',
    summary: 'Prices as discounted expected cash flows and why rates move equities.',
    sections: [
      { heading: 'Discounted cash flows', body: 'A share is a claim on future cash flows. The present value is Σ E[CFₜ]/(1+r)ᵗ. The Gordon growth special case, P = D₁/(r − g), shows why small changes in the discount rate r or growth g have large effects when r − g is small.' },
      { heading: 'Duration of equities', body: 'Firms whose cash flows lie far in the future behave like long-duration bonds: their valuations are most sensitive to discount rates. This is why technology stocks fell hardest in 2022 when real yields rose — compare QQQ with SPY in the Crisis Explorer.' },
      { heading: 'Multiples', body: 'Price-to-earnings and EV/EBITDA multiples are shortcuts that embed assumptions about r and g. Comparing multiples across firms only makes sense when growth, risk and accounting are comparable.' },
    ],
    exercises: [
      { question: 'Using P = D₁/(r − g) with D₁ = $2, g = 4%: what happens to P when r rises from 8% to 9%?', options: ['Falls 20%', 'Falls 11%', 'Falls 1%', 'Rises 20%'], answer: 0, explanation: 'P goes from 2/0.04 = $50 to 2/0.05 = $40, a 20% fall.' },
    ],
    tryIt: { label: 'Compare 10-year yields with QQQ in the Macro tab', page: 'research' },
  },
  {
    id: 'portfolio-theory', title: 'Portfolio Theory',
    summary: 'Mean–variance optimization, diversification and the efficient frontier.',
    sections: [
      { heading: 'Diversification', body: 'For two assets, σ²ₚ = w₁²σ₁² + w₂²σ₂² + 2w₁w₂ρσ₁σ₂. Unless ρ = 1, portfolio volatility is below the weighted average of the asset volatilities. Diversification eliminates idiosyncratic risk but not systematic (market) risk.' },
      { heading: 'The efficient frontier', body: 'Markowitz (1952) showed that investors who care about mean and variance should hold portfolios on the frontier of minimum variance for each expected return. Adding a risk-free asset makes the maximum-Sharpe (tangency) portfolio the optimal risky portfolio for everyone, with leverage chosen by risk appetite.' },
      { heading: 'Estimation error', body: 'The optimizer treats estimated means as truth. Small errors in expected returns produce extreme, unstable weights. Practitioners use shrinkage, constraints, or minimum-variance portfolios that ignore means. The Research Lab frontier is in-sample and therefore optimistic.' },
    ],
    exercises: [
      { question: 'Two assets each have 20% volatility and correlation 0. What is the volatility of a 50/50 portfolio?', options: ['20%', '14.1%', '10%', '0%'], answer: 1, explanation: 'σ = √(0.25·0.04 + 0.25·0.04) = √0.02 ≈ 14.1%.' },
      { question: 'For two uncorrelated assets, the minimum-variance weights are proportional to…', options: ['Expected returns', '1/variance', 'Volatility', 'Market capitalization'], answer: 1, explanation: 'With ρ = 0, w₁ = σ₂²/(σ₁² + σ₂²), i.e. inverse-variance weighting.' },
    ],
    tryIt: { label: 'Build an efficient frontier', page: 'research' },
  },
  {
    id: 'risk', title: 'Risk Management',
    summary: 'Volatility, drawdowns, beta and why risk statistics need enough data.',
    sections: [
      { heading: 'Measuring risk', body: 'Volatility measures dispersion; maximum drawdown measures the worst experienced loss; beta measures market sensitivity. They answer different questions, and a portfolio can look safe on one and dangerous on another.' },
      { heading: 'Sample size', body: 'With daily data, the standard error of an annualized Sharpe ratio is roughly √((1 + S²/2)/T) where T is in years. Ten years of data still leave an uncertainty of about ±0.3. MARKETLAB withholds annualized statistics below 30 observations.' },
      { heading: 'Position sizing and concentration', body: 'The largest single-position weight and the effective number of positions (1/Σwᵢ²) describe concentration. A portfolio of ten stocks with 60% in one is effectively closer to two positions.' },
    ],
    exercises: [
      { question: 'Weights are 60%, 20%, 20%. What is the effective number of positions 1/Σw²?', options: ['3.0', '2.27', '1.67', '1.0'], answer: 1, explanation: 'Σw² = 0.36 + 0.04 + 0.04 = 0.44; 1/0.44 ≈ 2.27.' },
    ],
    tryIt: { label: 'Open portfolio analytics', page: 'portfolio' },
  },
  {
    id: 'behavioral', title: 'Behavioral Finance',
    summary: 'Systematic biases that show up in trading records — including your own.',
    sections: [
      { heading: 'Disposition effect', body: 'Investors tend to sell winners too early and hold losers too long (Shefrin & Statman, 1985; Odean, 1998). Check your realized versus unrealized P&L in the Portfolio page: a pattern of small realized gains and large unrealized losses is the signature.' },
      { heading: 'Overconfidence and trading', body: 'Barber and Odean (2000) found that the most active retail traders earned the lowest net returns, largely due to trading costs. Run the same strategy in the backtester with 0 and 20 bps of fees to see the effect of turnover.' },
      { heading: 'Hindsight bias', body: 'Knowing how 2008 or 2020 ended makes past decisions look obvious. The Time Machine hides future prices precisely to make you decide under the uncertainty investors actually faced.' },
    ],
    exercises: [
      { question: 'Which pattern in a trading log is most consistent with the disposition effect?', options: ['Many realized gains, losers held', 'Many realized losses, winners held', 'Equal-weight rebalancing', 'Buying only index funds'], answer: 0, explanation: 'Selling winners and holding losers is the defining pattern.' },
    ],
    tryIt: { label: 'Try the Market Time Machine', page: 'history' },
  },
  {
    id: 'technical', title: 'Technical Analysis',
    summary: 'What indicators compute, and how to test whether they add value.',
    sections: [
      { heading: 'Indicators are transformations of price', body: 'Moving averages, RSI, MACD and Bollinger Bands are deterministic functions of past prices and volumes. They summarize trend, momentum and volatility; they do not contain information beyond the price history itself.' },
      { heading: 'Testing a rule', body: 'A trading rule is a hypothesis. Backtest it with decisions made only on data available at the time, include costs, and compare with buy-and-hold. Brock, Lakonishok and LeBaron (1992) found moving-average rules had predictive power in historical Dow data; later studies show much weaker results after costs and in recent decades.' },
      { heading: 'Data snooping', body: 'Trying many parameter combinations and reporting the best one guarantees an impressive but meaningless backtest. Fix parameters before looking at results, or hold out a test period.' },
    ],
    exercises: [
      { question: 'A 50/200-day crossover signal is computed from today\'s close. When can it be traded without look-ahead bias?', options: ['At today\'s close', 'At tomorrow\'s open', 'At today\'s open', 'Any time today'], answer: 1, explanation: 'Today\'s close is only known after the close, so the earliest realistic execution is the next session.' },
    ],
    tryIt: { label: 'Backtest a moving-average crossover', page: 'research' },
  },
  {
    id: 'crises', title: 'Financial Crises',
    summary: 'Leverage, liquidity and runs across ten market episodes.',
    sections: [
      { heading: 'Common mechanisms', body: 'Most crises combine leverage, maturity or liquidity mismatch, and a trigger that reveals losses. Runs — on banks, money funds, stablecoins or repo — are self-fulfilling: each holder\'s best response is to withdraw if others do (Diamond & Dybvig, 1983).' },
      { heading: 'Correlation in stress', body: 'Diversification benefits shrink when everyone sells at once. In March 2020 even Treasuries and gold fell briefly. Measure correlations inside and outside crisis windows in the Research Lab.' },
      { heading: 'Policy response', body: 'Central banks act as lenders of last resort and cut rates; fiscal authorities recapitalize or guarantee. Market bottoms have often coincided with decisive interventions (March 2009, March 2020).' },
    ],
    exercises: [
      { question: 'What made Silicon Valley Bank unusually vulnerable to a run in 2023?', options: ['Mostly insured retail deposits', 'Concentrated uninsured deposits and long-duration securities', 'High equity capital', 'No exposure to interest rates'], answer: 1, explanation: 'Uninsured depositors have the strongest incentive to run, and unrealized losses on long-duration securities made the bank insolvent on a mark-to-market basis.' },
    ],
    tryIt: { label: 'Open the Crisis Explorer', page: 'history' },
  },
  {
    id: 'quant', title: 'Introduction to Quantitative Finance',
    summary: 'Returns, compounding, and building statistically honest research.',
    sections: [
      { heading: 'Simple and log returns', body: 'Simple returns rₜ = Pₜ/Pₜ₋₁ − 1 aggregate across assets (portfolio return is the weighted sum). Log returns ln(Pₜ/Pₜ₋₁) aggregate across time (multi-period return is the sum). MARKETLAB uses simple returns for portfolio statistics and log returns for rolling volatility.' },
      { heading: 'Arithmetic versus geometric means', body: 'The arithmetic mean of returns exceeds the geometric (compound) mean by roughly σ²/2. A strategy alternating +50% and −50% has a 0% arithmetic mean but loses 25% every two periods.' },
      { heading: 'Research hygiene', body: 'Avoid look-ahead bias (using information before it existed), survivorship bias (testing only today\'s survivors — the default asset list here is a set of current companies), and data snooping. Document data sources, adjustments, sampling frequency and the risk-free rate, as the Methodology notes do.' },
    ],
    exercises: [
      { question: 'An asset returns +50% then −50%. What is the total return?', options: ['0%', '−25%', '+25%', '−50%'], answer: 1, explanation: '1.5 × 0.5 = 0.75, a 25% loss.' },
      { question: 'Backtesting only stocks that exist today over 2007–2026 mainly introduces…', options: ['Look-ahead bias', 'Survivorship bias', 'Rounding error', 'Liquidity premium'], answer: 1, explanation: 'Firms that failed or were acquired are excluded, which biases historical returns upward.' },
    ],
    tryIt: { label: 'Analyze correlations', page: 'research' },
  },
];
