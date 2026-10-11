import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AssetKind } from './types';
import {
  applyCorporateActions, cancelOrder, createAccount, evaluateLimitOrders, loadAccount, placeOrder, saveAccount,
  type Account, type Order, type OrderRequest, type PriceRef,
} from './lib/portfolio';
import { getHistory, getQuotes } from './lib/api';
import { sessionDateOf } from './lib/market';

interface Ctx {
  account: Account;
  persisted: boolean;
  submit: (req: OrderRequest, ref: PriceRef) => Order;
  cancel: (id: string) => void;
  reset: () => void;
  setFeeBps: (bps: number) => void;
  reconcile: () => Promise<string[]>;
}

const AccountContext = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account>(() => loadAccount());
  const [persisted, setPersisted] = useState(true);
  const ref = useRef(account);
  const commit = useCallback((next: Account) => { ref.current = next; setAccount(next); }, []);

  useEffect(() => { setPersisted(saveAccount(account)); }, [account]);

  const submit = useCallback((req: OrderRequest, price: PriceRef) => {
    const r = placeOrder(ref.current, req, price);
    commit(r.account);
    return r.order;
  }, [commit]);

  const cancel = useCallback((id: string) => commit(cancelOrder(ref.current, id)), [commit]);
  const reset = useCallback(() => commit(createAccount(ref.current.feeBps)), [commit]);
  const setFeeBps = useCallback((bps: number) => commit({ ...ref.current, feeBps: Math.max(0, Math.min(200, bps)) }), [commit]);

  /** Apply corporate actions and evaluate resting limit orders using fresh data. */
  const reconcile = useCallback(async () => {
    const notes: string[] = [];
    const current = ref.current;
    const symbols = new Map<string, { symbol: string; kind: AssetKind }>();
    Object.values(current.positions).forEach((p) => symbols.set(`${p.kind}:${p.symbol}`, p));
    current.orders.filter((o) => o.status === 'pending').forEach((o) => symbols.set(`${o.kind}:${o.symbol}`, o));
    for (const { symbol, kind } of symbols.values()) {
      try {
        const h = await getHistory(symbol, kind);
        let quoteRef: PriceRef | null = null;
        try {
          const q = (await getQuotes([symbol], kind))[0]?.quote;
          if (q) quoteRef = { price: q.price, asOf: q.asOf, basis: q.basis, sessionDate: sessionDateOf(kind, q.asOf) };
        } catch { /* bars are enough */ }
        commit(evaluateLimitOrders(applyCorporateActions(ref.current, kind, symbol, h.bars), kind, symbol, h.bars, quoteRef));
      } catch (e) {
        notes.push(`${symbol}: ${e instanceof Error ? e.message : 'data unavailable'}`);
      }
    }
    return notes;
  }, [commit]);

  useEffect(() => {
    reconcile();
    const t = window.setInterval(reconcile, 5 * 60_000);
    return () => window.clearInterval(t);
  }, [reconcile]);

  const value = useMemo(() => ({ account, persisted, submit, cancel, reset, setFeeBps, reconcile }), [account, persisted, submit, cancel, reset, setFeeBps, reconcile]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): Ctx {
  const c = useContext(AccountContext);
  if (!c) throw new Error('useAccount outside provider');
  return c;
}
