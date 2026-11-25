"""System prompt, portfolio context and message assembly for the chat LLM."""

from __future__ import annotations

from typing import Any

HISTORY_LIMIT = 20

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant inside a simulated trading workstation.
The user trades a virtual portfolio with fake money; market orders fill instantly at the current price.

Your job:
- Analyze the portfolio: composition, risk concentration, cash level and P&L.
- Suggest trades with brief, data-driven reasoning.
- Execute trades when the user asks for them or agrees to your suggestion, by listing them in "trades".
- Manage the watchlist proactively by listing changes in "watchlist_changes" (action "add" or "remove").
- Be concise and data-driven. Quote numbers from the portfolio context, never invent prices.

Rules:
- Only include trades the user asked for or explicitly agreed to. Never trade on your own initiative.
- Quantities must be positive numbers of shares (fractional allowed). Buys need enough cash; sells need enough shares.
- Use upper-case ticker symbols.
- If no action is needed, return empty "trades" and "watchlist_changes" arrays.
- Always respond with valid JSON matching the schema: {"message": str, "trades": [{"ticker", "side", "quantity"}], "watchlist_changes": [{"ticker", "action"}]}.
"""


def _money(value: Any) -> str:
    try:
        return f"${float(value):,.2f}"
    except (TypeError, ValueError):
        return "n/a"


def _pct(value: Any) -> str:
    try:
        return f"{float(value):+.2f}%"
    except (TypeError, ValueError):
        return "n/a"


def build_portfolio_context(portfolio: dict | None, watchlist: list[dict] | None) -> str:
    """Render the user's portfolio and watchlist as compact text for the prompt."""
    lines: list[str] = ["# Current portfolio"]
    if portfolio:
        lines.append(f"Cash: {_money(portfolio.get('cash_balance'))}")
        lines.append(f"Positions value: {_money(portfolio.get('positions_value'))}")
        lines.append(f"Total value: {_money(portfolio.get('total_value'))}")
        lines.append(f"Unrealized P&L: {_money(portfolio.get('unrealized_pnl'))}")
        positions = portfolio.get("positions") or []
        if positions:
            lines.append("Positions:")
            total = portfolio.get("total_value") or 0
            for p in positions:
                weight = ""
                try:
                    if total:
                        weight = f", weight {float(p.get('market_value', 0)) / float(total) * 100:.1f}%"
                except (TypeError, ValueError):
                    weight = ""
                lines.append(
                    f"- {p.get('ticker')}: qty {p.get('quantity')}, avg cost {_money(p.get('avg_cost'))}, "
                    f"price {_money(p.get('current_price'))}, value {_money(p.get('market_value'))}, "
                    f"P&L {_money(p.get('unrealized_pnl'))} ({_pct(p.get('unrealized_pnl_percent'))}){weight}"
                )
        else:
            lines.append("Positions: none")
    else:
        lines.append("Portfolio data unavailable.")

    lines.append("")
    lines.append("# Watchlist (live prices)")
    if watchlist:
        for w in watchlist:
            price = w.get("price")
            price_txt = _money(price) if price is not None else "no price yet"
            chg = w.get("session_change_percent")
            chg_txt = f", session chg {_pct(chg)}" if chg is not None else ""
            lines.append(f"- {w.get('ticker')}: {price_txt}{chg_txt}")
    else:
        lines.append("(empty or unavailable)")
    return "\n".join(lines)


def build_messages(context: str, history: list[dict], user_message: str) -> list[dict]:
    """Assemble the chat-completion message list."""
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": context},
    ]
    for m in history[-HISTORY_LIMIT:]:
        role = m.get("role")
        if role in ("user", "assistant") and m.get("content"):
            messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": user_message})
    return messages
