import { describe, expect, it, vi } from "vitest";
import { formatMoney, formatPercent, formatPrice, formatSignedMoney } from "./format";
import { heatmapColor, livePositions, portfolioTotals, sessionChangePercent } from "./portfolio";
import { HISTORY_SIZE, PriceStore } from "./priceStore";
import { api, ApiError } from "./api";
import { portfolioFixture, priceUpdate } from "@/test/fixtures";

describe("format", () => {
  it("formats money as en-US with 2 decimals", () => {
    expect(formatMoney(10000)).toBe("$10,000.00");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(null)).toBe("—");
  });
  it("formats signed values and percents", () => {
    expect(formatSignedMoney(-4)).toBe("-$4.00");
    expect(formatSignedMoney(12.3)).toBe("+$12.30");
    expect(formatPercent(0.3675)).toBe("+0.37%");
    expect(formatPercent(-1.5)).toBe("-1.50%");
  });
  it("can drop grouping for machine-readable prices", () => {
    expect(formatPrice(1234.5)).toBe("1,234.50");
    expect(formatPrice(1234.5, false)).toBe("1234.50");
  });
});

describe("portfolio calculations", () => {
  it("re-prices positions with live prices", () => {
    const [p] = livePositions(portfolioFixture.positions, { AAPL: priceUpdate("AAPL", 200) });
    expect(p.current_price).toBe(200);
    expect(p.market_value).toBe(2000);
    expect(p.cost_basis).toBe(1905);
    expect(p.unrealized_pnl).toBeCloseTo(95);
    expect(p.unrealized_pnl_percent).toBeCloseTo((95 / 1905) * 100);
    expect(p.weight).toBe(1);
  });

  it("falls back to the server price when no live price exists", () => {
    const [p] = livePositions(portfolioFixture.positions, {});
    expect(p.current_price).toBe(191.2);
  });

  it("computes weights across positions", () => {
    const positions = [
      { ...portfolioFixture.positions[0] },
      { ...portfolioFixture.positions[0], ticker: "MSFT", quantity: 30 },
    ];
    const live = livePositions(positions, { AAPL: priceUpdate("AAPL", 100), MSFT: priceUpdate("MSFT", 100) });
    expect(live[0].weight).toBeCloseTo(0.25);
    expect(live[1].weight).toBeCloseTo(0.75);
  });

  it("totals = cash + sum(qty x live price)", () => {
    const totals = portfolioTotals(portfolioFixture, { AAPL: priceUpdate("AAPL", 200) })!;
    expect(totals.cash).toBe(8095);
    expect(totals.positionsValue).toBe(2000);
    expect(totals.totalValue).toBe(10095);
    expect(totals.unrealizedPnl).toBeCloseTo(95);
    expect(portfolioTotals(null, {})).toBeNull();
  });

  it("heatmap colour is neutral at 0 and clamps at +/-5%", () => {
    expect(heatmapColor(0)).toBe("rgb(38, 46, 59)");
    expect(heatmapColor(5)).toBe("rgb(22, 163, 106)");
    expect(heatmapColor(50)).toBe(heatmapColor(5));
    expect(heatmapColor(-5)).toBe("rgb(214, 64, 84)");
    expect(heatmapColor(-12)).toBe(heatmapColor(-5));
    expect(heatmapColor(2.5)).not.toBe(heatmapColor(5));
    expect(heatmapColor(NaN)).toBe(heatmapColor(0));
  });

  it("session change % prefers the backend value, else computes from session_open", () => {
    expect(sessionChangePercent(priceUpdate("A", 110, { session_change_percent: 3 }))).toBe(3);
    expect(
      sessionChangePercent(priceUpdate("A", 110, { session_change_percent: null, session_open: 100 })),
    ).toBeCloseTo(10);
    expect(sessionChangePercent(undefined)).toBeNull();
  });
});

describe("PriceStore", () => {
  it("keeps the latest price and a ring buffer capped at 300 points", () => {
    const store = new PriceStore();
    for (let i = 0; i < HISTORY_SIZE + 50; i++) {
      store.ingest({ AAPL: priceUpdate("AAPL", 100 + i, { timestamp: i }) });
    }
    const hist = store.getHistory("AAPL");
    expect(hist).toHaveLength(HISTORY_SIZE);
    expect(hist[0]).toEqual({ t: 50, p: 150 });
    expect(hist[hist.length - 1]).toEqual({ t: 349, p: 449 });
    expect(store.getPrices().AAPL.price).toBe(449);
  });

  it("skips duplicate points and notifies subscribers", () => {
    const store = new PriceStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.ingest({ AAPL: priceUpdate("AAPL", 1, { timestamp: 1 }) });
    store.ingest({ AAPL: priceUpdate("AAPL", 1, { timestamp: 1 }) });
    expect(store.getHistory("AAPL")).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns stable snapshots for unchanged tickers", () => {
    const store = new PriceStore();
    store.ingest({ AAPL: priceUpdate("AAPL", 1, { timestamp: 1 }) });
    const before = store.getHistory("AAPL");
    store.ingest({ MSFT: priceUpdate("MSFT", 2, { timestamp: 1 }) });
    expect(store.getHistory("AAPL")).toBe(before);
  });

  it("seeds prices from the watchlist without overriding streamed ones", () => {
    const store = new PriceStore();
    store.ingest({ AAPL: priceUpdate("AAPL", 5) });
    store.seedFromWatchlist([
      { ticker: "AAPL", price: 1, previous_price: 1, session_open: 1, session_change_percent: 0, direction: "flat" },
      { ticker: "MSFT", price: 2, previous_price: 2, session_open: 2, session_change_percent: 0, direction: "flat" },
      { ticker: "ZZZ", price: null, previous_price: null, session_open: null, session_change_percent: null, direction: null },
    ]);
    expect(store.getPrices().AAPL.price).toBe(5);
    expect(store.getPrices().MSFT.price).toBe(2);
    expect(store.getPrices().ZZZ).toBeUndefined();
  });
});

describe("api client", () => {
  it("surfaces {detail} from error responses as ApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Insufficient cash: need $5,000.00, have $10.00" }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.trade("AAPL", "buy", 1000)).rejects.toMatchObject({
      status: 400,
      detail: "Insufficient cash: need $5,000.00, have $10.00",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolio/trade",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ticker: "AAPL", side: "buy", quantity: 1000 }) }),
    );
    vi.unstubAllGlobals();
  });

  it("maps network failures to a readable ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await api.getPortfolio().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    vi.unstubAllGlobals();
  });

  it("calls the watchlist endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.addTicker("pypl");
    await api.removeTicker("PYPL");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/watchlist");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"ticker":"pypl"}' });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/watchlist/PYPL");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    vi.unstubAllGlobals();
  });
});
