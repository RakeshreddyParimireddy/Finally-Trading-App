"""Fixtures for DB tests: every test gets a fresh SQLite file under tmp_path."""

import pytest

from app import db


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "finally.db"
    db.set_db_path(None)
    monkeypatch.setenv("FINALLY_DB_PATH", str(path))
    db.init_db()
    yield path
    db.set_db_path(None)
