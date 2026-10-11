import { json } from './_lib/core.js';

/** GET /api/status → which providers are configured on this deployment (never returns key values). */
export async function GET(): Promise<Response> {
  const has = (k: string) => Boolean(process.env[k]?.trim());
  return json({
    providers: {
      tiingo: { configured: has('TIINGO_API_KEY'), role: 'Stocks & ETFs: daily history, splits, dividends, IEX last trade' },
      fred: { configured: has('FRED_API_KEY'), role: 'Macro series, Treasury yields, risk-free rate, index levels' },
      finnhub: { configured: has('FINNHUB_API_KEY'), role: 'Optional: fallback equity quote, market capitalization' },
      coingecko: { configured: has('COINGECKO_DEMO_KEY'), role: 'Optional: crypto market capitalization (works keyless at low limits)' },
      coinbase: { configured: true, role: 'Crypto: daily candles and last trade (public, no key)' },
    },
    serverTime: new Date().toISOString(),
  });
}
