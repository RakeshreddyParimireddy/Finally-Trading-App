"""Portfolio snapshots."""

import uuid
from datetime import datetime, timedelta, timezone

from app import db


def _insert_at(total_value, when):
    with db.get_connection() as conn:
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), "default", total_value, when.isoformat()),
        )


def test_insert_and_get(db_path):
    snap = db.insert_snapshot(10000.0)
    assert set(snap) == {"total_value", "recorded_at"}
    assert snap["total_value"] == 10000.0
    datetime.fromisoformat(snap["recorded_at"])
    assert db.get_snapshots() == [snap]


def test_ascending_order_and_limit(db_path):
    values = [10000.0 + i for i in range(5)]
    for v in values:
        db.insert_snapshot(v)
    assert [s["total_value"] for s in db.get_snapshots()] == values
    # limit keeps the most recent rows, still ascending
    assert [s["total_value"] for s in db.get_snapshots(limit=2)] == values[-2:]


def test_prune_removes_old_only(db_path):
    now = datetime.now(timezone.utc)
    _insert_at(1.0, now - timedelta(hours=48))
    _insert_at(2.0, now - timedelta(hours=25))
    _insert_at(3.0, now - timedelta(hours=1))
    db.insert_snapshot(4.0)
    assert db.prune_snapshots(24) == 2
    assert [s["total_value"] for s in db.get_snapshots()] == [3.0, 4.0]
    assert db.prune_snapshots(24) == 0


def test_prune_custom_window(db_path):
    now = datetime.now(timezone.utc)
    _insert_at(1.0, now - timedelta(hours=3))
    db.insert_snapshot(2.0)
    assert db.prune_snapshots(keep_hours=2) == 1
    assert len(db.get_snapshots()) == 1
