import { useSyncExternalStore } from "react";
import type { PriceEvent, PriceUpdate, WatchlistItem } from "./types";

/** One point of a per-ticker price series. `t` is unix seconds. */
export interface PricePoint {
  t: number;
  p: number;
}

export const HISTORY_SIZE = 300;

type Listener = () => void;
const EMPTY: PricePoint[] = [];

/**
 * Shared client-side price store, fed by the SSE stream.
 * Holds the latest PriceUpdate per ticker plus a bounded ring buffer
 * (last HISTORY_SIZE points) that the sparklines and the main chart share.
 * Snapshots are immutable so `useSyncExternalStore` can compare by reference.
 */
export class PriceStore {
  private prices: Record<string, PriceUpdate> = {};
  private history: Record<string, PricePoint[]> = {};
  private listeners = new Set<Listener>();

  constructor(private readonly capacity = HISTORY_SIZE) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getPrices = (): Record<string, PriceUpdate> => this.prices;

  getHistory = (ticker: string): PricePoint[] => this.history[ticker] ?? EMPTY;

  /** Apply one SSE event (a dict of every tracked ticker). */
  ingest(event: PriceEvent): void {
    const tickers = Object.keys(event ?? {});
    if (!tickers.length) return;
    const prices = { ...this.prices };
    const history = { ...this.history };
    for (const ticker of tickers) {
      const u = event[ticker];
      if (!u || typeof u.price !== "number") continue;
      prices[ticker] = u;
      const buf = history[ticker] ?? EMPTY;
      const last = buf[buf.length - 1];
      // The stream re-sends every ticker when any one changes: skip duplicates.
      if (last && last.t === u.timestamp && last.p === u.price) continue;
      const next =
        buf.length >= this.capacity ? buf.slice(buf.length - this.capacity + 1) : buf.slice();
      next.push({ t: u.timestamp, p: u.price });
      history[ticker] = next;
    }
    this.prices = prices;
    this.history = history;
    this.emit();
  }

  /** Seed prices from REST (GET /api/watchlist) for tickers the stream has not sent yet. */
  seedFromWatchlist(items: WatchlistItem[]): void {
    let changed = false;
    const prices = { ...this.prices };
    for (const it of items) {
      if (it.price == null || prices[it.ticker]) continue;
      const prev = it.previous_price ?? it.price;
      prices[it.ticker] = {
        ticker: it.ticker,
        price: it.price,
        previous_price: prev,
        timestamp: Date.now() / 1000,
        change: it.price - prev,
        change_percent: prev ? ((it.price - prev) / prev) * 100 : 0,
        direction: it.direction ?? "flat",
        session_open: it.session_open,
        session_change_percent: it.session_change_percent,
      };
      changed = true;
    }
    if (changed) {
      this.prices = prices;
      this.emit();
    }
  }

  reset(): void {
    this.prices = {};
    this.history = {};
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}

export const priceStore = new PriceStore();

export function usePrices(store: PriceStore = priceStore): Record<string, PriceUpdate> {
  return useSyncExternalStore(store.subscribe, store.getPrices, store.getPrices);
}

export function usePriceHistory(
  ticker: string | null,
  store: PriceStore = priceStore,
): PricePoint[] {
  const get = () => (ticker ? store.getHistory(ticker) : EMPTY);
  return useSyncExternalStore(store.subscribe, get, get);
}
