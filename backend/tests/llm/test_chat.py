"""Action execution, fallbacks, history and prompt assembly."""

import pytest

from app.llm import chat, client
from app.llm.executor import FAILURE_HEADER, execute_actions
from app.llm.prompt import SYSTEM_PROMPT, build_messages, build_portfolio_context
from app.llm.schema import LLMResponse


async def test_mixed_success_and_failure(fake_services):
    resp = LLMResponse.model_validate({
        "message": "ok",
        "trades": [
            {"ticker": "aapl", "side": "buy", "quantity": 2},
            {"ticker": "NVDA", "side": "buy", "quantity": 100},  # insufficient cash
            {"ticker": "MSFT", "side": "sell", "quantity": 1},  # no shares
            {"ticker": "ZZZZ", "side": "buy", "quantity": 1},  # no price
        ],
        "watchlist_changes": [
            {"ticker": "pypl", "action": "add"},
            {"ticker": "QQQ", "action": "remove"},  # not watched
        ],
    })
    actions, failures = await execute_actions(None, resp)
    t = actions["trades"]
    assert t[0] == {"ticker": "AAPL", "side": "buy", "quantity": 2.0, "status": "executed", "price": 190.0}
    assert [x["status"] for x in t] == ["executed", "failed", "failed", "failed"]
    assert t[1]["error"].startswith("Insufficient cash")
    assert "price" not in t[1]
    w = actions["watchlist_changes"]
    assert w[0] == {"ticker": "PYPL", "action": "add", "status": "executed"}
    assert w[1]["status"] == "failed" and "not on the watchlist" in w[1]["error"]
    # in order and independent: all calls attempted
    assert [c[0] for c in fake_services.calls] == ["trade"] * 4 + ["add", "remove"]
    assert failures[0].startswith("- buy 100 NVDA: Insufficient cash")
    assert failures[1] == "- sell 1 MSFT: Insufficient shares: have 0 MSFT"
    assert failures[-1] == "- remove QQQ: QQQ is not on the watchlist"


async def test_unexpected_exception_is_reported(fake_services, monkeypatch):
    async def boom(*a):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(fake_services, "execute_trade", boom)
    resp = LLMResponse.model_validate(
        {"message": "m", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1}]})
    actions, failures = await execute_actions(None, resp)
    assert actions["trades"][0]["status"] == "failed"
    assert failures == ["- buy 1 AAPL: kaboom"]


async def test_handle_chat_mock_success(mock_env, fake_db, fake_services):
    out = await chat.handle_chat(None, "buy 5 NVDA")
    assert out["role"] == "assistant"
    assert out["content"] == "Mock: executing buy 5 NVDA."
    assert out["actions"]["trades"][0]["status"] == "executed"
    assert out["actions"]["trades"][0]["price"] == 880.0
    assert [m["role"] for m in fake_db.messages] == ["user", "assistant"]
    assert fake_db.messages[0]["content"] == "buy 5 NVDA" and fake_db.messages[0]["actions"] is None


async def test_handle_chat_appends_failure_summary(mock_env, fake_db, fake_services):
    out = await chat.handle_chat(None, "buy 1000 NVDA")
    assert out["content"].startswith("Mock: executing buy 1000 NVDA." + FAILURE_HEADER)
    assert out["content"].endswith("\n- buy 1000 NVDA: Insufficient cash: need $880000.00, have $10000.00")
    assert out["actions"]["trades"][0]["status"] == "failed"


async def test_handle_chat_mock_greeting(mock_env, fake_db, fake_services):
    out = await chat.handle_chat(None, "hi")
    assert out["actions"] == {"trades": [], "watchlist_changes": []}
    assert "mock mode" in out["content"]


async def test_empty_message_rejected(mock_env, fake_db, fake_services):
    with pytest.raises(ValueError):
        await chat.handle_chat(None, "   ")
    assert fake_db.messages == []


async def test_missing_key_fallback(monkeypatch, fake_db, fake_services):
    monkeypatch.setenv("LLM_MOCK", "false")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    out = await chat.handle_chat(None, "buy 5 NVDA")
    assert out["content"] == chat.MISSING_KEY_MESSAGE
    assert out["actions"] == {"trades": [], "watchlist_changes": []}
    assert fake_services.calls == []
    assert len(fake_db.messages) == 2


