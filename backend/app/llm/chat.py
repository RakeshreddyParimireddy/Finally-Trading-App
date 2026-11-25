"""Chat orchestration: context -> LLM (or mock) -> actions -> persistence."""

from __future__ import annotations

import logging
from typing import Any

from . import client, deps
from .executor import append_failure_summary, execute_actions
from .mock import mock_response
from .prompt import HISTORY_LIMIT, build_messages, build_portfolio_context
from .schema import LLMResponse

logger = logging.getLogger(__name__)

MISSING_KEY_MESSAGE = (
    "The AI assistant isn't configured yet: no OPENROUTER_API_KEY is set. "
    "Add it to the .env file and restart. Trading and the watchlist still work normally."
)
LLM_ERROR_MESSAGE = (
    "Sorry, I couldn't get a response from the AI service just now. "
    "Please try again in a moment. No trades or watchlist changes were made."
)


def empty_actions() -> dict:
    return {"trades": [], "watchlist_changes": []}


def _load_context(ctx: Any) -> str:
    services = deps.services()
    portfolio = watchlist = None
    try:
        portfolio = services.get_portfolio(ctx)
    except Exception:
        logger.exception("Could not load portfolio for chat context")
    try:
        watchlist = services.get_watchlist(ctx)
    except Exception:
        logger.exception("Could not load watchlist for chat context")
    return build_portfolio_context(portfolio, watchlist)


async def _get_response(ctx: Any, message: str, history: list[dict]) -> LLMResponse | str:
    """Return an LLMResponse, or a friendly fallback string on failure."""
    if client.is_mock_mode():
        return mock_response(message)
    if not client.has_api_key():
        return MISSING_KEY_MESSAGE
    messages = build_messages(_load_context(ctx), history, message)
    try:
        return await client.call_llm(messages)
    except client.LLMUnavailableError:
        return MISSING_KEY_MESSAGE
    except Exception:
        logger.exception("LLM call failed")
        return LLM_ERROR_MESSAGE


async def handle_chat(ctx: Any, message: str) -> dict:
    """Process one user chat message and return the stored assistant message.

    Raises ValueError if the message is empty.
    """
    text = (message or "").strip()
    if not text:
        raise ValueError("Message must not be empty")

    db = deps.db()
    history = db.get_chat_messages(limit=HISTORY_LIMIT)
    db.insert_chat_message("user", text, None)

    result = await _get_response(ctx, text, history)
    if isinstance(result, str):
        content, actions = result, empty_actions()
    else:
        actions, failures = await execute_actions(ctx, result)
        content = append_failure_summary(result.message, failures)

    return db.insert_chat_message("assistant", content, actions)


def get_history(limit: int = 50) -> list[dict]:
    return deps.db().get_chat_messages(limit=limit)
