"""Fakes for app.db and app.services so LLM tests run in isolation."""

from __future__ import annotations

import sys
import types
import uuid
from datetime import datetime, timezone

import pytest


class FakeServiceError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class FakeDB(types.ModuleType):
    def __init__(self):
        super().__init__("app.db")
        self.messages: list[dict] = []

    def insert_chat_message(self, role, content, actions, user_id="default"):
        msg = {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "actions": actions,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.messages.append(msg)
        return msg

    def get_chat_messages(self, limit=50, user_id="default"):
        return list(self.messages[-limit:])


class FakeServices(types.ModuleType):
    """Cash-checked, share-checked fake of the services layer."""

    ServiceError = FakeServiceError

    def __init__(self):
        super().__init__("app.services")
        self.prices = {"AAPL": 190.0, "NVDA": 880.0, "MSFT": 400.0}
        self.cash = 10000.0
        self.positions: dict[str, float] = {}
        self.watchlist = ["AAPL", "NVDA", "MSFT"]
        self.calls: list[tuple] = []

    def get_portfolio(self, ctx):
        positions = [
            {
                "ticker": t,
                "quantity": q,
                "avg_cost": self.prices[t],
                "current_price": self.prices[t],
                "market_value": q * self.prices[t],
                "cost_basis": q * self.prices[t],
                "unrealized_pnl": 0.0,
                "unrealized_pnl_percent": 0.0,
            }
            for t, q in self.positions.items()
        ]
        pv = sum(p["market_value"] for p in positions)
        return {
            "cash_balance": self.cash,
            "positions": positions,
            "positions_value": pv,
            "total_value": self.cash + pv,
            "unrealized_pnl": 0.0,
        }

    def get_watchlist(self, ctx):
        return [
            {"ticker": t, "price": self.prices.get(t), "session_change_percent": 0.5}
            for t in self.watchlist
        ]

    async def execute_trade(self, ctx, ticker, side, quantity):
        self.calls.append(("trade", ticker, side, quantity))
        if ticker not in self.prices:
            raise FakeServiceError(f"Price unavailable for {ticker}", 409)
        price = self.prices[ticker]
        if side == "buy":
            cost = price * quantity
            if cost > self.cash:
                raise FakeServiceError(f"Insufficient cash: need ${cost:.2f}, have ${self.cash:.2f}")
            self.cash -= cost
            self.positions[ticker] = self.positions.get(ticker, 0) + quantity
        else:
            have = self.positions.get(ticker, 0)
            if quantity > have:
                raise FakeServiceError(f"Insufficient shares: have {have:g} {ticker}")
            self.cash += price * quantity
            self.positions[ticker] = have - quantity
        trade = {"id": "t1", "ticker": ticker, "side": side, "quantity": float(quantity),
                 "price": price, "executed_at": "now"}
        return {"trade": trade, "portfolio": self.get_portfolio(ctx)}

    async def add_ticker(self, ctx, ticker):
        self.calls.append(("add", ticker))
        if ticker not in self.watchlist:
            self.watchlist.append(ticker)
        return self.get_watchlist(ctx)

    async def remove_ticker(self, ctx, ticker):
        self.calls.append(("remove", ticker))
        if ticker not in self.watchlist:
            raise FakeServiceError(f"{ticker} is not on the watchlist", 404)
        self.watchlist.remove(ticker)
        return self.get_watchlist(ctx)


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeDB()
    monkeypatch.setitem(sys.modules, "app.db", db)
    return db


@pytest.fixture
def fake_services(monkeypatch):
    svc = FakeServices()
    monkeypatch.setitem(sys.modules, "app.services", svc)
    return svc


@pytest.fixture
def mock_env(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)


@pytest.fixture
def real_env(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "false")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Guarantee no test ever reaches the real LLM."""
    from app.llm import client

    def _boom(messages):
        raise AssertionError("real LLM call attempted in tests")

    monkeypatch.setattr(client, "_call_sync", _boom)
