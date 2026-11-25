"use client";

import { useState } from "react";
import type { Side } from "@/lib/types";

interface TradeBarProps {
  ticker: string;
  onTickerChange: (ticker: string) => void;
  /** Resolves with a confirmation line, rejects with an Error whose message is the API `detail`. */
  onTrade: (ticker: string, side: Side, quantity: number) => Promise<string>;
}

export function TradeBar({ ticker, onTickerChange, onTrade }: TradeBarProps) {
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(side: Side) {
    const t = ticker.trim().toUpperCase();
    const q = Number(qty);
    setNotice(null);
    if (!t) {
      setError("Enter a symbol to trade.");
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }
    setBusy(side);
    setError(null);
    try {
      setNotice(await onTrade(t, side, q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit("buy");
      }}
      className="flex shrink-0 flex-wrap items-center gap-2 border border-line bg-panel px-3 py-2"
      aria-label="Trade"
    >
      <span className="text-[12px] font-semibold text-text">Market order</span>
      <label className="flex items-center gap-1.5 text-[11px] text-muted">
        Symbol
        <input
          data-testid="trade-ticker-input"
          value={ticker}
          onChange={(e) => onTickerChange(e.target.value.toUpperCase())}
          maxLength={10}
          className="w-24 border border-line bg-bg px-2 py-1 text-[13px] font-semibold text-text uppercase focus:border-blue focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-muted">
        Qty
        <input
          data-testid="trade-quantity-input"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          type="number"
          min="0"
          step="any"
          className="num w-24 border border-line bg-bg px-2 py-1 text-[13px] text-text focus:border-blue focus:outline-none"
        />
      </label>
      <button
        type="button"
        data-testid="trade-buy-button"
        disabled={busy !== null}
        onClick={() => void submit("buy")}
        className="min-w-16 bg-up/90 px-3 py-1 text-[13px] font-bold text-[#06231a] hover:bg-up disabled:opacity-50"
      >
        {busy === "buy" ? "Buying…" : "Buy"}
      </button>
      <button
        type="button"
        data-testid="trade-sell-button"
        disabled={busy !== null}
        onClick={() => void submit("sell")}
        className="min-w-16 bg-down/90 px-3 py-1 text-[13px] font-bold text-[#2b0710] hover:bg-down disabled:opacity-50"
      >
        {busy === "sell" ? "Selling…" : "Sell"}
      </button>
      <div className="min-w-0 flex-1 text-[12px]" aria-live="polite">
        {error ? (
          <span data-testid="trade-error" role="alert" className="text-down">
            {error}
          </span>
        ) : notice ? (
          <span data-testid="trade-success" className="text-up">
            {notice}
          </span>
        ) : null}
      </div>
    </form>
  );
}
