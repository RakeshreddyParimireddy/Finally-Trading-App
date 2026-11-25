"use client";

import { useState, type FormEvent } from "react";
import { formatPercent, toneClass } from "@/lib/format";
import { sessionChangePercent } from "@/lib/portfolio";
import type { PriceUpdate } from "@/lib/types";
import { Panel } from "./Panel";
import { PriceCell } from "./PriceCell";
import { Sparkline } from "./Sparkline";

const TICKER_RE = /^[A-Z.]{1,10}$/;

interface WatchlistProps {
  tickers: string[];
  prices: Record<string, PriceUpdate>;
  selected: string | null;
  onSelect: (ticker: string) => void;
  onAdd: (ticker: string) => Promise<void>;
  onRemove: (ticker: string) => Promise<void>;
}

export function Watchlist({ tickers, prices, selected, onSelect, onAdd, onRemove }: WatchlistProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ticker = draft.trim().toUpperCase();
    if (!ticker) return;
    if (!TICKER_RE.test(ticker)) {
      setError("Use 1-10 letters, e.g. PYPL or BRK.B");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(ticker);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add ticker");
    } finally {
      setBusy(false);
    }
  }

  async function remove(ticker: string) {
    setError(null);
    try {
      await onRemove(ticker);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove ticker");
    }
  }

  return (
    <Panel
      title="Watchlist"
      aside={<span className="num">{tickers.length}</span>}
      testId="watchlist"
      bodyClassName="flex flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-panel text-[11px] text-muted">
            <tr>
              <th className="py-1 pl-2.5 text-left font-normal">Symbol</th>
              <th className="py-1 text-right font-normal">Last</th>
              <th className="py-1 pr-1 text-right font-normal">Chg %</th>
              <th className="py-1 font-normal">
                <span className="sr-only">Trend</span>
              </th>
              <th className="w-6">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((ticker) => {
              const u = prices[ticker];
              const chg = sessionChangePercent(u);
              const isSel = ticker === selected;
              return (
                <tr
                  key={ticker}
                  data-testid={`watchlist-row-${ticker}`}
                  aria-selected={isSel}
                  tabIndex={0}
                  onClick={() => onSelect(ticker)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(ticker);
                    }
                  }}
                  className={`group cursor-pointer border-b border-line/60 outline-none ${
                    isSel ? "bg-raised" : "hover:bg-raised/60 focus-visible:bg-raised/60"
                  }`}
                >
                  <td className="relative py-1.5 pl-2.5 font-semibold">
                    {isSel ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
                    {ticker}
                  </td>
                  <td className="py-1.5 text-right">
                    <PriceCell price={u?.price} testId={`watchlist-price-${ticker}`} />
                  </td>
                  <td className={`num py-1.5 pr-1 text-right ${toneClass(chg)}`}>{formatPercent(chg)}</td>
                  <td className="py-1.5 pl-1">
                    <Sparkline ticker={ticker} />
                  </td>
                  <td className="py-1.5 pr-1.5 text-right">
                    <button
                      type="button"
                      data-testid={`watchlist-remove-${ticker}`}
                      aria-label={`Remove ${ticker} from watchlist`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(ticker);
                      }}
                      className="h-5 w-5 rounded-sm text-[14px] leading-none text-faint hover:bg-down/20 hover:text-down focus-visible:text-down"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
            {tickers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2.5 py-4 text-muted">
                  No tickers yet. Add one below to start streaming its price.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <form onSubmit={submit} className="shrink-0 border-t border-line p-2">
        <div className="flex gap-1.5">
          <input
            data-testid="watchlist-add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="Add symbol"
            aria-label="Ticker to add"
            maxLength={10}
            className="min-w-0 flex-1 border border-line bg-bg px-2 py-1 text-[13px] uppercase placeholder:normal-case placeholder:text-faint focus:border-blue focus:outline-none"
          />
          <button
            type="submit"
            data-testid="watchlist-add-button"
            disabled={busy}
            className="border border-blue/60 px-2.5 text-[12px] font-semibold text-blue hover:bg-blue/15 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {error ? (
          <p data-testid="watchlist-error" role="alert" className="mt-1 text-[12px] text-down">
            {error}
          </p>
        ) : null}
      </form>
    </Panel>
  );
}
