import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePositions, portfolioTotals } from "@/lib/portfolio";
import type { ChatMessage } from "@/lib/types";
import { assistantWithActions, portfolioFixture, priceUpdate } from "@/test/fixtures";
import { ChatPanel } from "./ChatPanel";
import { Header } from "./Header";
import { Heatmap } from "./Heatmap";
import { PnlChart } from "./PnlChart";
import { PositionsTable } from "./PositionsTable";
import { PriceCell } from "./PriceCell";
import { TradeBar } from "./TradeBar";
import { Watchlist } from "./Watchlist";

describe("PriceCell flash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flashes green on an uptick and clears after ~300ms", () => {
    const { rerender } = render(<PriceCell price={100} testId="p" />);
    const el = screen.getByTestId("p");
    expect(el).toHaveTextContent("100.00");
    expect(el.className).not.toMatch(/flash/);

    rerender(<PriceCell price={100.5} testId="p" />);
    expect(el).toHaveClass("flash-up");
    act(() => vi.advanceTimersByTime(300));
    expect(el).not.toHaveClass("flash-up");
  });

  it("flashes red on a downtick", () => {
    const { rerender } = render(<PriceCell price={100} testId="p" />);
    rerender(<PriceCell price={99.9} testId="p" />);
    expect(screen.getByTestId("p")).toHaveClass("flash-down");
  });

  it("does not flash for moves under $0.01", () => {
    const { rerender } = render(<PriceCell price={100} testId="p" />);
    rerender(<PriceCell price={100.004} testId="p" />);
    expect(screen.getByTestId("p").className).not.toMatch(/flash/);
  });

  it("prints parseable numbers without thousands separators", () => {
    render(<PriceCell price={1234.5} testId="p" />);
    expect(screen.getByTestId("p")).toHaveTextContent("1234.50");
  });
});

