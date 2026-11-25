"""HTTP shapes for /api/chat and /api/chat/history."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.llm.router import router


@pytest.fixture
def http(mock_env, fake_db, fake_services):
    app = FastAPI()
    app.include_router(router)
    app.state.ctx = object()
    return TestClient(app)


def test_post_chat_shape(http):
    r = http.post("/api/chat", json={"message": "buy 5 NVDA"})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"id", "role", "content", "actions", "created_at"}
    assert body["role"] == "assistant"
    assert body["actions"]["trades"] == [
        {"ticker": "NVDA", "side": "buy", "quantity": 5.0, "status": "executed", "price": 880.0}]
    assert body["actions"]["watchlist_changes"] == []


def test_post_chat_watchlist_failure_shape(http):
    body = http.post("/api/chat", json={"message": "unwatch QQQ"}).json()
    change = body["actions"]["watchlist_changes"][0]
    assert change["status"] == "failed" and change["error"]
    assert "Some actions could not be completed:\n- remove QQQ:" in body["content"]


@pytest.mark.parametrize("payload", [{"message": ""}, {"message": "   "}, {}])
def test_post_chat_empty_is_400(http, payload):
    r = http.post("/api/chat", json=payload)
    assert r.status_code == 400
    assert "detail" in r.json()


def test_missing_key_returns_200(http, monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "false")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    r = http.post("/api/chat", json={"message": "hello"})
    assert r.status_code == 200
    assert r.json()["actions"] == {"trades": [], "watchlist_changes": []}


def test_history(http):
    http.post("/api/chat", json={"message": "hi"})
    r = http.get("/api/chat/history")
    assert r.status_code == 200
    rows = r.json()
    assert [m["role"] for m in rows] == ["user", "assistant"]
    assert rows[0]["actions"] is None
    for m in rows:
        assert set(m) == {"id", "role", "content", "actions", "created_at"}
