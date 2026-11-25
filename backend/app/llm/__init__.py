"""LLM chat assistant for FinAlly.

Public API:
    router        - FastAPI router with POST /api/chat and GET /api/chat/history
    handle_chat   - Orchestrates one chat turn
    LLMResponse   - Structured-output schema
"""

from .chat import handle_chat
from .router import router
from .schema import LLMResponse, TradeAction, WatchlistChange

__all__ = ["router", "handle_chat", "LLMResponse", "TradeAction", "WatchlistChange"]