describe("Header", () => {
  it("shows formatted totals and the connection status", () => {
    const totals = portfolioTotals(portfolioFixture, { AAPL: priceUpdate("AAPL", 200) });
    render(<Header totals={totals} status="connected" />);
    expect(screen.getByTestId("header-total-value")).toHaveTextContent("$10,095.00");
    expect(screen.getByTestId("header-cash")).toHaveTextContent("$8,095.00");
    expect(screen.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
  });
});

describe("Watchlist", () => {
  const prices = {
    AAPL: priceUpdate("AAPL", 190.5, { session_change_percent: 0.79 }),
    MSFT: priceUpdate("MSFT", 420.1, { session_change_percent: -0.21 }),
  };

  function setup(overrides: Partial<React.ComponentProps<typeof Watchlist>> = {}) {
    const props = {
      tickers: ["AAPL", "MSFT"],
      prices,
      selected: "AAPL",
      onSelect: vi.fn(),
      onAdd: vi.fn().mockResolvedValue(undefined),
      onRemove: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    render(<Watchlist {...props} />);
    return props;
  }

  it("renders a row per ticker with price and Chg %", () => {
    setup();
    expect(screen.getByTestId("watchlist")).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-price-AAPL")).toHaveTextContent("190.50");
    const msft = screen.getByTestId("watchlist-row-MSFT");
    expect(msft).toHaveTextContent("-0.21%");
    expect(screen.getByTestId("watchlist-row-AAPL")).toHaveTextContent("+0.79%");
  });

  it("selects a ticker on row click", async () => {
    const props = setup();
    await userEvent.click(screen.getByTestId("watchlist-row-MSFT"));
    expect(props.onSelect).toHaveBeenCalledWith("MSFT");
  });

  it("adds a ticker typed in lower case", async () => {
    const props = setup();
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "pypl");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(props.onAdd).toHaveBeenCalledWith("PYPL");
    await waitFor(() => expect(screen.getByTestId("watchlist-add-input")).toHaveValue(""));
  });

  it("removes a ticker without selecting the row", async () => {
    const props = setup();
    await userEvent.click(screen.getByTestId("watchlist-remove-MSFT"));
    expect(props.onRemove).toHaveBeenCalledWith("MSFT");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("shows the API error when adding fails", async () => {
    setup({ onAdd: vi.fn().mockRejectedValue(new Error("Invalid ticker")) });
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "XYZ");
    await userEvent.click(screen.getByTestId("watchlist-add-button"));
    expect(await screen.findByTestId("watchlist-error")).toHaveTextContent("Invalid ticker");
  });
});

describe("TradeBar", () => {
  it("submits trades and shows {detail} errors in trade-error", async () => {
    const onTrade = vi
      .fn()
      .mockRejectedValueOnce(new Error("Insufficient cash: need $X, have $Y"))
      .mockResolvedValueOnce("Sold 2 AAPL @ $190.00");
    render(<TradeBar ticker="AAPL" onTickerChange={() => {}} onTrade={onTrade} />);
    expect(screen.queryByTestId("trade-error")).not.toBeInTheDocument();

    const qty = screen.getByTestId("trade-quantity-input");
    await userEvent.clear(qty);
    await userEvent.type(qty, "2");
    await userEvent.click(screen.getByTestId("trade-buy-button"));
    expect(onTrade).toHaveBeenCalledWith("AAPL", "buy", 2);
    expect(await screen.findByTestId("trade-error")).toHaveTextContent("Insufficient cash");

    await userEvent.click(screen.getByTestId("trade-sell-button"));
    expect(onTrade).toHaveBeenLastCalledWith("AAPL", "sell", 2);
    await waitFor(() => expect(screen.queryByTestId("trade-error")).not.toBeInTheDocument());
  });

  it("validates quantity locally", async () => {
    const onTrade = vi.fn();
    render(<TradeBar ticker="AAPL" onTickerChange={() => {}} onTrade={onTrade} />);
    await userEvent.clear(screen.getByTestId("trade-quantity-input"));
    await userEvent.click(screen.getByTestId("trade-buy-button"));
    expect(onTrade).not.toHaveBeenCalled();
    expect(screen.getByTestId("trade-error")).toBeVisible();
  });
});

describe("Portfolio views", () => {
  const live = livePositions(portfolioFixture.positions, { AAPL: priceUpdate("AAPL", 200) });

  it("positions table renders rows with live P&L", () => {
    render(<PositionsTable positions={live} />);
    const row = screen.getByTestId("position-row-AAPL");
    expect(within(screen.getByTestId("positions-table")).getByTestId("position-row-AAPL")).toBe(row);
    expect(row).toHaveTextContent("$2,000.00");
    expect(row).toHaveTextContent("+$95.00");
  });

  it("heatmap renders a coloured cell per position", () => {
    render(<Heatmap positions={live} width={400} height={200} />);
    const cell = screen.getByTestId("heatmap-cell-AAPL");
    expect(cell).toHaveAttribute("data-pnl-percent", ((95 / 1905) * 100).toFixed(2));
    expect(cell.querySelector("rect")).toHaveAttribute("fill", "rgb(22, 163, 106)");
  });

  it("heatmap shows an empty state with no positions", () => {
    render(<Heatmap positions={[]} />);
    expect(screen.getByTestId("heatmap")).toHaveTextContent("No positions yet");
  });

  it("P&L chart exposes the snapshot count", () => {
    render(
      <PnlChart
        history={[
          { total_value: 10000, recorded_at: "2026-11-25T10:00:00+00:00" },
          { total_value: 10010, recorded_at: "2026-11-25T10:00:30+00:00" },
          { total_value: 10005, recorded_at: "2026-11-25T10:01:00+00:00" },
        ]}
      />,
    );
    expect(screen.getByTestId("pnl-chart")).toHaveAttribute("data-points", "3");
  });
});

describe("ChatPanel", () => {
  it("loads history on mount, nesting actions inside the assistant message", async () => {
    const history: ChatMessage[] = [
      { id: "u1", role: "user", content: "buy 5 NVDA", actions: null, created_at: "x" },
      assistantWithActions,
    ];
    render(<ChatPanel loadHistory={() => Promise.resolve(history)} send={vi.fn()} />);
    const msgs = await screen.findAllByTestId("chat-message");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toHaveAttribute("data-role", "user");
    expect(msgs[1]).toHaveAttribute("data-role", "assistant");
    const actions = within(msgs[1]).getAllByTestId("chat-action");
    expect(actions).toHaveLength(2);
    expect(actions[0]).toHaveTextContent("Bought 5 NVDA @ $880.10");
    expect(actions[1]).toHaveTextContent("Could not add PYPL: Bad ticker");
    expect(actions[1]).toHaveAttribute("data-status", "failed");
  });

  it("shows the loading state while waiting and calls back when actions executed", async () => {
    let resolve!: (m: ChatMessage) => void;
    const send = vi.fn(() => new Promise<ChatMessage>((r) => (resolve = r)));
    const onActionsExecuted = vi.fn();
    render(
      <ChatPanel loadHistory={() => Promise.resolve([])} send={send} onActionsExecuted={onActionsExecuted} />,
    );
    expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument();

    await userEvent.type(screen.getByTestId("chat-input"), "buy 5 NVDA");
    await userEvent.click(screen.getByTestId("chat-send"));
    expect(send).toHaveBeenCalledWith("buy 5 NVDA");
    expect(screen.getByTestId("chat-loading")).toBeVisible();
    expect(screen.getAllByTestId("chat-message")[0]).toHaveAttribute("data-role", "user");

    await act(async () => resolve(assistantWithActions));
    expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("chat-message")).toHaveLength(2);
    expect(onActionsExecuted).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when no action executed, and reports send failures", async () => {
    const onActionsExecuted = vi.fn();
    const send = vi
      .fn()
      .mockResolvedValueOnce({ id: "a", role: "assistant", content: "Hello!", actions: { trades: [] }, created_at: "x" })
      .mockRejectedValueOnce(new Error("boom"));
    render(<ChatPanel loadHistory={() => Promise.resolve([])} send={send} onActionsExecuted={onActionsExecuted} />);
    await userEvent.type(screen.getByTestId("chat-input"), "hi");
    await userEvent.click(screen.getByTestId("chat-send"));
    await screen.findByText("Hello!");
    expect(onActionsExecuted).not.toHaveBeenCalled();
    expect(screen.queryByTestId("chat-action")).not.toBeInTheDocument();

    await userEvent.type(screen.getByTestId("chat-input"), "again");
    await userEvent.click(screen.getByTestId("chat-send"));
    expect(await screen.findByText(/couldn't reach the server \(boom\)/)).toBeInTheDocument();
  });

  it("collapses and expands", async () => {
    render(<ChatPanel loadHistory={() => Promise.resolve([])} send={vi.fn()} />);
    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-open", "false");
    expect(screen.queryByTestId("chat-input")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
  });
});
