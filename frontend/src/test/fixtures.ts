import type { ChatMessage, Portfolio, PriceUpdate, WatchlistItem } from "@/lib/types";

export function priceUpdate(ticker: string, price: number, extra: Partial<PriceUpdate> = {}): PriceUpdate {
  return {
    ticker,
    price,
    previous_price: price,
    timestamp: 1764000000,
    change: 0,
    change_percent: 0,
    direction: "flat",
    session_open: price,
    session_change_percent: 0,
    ...extra,
  };
}

export const portfolioFixture: Portfolio = {
  cash_balance: 8095,
  positions: [
    {
      ticker: "AAPL",
      quantity: 10,
      avg_cost: 190.5,
      current_price: 191.2,
      market_value: 1912,
      cost_basis: 1905,
      unrealized_pnl: 7,
      unrealized_pnl_percent: 0.3675,
    },
  ],
  positions_value: 1912,
  total_value: 10007,
  unrealized_pnl: 7,
};

export const watchlistFixture: WatchlistItem[] = [
  { ticker: "AAPL", price: 190.5, previous_price: 190.42, session_open: 189, session_change_percent: 0.79, direction: "up" },
  { ticker: "MSFT", price: 420.1, previous_price: 420.2, session_open: 421, session_change_percent: -0.21, direction: "down" },
];

export const assistantWithActions: ChatMessage = {
  id: "a1",
  role: "assistant",
  content: "Bought 5 NVDA for you.",
  created_at: "2026-11-25T10:00:00+00:00",
  actions: {
    trades: [{ ticker: "NVDA", side: "buy", quantity: 5, status: "executed", price: 880.1 }],
    watchlist_changes: [{ ticker: "PYPL", action: "add", status: "failed", error: "Bad ticker" }],
  },
};
