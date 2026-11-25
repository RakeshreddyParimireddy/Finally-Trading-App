import type {
  ChatMessage,
  Portfolio,
  Side,
  Snapshot,
  TradeResponse,
  WatchlistItem,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

function detailText(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  // FastAPI request-validation errors: [{msg: "..."}]
  if (Array.isArray(detail) && detail.length && typeof detail[0]?.msg === "string") {
    return detail.map((d) => d.msg).join("; ");
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that FinAlly is running.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = detailText(body?.detail, detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  getPortfolio: () => request<Portfolio>("/api/portfolio"),
  getHistory: () => request<Snapshot[]>("/api/portfolio/history"),
  trade: (ticker: string, side: Side, quantity: number) =>
    request<TradeResponse>("/api/portfolio/trade", {
      method: "POST",
      body: JSON.stringify({ ticker, side, quantity }),
    }),
  getWatchlist: () => request<WatchlistItem[]>("/api/watchlist"),
  addTicker: (ticker: string) =>
    request<WatchlistItem[]>("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ ticker }),
    }),
  removeTicker: (ticker: string) =>
    request<WatchlistItem[]>(`/api/watchlist/${encodeURIComponent(ticker)}`, {
      method: "DELETE",
    }),
  sendChat: (message: string) =>
    request<ChatMessage>("/api/chat", { method: "POST", body: JSON.stringify({ message }) }),
  getChatHistory: () => request<ChatMessage[]>("/api/chat/history"),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
