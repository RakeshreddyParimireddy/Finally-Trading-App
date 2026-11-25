from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.services import portfolio as svc
from app.services import snapshots

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class TradeRequest(BaseModel):
    # Loosely typed on purpose: the service validates and returns 400 {"detail"}.
    ticker: Any
    side: Any
    quantity: Any


@router.get("")
async def get_portfolio(request: Request) -> dict:
    return svc.get_portfolio(request.app.state.ctx)


@router.post("/trade")
async def trade(body: TradeRequest, request: Request) -> dict:
    return await svc.execute_trade(request.app.state.ctx, body.ticker, body.side, body.quantity)


@router.get("/history")
async def history() -> list[dict]:
    return snapshots.get_history()
