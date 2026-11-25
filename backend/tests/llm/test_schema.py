"""Structured-output parsing."""

import json

import pytest

from app.llm.schema import LLMResponse, parse_llm_response


def test_message_only():
    r = parse_llm_response('{"message": "hi"}')
    assert r.message == "hi" and r.trades == [] and r.watchlist_changes == []


def test_full_shape():
    raw = json.dumps({
        "message": "done",
        "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10},
                   {"ticker": "TSLA", "side": "sell", "quantity": 0.5}],
        "watchlist_changes": [{"ticker": "PYPL", "action": "add"},
                              {"ticker": "V", "action": "remove"}],
    })
    r = parse_llm_response(raw)
    assert [(t.ticker, t.side, t.quantity) for t in r.trades] == [("AAPL", "buy", 10.0), ("TSLA", "sell", 0.5)]
    assert [(c.ticker, c.action) for c in r.watchlist_changes] == [("PYPL", "add"), ("V", "remove")]


def test_null_lists_and_extra_fields():
    r = parse_llm_response('{"message": "x", "trades": null, "watchlist_changes": null, "extra": 1}')
    assert r.trades == [] and r.watchlist_changes == []


def test_code_fence_tolerated():
    r = parse_llm_response('```json\n{"message": "fenced"}\n```')
    assert r.message == "fenced"


@pytest.mark.parametrize("raw", [
    None, "", "   ", "not json", '{"message": ', "[1, 2]", '{"trades": []}',
    '{"message": "x", "trades": [{"ticker": "AAPL", "side": "hold", "quantity": 1}]}',
    '{"message": "x", "watchlist_changes": [{"ticker": "AAPL", "action": "flip"}]}',
    '{"message": "x", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": "lots"}]}',
])
def test_malformed_raises_value_error(raw):
    with pytest.raises(ValueError):
        parse_llm_response(raw)


def test_json_schema_has_expected_fields():
    props = LLMResponse.model_json_schema()["properties"]
    assert set(props) == {"message", "trades", "watchlist_changes"}
