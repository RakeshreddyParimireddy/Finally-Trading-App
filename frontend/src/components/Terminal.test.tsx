import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { priceStore } from "@/lib/priceStore";
import { MockEventSource } from "@/test/mockEventSource";
import { portfolioFixture, priceUpdate, watchlistFixture } from "@/test/fixtures";
import { Terminal } from "./Terminal";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Terminal (integration with mocked API)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    priceStore.reset();
    MockEventSource.reset();
    vi.stubGlobal("EventSource", MockEventSource);
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/portfolio") return json(portfolioFixture);
      if (url === "/api/portfolio/history") return json([{ total_value: 10000, recorded_at: "2026-11-25T10:00:00Z" }]);
      if (url === "/api/watchlist" && method === "GET") return json(watchlistFixture);
      if (url === "/api/chat/history") return json([]);
      if (url === "/api/portfolio/trade") return json({ detail: "Insufficient cash: need $1,000,000.00, have $8,095.00" }, 400);
      return json({ detail: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads portfolio and watchlist, then updates the header from live prices", async () => {
    render(<Terminal />);
    await waitFor(() => expect(screen.getByTestId("header-total-value")).toHaveTextContent("$10,000.00")); // 8095 + 10 x 190.50 (seeded watchlist price)
    expect(screen.getByTestId("header-cash")).toHaveTextContent("$8,095.00");
    expect(screen.getByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-price-MSFT")).toHaveTextContent("420.10");
    expect(screen.getByTestId("main-chart")).toHaveAttribute("data-ticker", "AAPL");
    expect(screen.getByTestId("pnl-chart")).toHaveAttribute("data-points", "1");

    act(() => {
      MockEventSource.latest().open();
      MockEventSource.latest().emit({ AAPL: priceUpdate("AAPL", 200) });
    });
    // 8095 + 10 x 200
    expect(screen.getByTestId("header-total-value")).toHaveTextContent("$10,095.00");
    expect(screen.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
  });

  it("selects a ticker into the main chart and trade bar, and shows trade errors", async () => {
    render(<Terminal />);
    await screen.findByTestId("watchlist-row-MSFT");
    await userEvent.click(screen.getByTestId("watchlist-row-MSFT"));
    expect(screen.getByTestId("main-chart")).toHaveAttribute("data-ticker", "MSFT");
    expect(screen.getByTestId("trade-ticker-input")).toHaveValue("MSFT");

    await userEvent.click(screen.getByTestId("trade-buy-button"));
    expect(await screen.findByTestId("trade-error")).toHaveTextContent("Insufficient cash");
  });
});
