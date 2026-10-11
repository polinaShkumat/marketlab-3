/** Client-side mirrors of the normalized server types (see api/_lib/providers.ts). */
export type AssetKind = 'equity' | 'crypto';

export interface Bar {
  date: string;
  open: number; high: number; low: number; close: number; volume: number;
  adjOpen: number; adjHigh: number; adjLow: number; adjClose: number;
  dividend: number;
  split: number;
}

export interface Gap { from: string; to: string; days: number }

export interface History {
  symbol: string; kind: AssetKind; name: string; provider: string; attribution: string;
  requestedStart: string; firstDate: string | null; lastDate: string | null;
  bars: Bar[]; gaps: Gap[]; droppedRows: number; coverageNote: string | null; fetchedAt: string;
}

export interface Quote {
  symbol: string; kind: AssetKind; price: number; reference: number | null;
  change: number | null; changePct: number | null; volume: number | null; volumeLabel: string;
  marketCap: number | null; asOf: string;
  basis: 'iex-last' | 'finnhub-last' | 'eod-close' | 'exchange-last';
  provider: string;
}

export interface QuoteResult { symbol: string; quote: Quote | null; error: { code: string; message: string } | null }

export interface FredSeries {
  series: string; title: string; units: string; frequency: string; lastUpdated: string | null;
  points: Array<{ date: string; value: number }>; provider: string; attribution: string; fetchedAt: string;
}

export interface Asset { symbol: string; name: string; kind: AssetKind; group: 'Stocks' | 'ETFs' | 'Crypto' | 'Reference' }

export type DataState = 'loading' | 'connected' | 'delayed' | 'eod' | 'unavailable' | 'rate-limited' | 'config-required';
