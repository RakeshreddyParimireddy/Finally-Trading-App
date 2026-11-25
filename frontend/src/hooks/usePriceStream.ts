"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { priceStore, type PriceStore } from "@/lib/priceStore";
import type { ConnectionStatus, PriceEvent } from "@/lib/types";

export interface PriceStreamOptions {
  url?: string;
  store?: PriceStore;
  /** Delay before re-creating the EventSource after the browser gives up (readyState CLOSED). */
  retryMs?: number;
}

/**
 * Opens one EventSource to /api/stream/prices, feeds the price store and
 * reports connection status:
 *  - "reconnecting" while connecting, or while the browser auto-retries
 *  - "connected" once the stream is open
 *  - "disconnected" when the browser has given up; we reopen after `retryMs`
 */
export function usePriceStream({
  url = `${API_BASE}/api/stream/prices`,
  store = priceStore,
  retryMs = 3000,
}: PriceStreamOptions = {}): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("reconnecting");

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const source = new EventSource(url);
      es = source;
      source.onopen = () => setStatus("connected");
      source.onmessage = (ev: MessageEvent) => {
        try {
          store.ingest(JSON.parse(ev.data) as PriceEvent);
          setStatus("connected");
        } catch {
          /* ignore malformed frames */
        }
      };
      source.onerror = () => {
        if (es !== source) return;
        if (source.readyState === 2 /* CLOSED */) {
          setStatus("disconnected");
          source.close();
          es = null;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            setStatus("reconnecting");
            connect();
          }, retryMs);
        } else {
          setStatus("reconnecting");
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      es = null;
    };
  }, [url, store, retryMs]);

  return status;
}
