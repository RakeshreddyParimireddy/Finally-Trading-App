import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";
import { PriceStore } from "@/lib/priceStore";
import { MockEventSource } from "@/test/mockEventSource";
import { priceUpdate } from "@/test/fixtures";
import { usePriceStream } from "./usePriceStream";

function Harness({ store, retryMs = 1000 }: { store: PriceStore; retryMs?: number }) {
  const status = usePriceStream({ store, retryMs });
  return <Header totals={null} status={status} />;
}

const dot = () => screen.getByTestId("connection-status");

describe("usePriceStream / connection status", () => {
  beforeEach(() => {
    MockEventSource.reset();
    vi.stubGlobal("EventSource", MockEventSource);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a single EventSource on /api/stream/prices", () => {
    render(<Harness store={new PriceStore()} />);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.latest().url).toBe("/api/stream/prices");
    expect(dot()).toHaveAttribute("data-status", "reconnecting");
  });

  it("goes connected on open and feeds the store on messages", () => {
    const store = new PriceStore();
    render(<Harness store={store} />);
    act(() => MockEventSource.latest().open());
    expect(dot()).toHaveAttribute("data-status", "connected");

    act(() => MockEventSource.latest().emit({ AAPL: priceUpdate("AAPL", 191.25) }));
    expect(store.getPrices().AAPL.price).toBe(191.25);
    expect(store.getHistory("AAPL")).toHaveLength(1);
  });

  it("shows reconnecting during a transient drop, then connected again", () => {
    render(<Harness store={new PriceStore()} />);
    const es = MockEventSource.latest();
    act(() => es.open());
    act(() => es.drop());
    expect(dot()).toHaveAttribute("data-status", "reconnecting");
    act(() => es.open()); // browser auto-retry succeeded
    expect(dot()).toHaveAttribute("data-status", "connected");
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("goes disconnected when the browser gives up, then reopens after the retry delay", () => {
    render(<Harness store={new PriceStore()} retryMs={1000} />);
    const first = MockEventSource.latest();
    act(() => first.open());
    act(() => first.fail());
    expect(dot()).toHaveAttribute("data-status", "disconnected");
    expect(first.closed).toBe(true);

    act(() => vi.advanceTimersByTime(999));
    expect(MockEventSource.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(MockEventSource.instances).toHaveLength(2);
    expect(dot()).toHaveAttribute("data-status", "reconnecting");

    act(() => MockEventSource.latest().open());
    expect(dot()).toHaveAttribute("data-status", "connected");
  });

  it("ignores malformed frames and closes on unmount", () => {
    const store = new PriceStore();
    const { unmount } = render(<Harness store={store} />);
    const es = MockEventSource.latest();
    act(() => es.onmessage?.(new MessageEvent("message", { data: "not json" })));
    expect(store.getPrices()).toEqual({});
    unmount();
    expect(es.closed).toBe(true);
  });
});
