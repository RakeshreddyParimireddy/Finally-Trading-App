"""Chat API: POST /api/chat and GET /api/chat/history (API_CONTRACT §5)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .chat import get_history, handle_chat

router = APIRouter()


class ChatRequest(BaseModel):
    message: str = ""


@router.post("/api/chat")
async def post_chat(body: ChatRequest, request: Request) -> dict:
    ctx = getattr(request.app.state, "ctx", None)
    try:
        return await handle_chat(ctx, body.message)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/chat/history")
def chat_history() -> list[dict]:
    return get_history(limit=50)
