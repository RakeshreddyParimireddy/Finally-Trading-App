"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatPrice, formatQty } from "@/lib/format";
import type { ChatActions, ChatMessage, TradeAction, WatchlistAction } from "@/lib/types";

interface ChatPanelProps {
  loadHistory: () => Promise<ChatMessage[]>;
  send: (message: string) => Promise<ChatMessage>;
  /** Called after an assistant reply that executed at least one action. */
  onActionsExecuted?: (actions: ChatActions) => void;
  defaultOpen?: boolean;
}

function tradeLabel(t: TradeAction): string {
  const verb = t.side === "buy" ? "Bought" : "Sold";
  if (t.status === "executed") {
    return `${verb} ${formatQty(t.quantity)} ${t.ticker}${t.price != null ? ` @ $${formatPrice(t.price)}` : ""}`;
  }
  return `Could not ${t.side} ${formatQty(t.quantity)} ${t.ticker}${t.error ? `: ${t.error}` : ""}`;
}

function watchLabel(w: WatchlistAction): string {
  if (w.status === "executed") {
    return w.action === "add" ? `Added ${w.ticker} to watchlist` : `Removed ${w.ticker} from watchlist`;
  }
  return `Could not ${w.action} ${w.ticker}${w.error ? `: ${w.error}` : ""}`;
}

export function ActionList({ actions }: { actions: ChatActions | null }) {
  const trades = actions?.trades ?? [];
  const changes = actions?.watchlist_changes ?? [];
  if (!trades.length && !changes.length) return null;
  const items = [
    ...trades.map((t) => ({ ok: t.status === "executed", text: tradeLabel(t), kind: t.side })),
    ...changes.map((w) => ({ ok: w.status === "executed", text: watchLabel(w), kind: "watch" as const })),
  ];
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {items.map((it, i) => (
        <li
          key={i}
          data-testid="chat-action"
          data-status={it.ok ? "executed" : "failed"}
          className={`flex items-start gap-1.5 border-l-2 bg-bg/60 px-2 py-1 text-[12px] ${
            it.ok
              ? it.kind === "sell"
                ? "border-down text-text"
                : it.kind === "buy"
                  ? "border-up text-text"
                  : "border-blue text-text"
              : "border-accent text-accent"
          }`}
        >
          <span aria-hidden className="mt-px">
            {it.ok ? "✓" : "!"}
          </span>
          <span className="num">{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

function hasExecuted(actions: ChatActions | null): boolean {
  return Boolean(
    actions?.trades?.some((t) => t.status === "executed") ||
      actions?.watchlist_changes?.some((w) => w.status === "executed"),
  );
}

export function ChatPanel({ loadHistory, send, onActionsExecuted, defaultOpen = true }: ChatPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadHistory()
      .then((h) => {
        if (alive) setMessages((cur) => (cur.length ? cur : h));
      })
      .catch(() => {
        /* history is optional; the panel still works */
      });
    return () => {
      alive = false;
    };
  }, [loadHistory]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    const local: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      actions: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, local]);
    setLoading(true);
    try {
      const reply = await send(text);
      setMessages((m) => [...m, reply]);
      if (hasExecuted(reply.actions) && reply.actions) onActionsExecuted?.(reply.actions);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `local-err-${Date.now()}`,
          role: "assistant",
          content: `I couldn't reach the server (${err instanceof Error ? err.message : "unknown error"}). Try again in a moment.`,
          actions: null,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <aside data-testid="chat-panel" data-open="false" className="flex w-10 shrink-0 flex-col border-l border-line bg-panel">
        <button
          type="button"
          data-testid="chat-toggle"
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="flex flex-1 flex-col items-center gap-2 pt-3 text-muted hover:text-text"
        >
          <span aria-hidden className="block h-4 w-1 bg-purple" />
          <span className="text-[12px] font-semibold [writing-mode:vertical-rl]">Assistant</span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="chat-panel"
      data-open="true"
      className="flex w-full shrink-0 flex-col border-l border-line bg-panel lg:w-[340px] xl:w-[380px]"
    >
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-[12px] font-semibold text-text">
          Assistant <span className="font-normal text-muted">can analyse and trade for you</span>
        </h2>
        <button
          type="button"
          data-testid="chat-toggle"
          onClick={() => setOpen(false)}
          aria-label="Collapse assistant"
          className="h-5 w-5 text-muted hover:text-text"
        >
          »
        </button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {messages.length === 0 && !loading ? (
          <div className="space-y-2 text-[12.5px] text-muted">
            <p>Ask about your portfolio, or tell me what to do. For example:</p>
            <ul className="space-y-1">
              {["How concentrated is my portfolio?", "Buy 5 NVDA", "Watch PYPL"].map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setDraft(s)}
                    className="text-left text-blue hover:underline"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            data-testid="chat-message"
            data-role={m.role}
            className={m.role === "user" ? "ml-8 flex justify-end" : "mr-4"}
          >
            <div
              className={
                m.role === "user"
                  ? "bg-raised px-2.5 py-1.5 text-[13px] whitespace-pre-wrap text-text"
                  : "border-l-2 border-accent/70 pl-2.5 text-[13px] whitespace-pre-wrap text-text"
              }
            >
              {m.content}
              {m.role === "assistant" ? <ActionList actions={m.actions} /> : null}
            </div>
          </div>
        ))}

        {loading ? (
          <div data-testid="chat-loading" role="status" className="flex items-center gap-2 text-[12px] text-muted">
            <span className="flex gap-1" aria-hidden>
              <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-accent [animation-delay:150ms]" />
              <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-accent [animation-delay:300ms]" />
            </span>
            Thinking…
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} className="flex shrink-0 gap-1.5 border-t border-line p-2">
        <input
          data-testid="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the assistant"
          aria-label="Message the assistant"
          className="min-w-0 flex-1 border border-line bg-bg px-2 py-1.5 text-[13px] placeholder:text-faint focus:border-blue focus:outline-none"
        />
        <button
          type="submit"
          data-testid="chat-send"
          disabled={loading || !draft.trim()}
          className="bg-purple px-3 text-[13px] font-semibold text-white hover:bg-purple-hi disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