async def test_blank_key_counts_as_missing(monkeypatch, fake_db, fake_services):
    monkeypatch.setenv("LLM_MOCK", "false")
    monkeypatch.setenv("OPENROUTER_API_KEY", "   ")
    out = await chat.handle_chat(None, "hello")
    assert out["content"] == chat.MISSING_KEY_MESSAGE


@pytest.mark.parametrize("raw", ["not json", '{"nope": 1}', None])
async def test_malformed_llm_output_fallback(real_env, fake_db, fake_services, monkeypatch, raw):
    monkeypatch.setattr(client, "_call_sync", lambda messages: raw)
    out = await chat.handle_chat(None, "hello")
    assert out["content"] == chat.LLM_ERROR_MESSAGE
    assert out["actions"] == {"trades": [], "watchlist_changes": []}


async def test_network_error_fallback(real_env, fake_db, fake_services, monkeypatch):
    def fail(messages):
        raise ConnectionError("down")

    monkeypatch.setattr(client, "_call_sync", fail)
    out = await chat.handle_chat(None, "hello")
    assert out["content"] == chat.LLM_ERROR_MESSAGE


async def test_real_path_executes_actions_and_sends_context(real_env, fake_db, fake_services, monkeypatch):
    for i in range(30):
        fake_db.insert_chat_message("user" if i % 2 == 0 else "assistant", f"m{i}", None)
    captured = {}

    def fake_call(messages):
        captured["messages"] = messages
        return ('{"message": "Done.", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1}],'
                ' "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]}')

    monkeypatch.setattr(client, "_call_sync", fake_call)
    out = await chat.handle_chat(None, "buy one apple and watch paypal")
    assert out["content"] == "Done."
    assert out["actions"]["trades"][0]["status"] == "executed"
    assert out["actions"]["watchlist_changes"][0]["status"] == "executed"

    msgs = captured["messages"]
    assert msgs[0] == {"role": "system", "content": SYSTEM_PROMPT}
    assert "Cash: $10,000.00" in msgs[1]["content"]
    assert "AAPL: $190.00" in msgs[1]["content"]
    history = msgs[2:-1]
    assert len(history) == 20 and history[0]["content"] == "m10" and history[-1]["content"] == "m29"
    assert msgs[-1] == {"role": "user", "content": "buy one apple and watch paypal"}


async def test_context_failure_does_not_break_chat(real_env, fake_db, fake_services, monkeypatch):
    def broken(ctx):
        raise RuntimeError("db down")

    monkeypatch.setattr(fake_services, "get_portfolio", broken)
    monkeypatch.setattr(client, "_call_sync", lambda m: '{"message": "ok"}')
    out = await chat.handle_chat(None, "hello")
    assert out["content"] == "ok"


def test_portfolio_context_rendering():
    portfolio = {
        "cash_balance": 8095.0, "positions_value": 1912.0, "total_value": 10007.0, "unrealized_pnl": 7.0,
        "positions": [{"ticker": "AAPL", "quantity": 10.0, "avg_cost": 190.5, "current_price": 191.2,
                       "market_value": 1912.0, "unrealized_pnl": 7.0, "unrealized_pnl_percent": 0.3675}],
    }
    watch = [{"ticker": "AAPL", "price": 191.2, "session_change_percent": 0.79},
             {"ticker": "NEW", "price": None, "session_change_percent": None}]
    text = build_portfolio_context(portfolio, watch)
    assert "Total value: $10,007.00" in text
    assert "P&L $7.00 (+0.37%)" in text and "weight 19.1%" in text
    assert "NEW: no price yet" in text
    assert "Portfolio data unavailable" in build_portfolio_context(None, None)


def test_build_messages_skips_bad_roles():
    msgs = build_messages("ctx", [{"role": "system", "content": "x"}, {"role": "user", "content": ""}], "q")
    assert [m["role"] for m in msgs] == ["system", "system", "user"]
