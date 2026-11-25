"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePriceStream } from "@/hooks/usePriceStream";
import { api, errorMessage } from "@/lib/api";
import { formatPrice, formatQty } from "@/lib/format";
import { livePositions, portfolioTotals } from "@/lib/portfolio";
import { priceStore, usePrices } from "@/lib/priceStore";
import type { Portfolio, Side, Snapshot, WatchlistItem } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { Header } from "./Header";
import { Heatmap } from "./Heatmap";
import { MainChart } from "./MainChart";
import { PnlChart } from "./PnlChart";
import { PositionsTable } from "./PositionsTable";
import { TradeBar } from "./TradeBar";
import { Watchlist } from "./Watchlist";

const POLL_MS = 30_000;

export function Terminal() {
  const status = usePriceStream();
  const prices = usePrices();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tradeTicker, setTradeTicker] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const applyWatchlist = useCallback((items: WatchlistItem[]) => {
    priceStore.seedFromWatchlist(items);
    const list = items.map((i) => i.ticker);
    setTickers(list);
    setSelected((cur) => (cur && list.includes(cur) ? cur : (list[0] ?? cur ?? null)));
    setTradeTicker((cur) => cur || list[0] || "");
  }, []);

  // Each refresh sets state only from the promise callbacks, after the request resolves.
  const refreshPortfolio = useCallback(
    () =>
      api.getPortfolio().then(
        (p) => {
          setPortfolio(p);
          setLoadError(null);
        },
        (err) => setLoadError(errorMessage(err)),
      ),
    [],
  );

  const refreshHistory = useCallback(
    () =>
      api.getHistory().then(setHistory, () => {
        /* keep the last good series */
      }),
    [],
  );

  const refreshWatchlist = useCallback(
    () => api.getWatchlist().then(applyWatchlist, (err) => setLoadError(errorMessage(err))),
    [applyWatchlist],
  );

  useEffect(() => {
    void refreshWatchlist();
    void refreshPortfolio();
    void refreshHistory();
    const timer = setInterval(() => {
      void refreshHistory();
      void refreshPortfolio();
      void refreshWatchlist();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshWatchlist, refreshPortfolio, refreshHistory]);

  const live = useMemo(() => livePositions(portfolio?.positions ?? [], prices), [portfolio, prices]);
  const totals = useMemo(() => portfolioTotals(portfolio, prices), [portfolio, prices]);

  const select = useCallback((ticker: string) => {
    setSelected(ticker);
    setTradeTicker(ticker);
  }, []);

  const trade = useCallback(
    async (ticker: string, side: Side, quantity: number) => {
      try {
        const res = await api.trade(ticker, side, quantity);
        setPortfolio(res.portfolio);
        void refreshHistory();
        const t = res.trade;
        return `${t.side === "buy" ? "Bought" : "Sold"} ${formatQty(t.quantity)} ${t.ticker} @ $${formatPrice(t.price)}`;
      } catch (err) {
        throw new Error(errorMessage(err));
      }
    },
    [refreshHistory],
  );

  const addTicker = useCallback(
    async (ticker: string) => {
      try {
        applyWatchlist(await api.addTicker(ticker));
      } catch (err) {
        throw new Error(errorMessage(err));
      }
    },
    [applyWatchlist],
  );

  const removeTicker = useCallback(
    async (ticker: string) => {
      try {
        applyWatchlist(await api.removeTicker(ticker));
      } catch (err) {
        throw new Error(errorMessage(err));
      }
    },
    [applyWatchlist],
  );

  const onChatActions = useCallback(() => {
    void refreshPortfolio();
    void refreshWatchlist();
    void refreshHistory();
  }, [refreshPortfolio, refreshWatchlist, refreshHistory]);

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <Header totals={totals} status={status} />
      {loadError ? (
        <div role="alert" className="border-b border-down/40 bg-down/10 px-4 py-1 text-[12px] text-down">
          {loadError}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-1 p-1 md:grid-cols-[minmax(270px,300px)_1fr]">
          <div className="h-[420px] min-h-0 md:h-auto">
            <Watchlist
              tickers={tickers}
              prices={prices}
              selected={selected}
              onSelect={select}
              onAdd={addTicker}
              onRemove={removeTicker}
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-1">
            <div className="flex h-[320px] min-h-0 flex-col lg:h-auto lg:flex-[1.15]">
              <MainChart ticker={selected} update={selected ? prices[selected] : undefined} />
            </div>
            <TradeBar ticker={tradeTicker} onTickerChange={setTradeTicker} onTrade={trade} />
            <div className="grid min-h-0 grid-cols-1 gap-1 xl:grid-cols-2 lg:flex-1">
              <div className="h-[240px] min-h-0 lg:h-auto">
                <Heatmap positions={live} onSelect={select} />
              </div>
              <div className="h-[240px] min-h-0 lg:h-auto">
                <PnlChart history={history} />
              </div>
            </div>
            <div className="h-[220px] min-h-0 lg:h-auto lg:flex-[0.8]">
              <PositionsTable positions={live} onSelect={select} />
            </div>
          </div>
        </main>
        <div className="flex h-[520px] min-h-0 lg:h-auto">
          <ChatPanel
            loadHistory={api.getChatHistory}
            send={api.sendChat}
            onActionsExecuted={onChatActions}
          />
        </div>
      </div>
    </div>
  );
}
