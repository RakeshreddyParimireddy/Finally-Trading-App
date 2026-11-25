import pytest

from app import db
from app.context import AppContext
from app.market import PriceCache

from .fakes import FakeMarketSource


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    """Fresh, seeded SQLite DB per test (FINALLY_DB_PATH points at it)."""
    path = tmp_path / "finally.db"
    monkeypatch.setenv("FINALLY_DB_PATH", str(path))
    db.init_db()  # no explicit path -> resolves from FINALLY_DB_PATH
    return path


@pytest.fixture
async def ctx(tmp_db):
    cache = PriceCache()
    source = FakeMarketSource(cache)
    await source.start(db.get_tracked_tickers())
    return AppContext(price_cache=cache, market_source=source)
