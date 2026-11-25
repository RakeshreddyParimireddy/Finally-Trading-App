from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.services import watchlist as svc

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class AddTickerRequest(BaseModel):
    ticker: Any  # validated by the service layer (400 on bad format)


@router.get("")
async def get_watchlist(request: Request) -> list[dict]:
    return svc.get_watchlist(request.app.state.ctx)


@router.post("")
async def add_ticker(body: AddTickerRequest, request: Request) -> list[dict]:
    return await svc.add_ticker(request.app.state.ctx, body.ticker)


@router.delete("/{ticker}")
async def remove_ticker(ticker: str, request: Request) -> list[dict]:
    return await svc.remove_ticker(request.app.state.ctx, ticker)
