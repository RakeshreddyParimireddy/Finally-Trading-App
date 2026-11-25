"""Thread safety: concurrent calls from a threadpool must not fail."""

from concurrent.futures import ThreadPoolExecutor

from app import db


def test_concurrent_writes_and_reads(db_path):
    def work(i):
        db.insert_snapshot(float(i))
        db.insert_chat_message("user", f"m{i}", None)
        db.add_to_watchlist("T" + chr(65 + i % 26))
        return db.get_cash()

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(work, range(40)))
    assert all(r == 10000.0 for r in results)
    assert len(db.get_snapshots()) == 40
    assert len(db.get_chat_messages(limit=100)) == 40


def test_concurrent_trades_are_all_recorded(db_path):
    def buy(i):
        return db.record_trade(f"X{chr(65 + i)}", "buy", 1, 1.0, 9000.0, 1, 1.0)

    with ThreadPoolExecutor(max_workers=8) as pool:
        trades = list(pool.map(buy, range(20)))
    assert len({t["id"] for t in trades}) == 20
    assert len(db.get_positions()) == 20
