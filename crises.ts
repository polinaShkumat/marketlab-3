import type { AssetKind } from '../types';

export interface Crisis {
  id: string;
  title: string;
  window: { start: string; end: string }; // analysis window shown on charts
  stress: { start: string; end: string }; // the acute phase used for "your portfolio" results
  instruments: Array<{ symbol: string; kind: AssetKind; why: string }>;
  context: string;
  explanation: string;
  timeline: Array<{ date: string; text: string }>;
  references: Array<{ label: string; url?: string }>;
  dataNote?: string;
}

/**
 * Narrative content only. Every number shown on the Crisis Explorer (returns, drawdowns,
 * volatility) is computed in the browser from the loaded price history — none is hard-coded.
 */
export const CRISES: Crisis[] = [
  {
    id: 'gfc',
    title: 'Global Financial Crisis, 2007–2009',
    window: { start: '2007-07-01', end: '2009-12-31' },
    stress: { start: '2007-10-09', end: '2009-03-09' },
    instruments: [
      { symbol: 'SPY', kind: 'equity', why: 'Broad US equity market' },
      { symbol: 'JPM', kind: 'equity', why: 'Large bank that acquired Bear Stearns and Washington Mutual' },
      { symbol: 'GS', kind: 'equity', why: 'Investment bank; converted to a bank holding company in September 2008' },
      { symbol: 'TLT', kind: 'equity', why: 'Long-duration Treasuries, the classic flight-to-quality asset' },
      { symbol: 'GLD', kind: 'equity', why: 'Gold proxy' },
    ],
    context:
      'Losses on US subprime mortgage securities spread through a financial system that funded long-term, illiquid assets with short-term wholesale borrowing. As collateral values fell, repo haircuts rose and funding markets froze, forcing asset sales that depressed prices further.',
    explanation:
      'Brunnermeier (2009) describes the crisis as a liquidity spiral: falling asset prices erode capital (loss spiral) and raise margins (margin spiral), so leveraged institutions must deleverage into falling markets. Counterparty uncertainty made banks hoard liquidity, visible in elevated interbank spreads. Equity drawdowns were deepest in financials, while long Treasuries rallied as investors sought safety and policy rates went to zero.',
    timeline: [
      { date: '2007-08-09', text: 'BNP Paribas suspends three funds exposed to US subprime; interbank markets tighten.' },
      { date: '2007-10-09', text: 'S&P 500 closes at its pre-crisis peak.' },
      { date: '2008-03-16', text: 'JPMorgan agrees to acquire Bear Stearns with Federal Reserve support.' },
      { date: '2008-09-07', text: 'Fannie Mae and Freddie Mac placed into conservatorship.' },
      { date: '2008-09-15', text: 'Lehman Brothers files for bankruptcy.' },
      { date: '2008-10-03', text: 'Emergency Economic Stabilization Act (TARP) signed into law.' },
      { date: '2009-03-09', text: 'S&P 500 reaches its crisis closing low.' },
    ],
    references: [
      { label: 'Brunnermeier, M. K. (2009). Deciphering the Liquidity and Credit Crunch 2007–2008. Journal of Economic Perspectives, 23(1), 77–100.', url: 'https://doi.org/10.1257/jep.23.1.77' },
      { label: 'Financial Crisis Inquiry Commission (2011). The Financial Crisis Inquiry Report.' },
    ],
  },
  {
    id: 'flash-crash',
    title: 'Flash Crash, May 6, 2010',
    window: { start: '2010-04-01', end: '2010-07-15' },
    stress: { start: '2010-04-23', end: '2010-07-02' },
    instruments: [
      { symbol: 'SPY', kind: 'equity', why: 'S&P 500 ETF; E-mini futures led the decline' },
      { symbol: 'QQQ', kind: 'equity', why: 'Nasdaq-100 ETF' },
      { symbol: 'IWM', kind: 'equity', why: 'Small caps, more sensitive to liquidity withdrawal' },
    ],
    context:
      'On the afternoon of May 6, 2010, US equity indices fell roughly 5–6% within minutes and largely recovered within about half an hour, while some individual stocks traded at absurd prices such as a penny.',
    explanation:
      'The joint CFTC–SEC report attributes the trigger to a large automated sell program in E-mini S&P 500 futures executed against volume without regard to price or time, in an already stressed market. High-frequency traders initially absorbed and then rapidly passed inventory ("hot potato" trading), and liquidity providers withdrew. Kirilenko et al. (2017) find HFTs did not cause the crash but amplified volatility. Important for this platform: daily bars hide the event, because the intraday low is far below the close — a lesson in sampling frequency.',
    timeline: [
      { date: '2010-04-23', text: 'S&P 500 nears its spring high amid rising concern about Greek sovereign debt.' },
      { date: '2010-05-06', text: 'Intraday crash and rebound in US equities and futures.' },
      { date: '2010-09-30', text: 'CFTC and SEC publish their joint findings.' },
    ],
    references: [
      { label: 'CFTC & SEC (2010). Findings Regarding the Market Events of May 6, 2010.' },
      { label: 'Kirilenko, A., Kyle, A. S., Samadi, M., & Tuzun, T. (2017). The Flash Crash: High-Frequency Trading in an Electronic Market. Journal of Finance, 72(3), 967–998.', url: 'https://doi.org/10.1111/jofi.12498' },
    ],
    dataNote: 'This platform uses daily bars. The intraday collapse is visible only in the day\'s high–low range, not in the close-to-close return.',
  },
  {
    id: 'debt-ceiling-2011',
    title: 'US Debt Ceiling Crisis, 2011',
    window: { start: '2011-06-01', end: '2011-12-30' },
    stress: { start: '2011-07-22', end: '2011-10-03' },
    instruments: [
      { symbol: 'SPY', kind: 'equity', why: 'US equities' },
      { symbol: 'TLT', kind: 'equity', why: 'Long Treasuries — rallied despite the downgrade' },
      { symbol: 'GLD', kind: 'equity', why: 'Gold proxy' },
      { symbol: 'JPM', kind: 'equity', why: 'Bank equity' },
    ],
    context:
      'Congress raised the debt limit only on August 2, 2011. On August 5, Standard & Poor\'s downgraded the US long-term sovereign rating from AAA to AA+. The episode overlapped with an escalating euro-area sovereign debt crisis.',
    explanation:
      'The puzzle for students: the downgraded asset (US Treasuries) rose in price while equities fell sharply. Safe-haven demand and expectations of weaker growth dominated any increase in perceived default risk. The GAO later estimated that delays in raising the limit increased Treasury borrowing costs in 2011.',
    timeline: [
      { date: '2011-08-02', text: 'Budget Control Act signed; the debt limit is raised.' },
      { date: '2011-08-05', text: 'S&P downgrades US long-term debt to AA+ (after the US market close).' },
      { date: '2011-08-08', text: 'First trading day after the downgrade: a severe equity sell-off.' },
    ],
    references: [
      { label: 'U.S. Government Accountability Office (2012). Debt Limit: Analysis of 2011–2012 Actions Taken and Effect of Delayed Increase on Borrowing Costs (GAO-12-701).' },
    ],
  },
  {
    id: 'china-2015',
    title: 'Chinese Market Turbulence, 2015–2016',
    window: { start: '2015-05-01', end: '2016-04-29' },
    stress: { start: '2015-08-10', end: '2016-02-11' },
    instruments: [
      { symbol: 'SPY', kind: 'equity', why: 'US equities reacting to global growth fears' },
      { symbol: 'QQQ', kind: 'equity', why: 'Nasdaq-100' },
      { symbol: 'IWM', kind: 'equity', why: 'US small caps' },
      { symbol: 'GLD', kind: 'equity', why: 'Gold proxy' },
    ],
    context:
      'A leveraged boom in Chinese A-shares reversed from mid-June 2015. On August 11, 2015 the People\'s Bank of China changed the renminbi fixing mechanism, producing the largest one-day depreciation in two decades. Global markets sold off in late August and again in January 2016, when China\'s new index circuit breakers halted trading twice in the first week.',
    explanation:
      'The episode illustrates international contagion through growth expectations, commodity demand and exchange-rate policy rather than direct financial exposure. China\'s circuit breakers, intended to calm markets, appear to have accelerated selling as traders rushed to execute before a halt (a "magnet effect"); they were suspended after four days.',
    timeline: [
      { date: '2015-06-12', text: 'Shanghai Composite peaks after a margin-financed rally.' },
      { date: '2015-08-11', text: 'PBoC devalues the renminbi fixing by about 2%.' },
      { date: '2015-08-24', text: 'Global sell-off; extreme volatility at the US open.' },
      { date: '2016-01-04', text: 'China\'s new circuit breaker halts trading for the day.' },
      { date: '2016-01-08', text: 'China suspends the circuit-breaker mechanism.' },
    ],
    references: [
      { label: 'Bank for International Settlements (2015). BIS Quarterly Review, September 2015 — overview of the August market turbulence.' },
    ],
  },
  {
    id: 'selloff-2018',
    title: '2018 Market Sell-offs',
    window: { start: '2018-01-02', end: '2019-02-28' },
    stress: { start: '2018-09-20', end: '2018-12-24' },
    instruments: [
      { symbol: 'SPY', kind: 'equity', why: 'US equities' },
      { symbol: 'QQQ', kind: 'equity', why: 'Technology-heavy Nasdaq-100' },
      { symbol: 'IWM', kind: 'equity', why: 'Small caps' },
      { symbol: 'AAPL', kind: 'equity', why: 'Mega-cap technology' },
    ],
    context:
      'Two distinct episodes: on February 5, 2018 the VIX more than doubled in a day and several short-volatility exchange-traded products collapsed ("Volmageddon"). In the fourth quarter, rising rates, Federal Reserve balance-sheet reduction and US–China trade tensions drove a decline that ended on December 24, 2018.',
    explanation:
      'February showed how crowded short-volatility strategies can create feedback: products that had to buy VIX futures as volatility rose amplified the spike. The fourth quarter is a textbook example of discount-rate pressure on long-duration growth stocks. The rebound after the Fed signalled patience in January 2019 shows how policy expectations move equity valuations.',
    timeline: [
      { date: '2018-02-05', text: 'VIX spike; short-volatility products suffer catastrophic losses.' },
      { date: '2018-09-20', text: 'S&P 500 record close before the Q4 decline.' },
      { date: '2018-12-19', text: 'FOMC raises rates for the fourth time in 2018.' },
      { date: '2018-12-24', text: 'Closing low of the 2018 sell-off.' },
    ],
    references: [
      { label: 'Bank for International Settlements (2018). BIS Quarterly Review, March 2018 — analysis of the February volatility spike.' },
    ],
  },
  {
    id: 'covid-2020',
    title: 'COVID-19 Market Crash, 2020',
    window: { start: '2020-01-02', end: '2020-08-31' },
    stress: { start: '2020-02-19', end: '2020-03-23' },
    instruments: [
      { symbol: 'SPY', kind: 'equity', why: 'US equities' },
      { symbol: 'QQQ', kind: 'equity', why: 'Technology, which recovered fastest' },
      { symbol: 'AMZN', kind: 'equity', why: 'E-commerce beneficiary of lockdowns' },
      { symbol: 'TLT', kind: 'equity', why: 'Treasuries during the March dash for cash' },
      { symbol: 'GLD', kind: 'equity', why: 'Gold proxy' },
      { symbol: 'BTC', kind: 'crypto', why: 'Crypto sold off with risk assets on March 12' },
    ],
    context:
      'The fastest 30%+ decline in US equity history followed the global spread of COVID-19. Even Treasuries and gold sold off briefly in mid-March during a scramble for dollar liquidity, before massive monetary and fiscal intervention.',
    explanation:
      'Baker et al. (2020) show that no previous infectious-disease outbreak moved US stock markets as forcefully, attributing this to the economic effects of government restrictions and voluntary social distancing. The episode is a natural experiment in correlation breakdown: in a liquidity crisis, normally diversifying assets can fall together.',
    timeline: [
      { date: '2020-02-19', text: 'S&P 500 record close.' },
      { date: '2020-03-11', text: 'WHO characterizes COVID-19 as a pandemic.' },
      { date: '2020-03-15', text: 'Fed cuts the funds rate target to 0–0.25% and announces asset purchases.' },
      { date: '2020-03-23', text: 'Fed announces open-ended asset purchases; equity closing low.' },
      { date: '2020-03-27', text: 'CARES Act signed.' },
    ],
    references: [
      { label: 'Baker, S. R., Bloom, N., Davis, S. J., Kost, K., Sammon, M., & Viratyosin, T. (2020). The Unprecedented Stock Market Reaction to COVID-19. Review of Asset Pricing Studies, 10(4), 742–758.', url: 'https://doi.org/10.1093/rapstu/raaa008' },
    ],
  },
  {
    id: 'meme-2021',
    title: 'Meme Stock Phenomenon, 2021',
    window: { start: '2020-12-01', end: '2021-06-30' },
    stress: { start: '2021-01-12', end: '2021-02-19' },
    instruments: [
      { symbol: 'GME', kind: 'equity', why: 'GameStop, the focal meme stock' },
      { symbol: 'IWM', kind: 'equity', why: 'Small-cap benchmark' },
      { symbol: 'SPY', kind: 'equity', why: 'Broad market' },
    ],
    context:
      'Coordinated retail buying, discussed on social media, together with heavy call-option activity, drove GameStop and other heavily shorted stocks to extreme valuations in January 2021. Several brokers restricted purchases on January 28 amid clearing-deposit demands.',
    explanation:
      'The SEC staff report concluded the run-up reflected a positive feedback loop of buying, including by short sellers covering positions, rather than a classic short squeeze alone, and highlighted the role of gamification, payment for order flow and clearing-house margin. Methodology note: GameStop executed a 4-for-1 split in July 2022, so adjusted prices for 2021 are one quarter of the prices that actually traded. The chart lets you compare both.',
    timeline: [
      { date: '2021-01-13', text: 'GME volume surges after board changes and online attention.' },
      { date: '2021-01-27', text: 'GME closing high of the episode.' },
      { date: '2021-01-28', text: 'Several brokers restrict buying in GME and other names.' },
    ],
    references: [
      { label: 'U.S. Securities and Exchange Commission (2021). Staff Report on Equity and Options Market Structure Conditions in Early 2021.' },
    ],
  },
  {
    id: 'inflation-2022',
    title: 'Inflation and Interest-Rate Shock, 2022',
    window: { start: '2021-11-01', end: '2023-01-31' },
    stress: { start: '2022-01-03', end: '2022-10-12' },
    instruments: [
      { symbol: 'SPY', kind: 'equity', why: 'US equities' },
      { symbol: 'QQQ', kind: 'equity', why: 'Long-duration growth equities' },
      { symbol: 'TLT', kind: 'equity', why: 'Long Treasuries — fell alongside equities' },
      { symbol: 'META', kind: 'equity', why: 'Large-cap technology with a deep drawdown' },
      { symbol: 'NVDA', kind: 'equity', why: 'Semiconductors' },
    ],
    context:
      'US CPI inflation reached its highest rates in four decades. The Federal Reserve began raising rates in March 2022 and moved in 75-basis-point steps from June, the fastest tightening since the early 1980s.',
    explanation:
      'Higher real rates raise discount rates for all assets. With inflation, not growth, as the dominant shock, the stock–bond correlation turned positive and the traditional 60/40 portfolio lost on both legs. Long-duration assets (unprofitable growth stocks, long bonds) fell the most — compare QQQ and TLT drawdowns with SPY.',
    timeline: [
      { date: '2022-03-16', text: 'First FOMC rate increase of the cycle (25 bp).' },
      { date: '2022-06-15', text: 'FOMC raises rates by 75 bp.' },
      { date: '2022-07-13', text: 'June CPI release shows 12-month inflation of about 9%.' },
      { date: '2022-10-12', text: 'S&P 500 closing low of the year.' },
    ],
    references: [
      { label: 'Board of Governors of the Federal Reserve System — FOMC statements, 2022.' },
      { label: 'U.S. Bureau of Labor Statistics — Consumer Price Index releases, 2022. Compare with CPIAUCSL in the Macro tab.' },
    ],
  },
  {
    id: 'crypto-2022',
    title: 'Cryptocurrency Market Collapse, 2022',
    window: { start: '2022-03-01', end: '2023-01-31' },
    stress: { start: '2022-05-05', end: '2022-11-21' },
    instruments: [
      { symbol: 'BTC', kind: 'crypto', why: 'Bitcoin' },
      { symbol: 'ETH', kind: 'crypto', why: 'Ethereum' },
      { symbol: 'SOL', kind: 'crypto', why: 'Solana, closely associated with FTX/Alameda' },
      { symbol: 'ADA', kind: 'crypto', why: 'Cardano' },
      { symbol: 'XRP', kind: 'crypto', why: 'Not traded on Coinbase in 2022 — demonstrates missing-data handling' },
    ],
    context:
      'The algorithmic stablecoin TerraUSD lost its peg in May 2022 and its sister token LUNA collapsed. Contagion hit crypto lenders (Celsius, Voyager) and the hedge fund Three Arrows Capital. In November, the exchange FTX failed after a run revealed a shortfall in customer assets.',
    explanation:
      'Liu, Makarov and Schoar (2023) analyse the Terra collapse as a classic run on a fragile, under-collateralized structure, with large, sophisticated holders exiting first. The broader episode shows how leverage, rehypothecation and opaque counterparties transmit shocks — familiar mechanisms from 2008 in a new asset class.',
    timeline: [
      { date: '2022-05-09', text: 'TerraUSD (UST) loses its dollar peg.' },
      { date: '2022-06-12', text: 'Celsius pauses customer withdrawals.' },
      { date: '2022-11-08', text: 'Run on FTX; Binance announces, then abandons, a rescue.' },
      { date: '2022-11-11', text: 'FTX files for Chapter 11 bankruptcy.' },
    ],
    references: [
      { label: 'Liu, J., Makarov, I., & Schoar, A. (2023). Anatomy of a Run: The Terra Luna Crash. NBER Working Paper 31160.' },
    ],
    dataNote: 'XRP trading on Coinbase was suspended from January 2021 to July 2023, so no Coinbase prices exist for this window.',
  },
  {
    id: 'banks-2023',
    title: 'US Regional Banking Crisis, 2023',
    window: { start: '2023-01-03', end: '2023-07-31' },
    stress: { start: '2023-03-07', end: '2023-05-04' },
    instruments: [
      { symbol: 'KRE', kind: 'equity', why: 'Regional bank equities' },
      { symbol: 'JPM', kind: 'equity', why: 'Large bank that acquired First Republic' },
      { symbol: 'SPY', kind: 'equity', why: 'Broad market' },
      { symbol: 'TLT', kind: 'equity', why: 'Long Treasuries — the duration risk behind SVB\'s losses' },
      { symbol: 'BTC', kind: 'crypto', why: 'Rallied during the episode' },
    ],
    context:
      'Silicon Valley Bank held long-duration securities funded by concentrated, largely uninsured deposits. After it announced a loss on securities sales, depositors withdrew funds at unprecedented speed and the bank was closed on March 10, 2023. Signature Bank followed; regulators guaranteed all deposits at both banks and the Fed launched the Bank Term Funding Program.',
    explanation:
      'The episode connects interest-rate risk (unrealized losses on held-to-maturity securities after 2022\'s rate rises) with run dynamics (Diamond–Dybvig): uninsured depositors coordinated rapidly via digital banking and social media. The Federal Reserve\'s own review identified failures in both bank management and supervision.',
    timeline: [
      { date: '2023-03-08', text: 'SVB announces a loss on securities sales and a capital raise.' },
      { date: '2023-03-10', text: 'SVB closed by California regulators; FDIC appointed receiver.' },
      { date: '2023-03-12', text: 'Signature Bank closed; systemic-risk exception and BTFP announced.' },
      { date: '2023-03-19', text: 'UBS agrees to acquire Credit Suisse.' },
      { date: '2023-05-01', text: 'First Republic Bank closed and sold to JPMorgan Chase.' },
    ],
    references: [
      { label: 'Board of Governors of the Federal Reserve System (2023). Review of the Federal Reserve\'s Supervision and Regulation of Silicon Valley Bank.' },
      { label: 'Diamond, D. W., & Dybvig, P. H. (1983). Bank Runs, Deposit Insurance, and Liquidity. Journal of Political Economy, 91(3), 401–419.' },
    ],
  },
];
