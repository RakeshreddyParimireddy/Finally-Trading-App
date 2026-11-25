"""Structured-output schema for the FinAlly chat assistant."""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TradeAction(BaseModel):
    """A market order the assistant wants to execute."""

    model_config = ConfigDict(extra="ignore")

    ticker: str = Field(description="Ticker symbol, e.g. AAPL")
    side: Literal["buy", "sell"] = Field(description="'buy' or 'sell'")
    quantity: float = Field(description="Number of shares (fractional allowed, > 0)")


class WatchlistChange(BaseModel):
    """A watchlist modification the assistant wants to make."""

    model_config = ConfigDict(extra="ignore")

    ticker: str = Field(description="Ticker symbol, e.g. PYPL")
    action: Literal["add", "remove"] = Field(description="'add' or 'remove'")


class LLMResponse(BaseModel):
    """The full structured response expected from the LLM."""

    model_config = ConfigDict(extra="ignore")

    message: str = Field(description="Conversational response shown to the user")
    trades: list[TradeAction] = Field(
        default_factory=list, description="Trades to execute now (empty if none)"
    )
    watchlist_changes: list[WatchlistChange] = Field(
        default_factory=list, description="Watchlist changes to make now (empty if none)"
    )


def parse_llm_response(raw: str | None) -> LLMResponse:
    """Parse raw JSON text from the LLM into an LLMResponse.

    Tolerates ``null`` lists and markdown code fences. Raises ``ValueError`` on
    anything that cannot be interpreted.
    """
    if raw is None or not raw.strip():
        raise ValueError("Empty LLM response")
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed JSON from LLM: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("LLM response is not a JSON object")
    for key in ("trades", "watchlist_changes"):
        if data.get(key) is None:
            data[key] = []
    try:
        return LLMResponse.model_validate(data)
    except Exception as exc:  # pydantic.ValidationError
        raise ValueError(f"LLM response failed validation: {exc}") from exc
