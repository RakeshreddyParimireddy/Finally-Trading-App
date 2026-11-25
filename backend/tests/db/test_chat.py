"""Chat message persistence."""

from app import db


def test_user_message_round_trip(db_path):
    msg = db.insert_chat_message("user", "hello", None)
    assert set(msg) == {"id", "role", "content", "actions", "created_at"}
    assert msg["actions"] is None
    assert db.get_chat_messages() == [msg]


def test_actions_stored_as_json_and_parsed(db_path):
    actions = {
        "trades": [
            {"ticker": "NVDA", "side": "buy", "quantity": 5, "status": "executed", "price": 880.1}
        ],
        "watchlist_changes": [
            {"ticker": "PYPL", "action": "add", "status": "failed", "error": "nope"}
        ],
    }
    msg = db.insert_chat_message("assistant", "Bought 5 NVDA", actions)
    assert msg["actions"] == actions
    [loaded] = db.get_chat_messages()
    assert loaded["actions"] == actions
    assert loaded["id"] == msg["id"]

    with db.get_connection() as conn:
        raw = conn.execute("SELECT actions FROM chat_messages").fetchone()[0]
    assert isinstance(raw, str)


def test_empty_actions_dict_preserved(db_path):
    db.insert_chat_message("assistant", "hi", {"trades": [], "watchlist_changes": []})
    assert db.get_chat_messages()[0]["actions"] == {"trades": [], "watchlist_changes": []}


def test_ordering_and_limit(db_path):
    for i in range(30):
        db.insert_chat_message("user" if i % 2 == 0 else "assistant", f"m{i}", None)
    assert [m["content"] for m in db.get_chat_messages()] == [f"m{i}" for i in range(30)]
    last = db.get_chat_messages(limit=20)
    assert [m["content"] for m in last] == [f"m{i}" for i in range(10, 30)]


def test_default_limit_is_50(db_path):
    for i in range(55):
        db.insert_chat_message("user", f"m{i}", None)
    msgs = db.get_chat_messages()
    assert len(msgs) == 50
    assert msgs[0]["content"] == "m5"
    assert msgs[-1]["content"] == "m54"
