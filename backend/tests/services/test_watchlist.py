import pytest

from app import db
from app.services import ServiceError, add_ticker, execute_trade, get_watchlist, remove_ticker

DEFAULTS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]


def test_get_watchlist_shape(ctx):
    wl = get_watchlist(ctx)
    assert [r["ticker"] for r in wl] == DEFAULTS
    row = wl[0]
    assert row == {
        "ticker": "AAPL",
        "price": 190.0,
        "previous_price": 190.0,
        "session_open": 190.0,
        "session_change_percent": 0.0,
        "direction": "flat",
    }


def test_session_change_reflected(ctx):
    ctx.market_source.set_price("AAPL", 209.0)
    row = get_watchlist(ctx)[0]
    assert row["session_open"] == 190.0
    assert row["session_change_percent"] == 10.0
    assert row["direction"] == "up"


async def test_add_ticker(ctx):
    wl = await add_ticker(ctx, " pypl ")
    assert wl[-1]["ticker"] == "PYPL"
    assert wl[-1]["price"] == 60.0
    assert "PYPL" in ctx.market_source.get_tickers()


async def test_add_existing_is_idempotent(ctx):
    wl = await add_ticker(ctx, "AAPL")
    assert [r["ticker"] for r in wl] == DEFAULTS


async def test_add_without_price_gives_nulls(ctx):
    wl = await add_ticker(ctx, "ZZZZ")
    row = wl[-1]
    assert row["ticker"] == "ZZZZ"
    assert row["price"] is None and row["direction"] is None
    assert row["session_change_percent"] is None


@pytest.mark.parametrize("bad", ["", "123", "TOOLONGTICKER", "A B"])
async def test_add_bad_ticker(ctx, bad):
    with pytest.raises(ServiceError) as e:
        await add_ticker(ctx, bad)
    assert e.value.status_code == 400


async def test_remove_ticker_untracks(ctx):
    wl = await remove_ticker(ctx, "tsla")
    assert "TSLA" not in [r["ticker"] for r in wl]
    assert "TSLA" not in ctx.market_source.get_tickers()
    assert ctx.price_cache.get("TSLA") is None


async def test_remove_missing_404(ctx):
    with pytest.raises(ServiceError) as e:
        await remove_ticker(ctx, "PYPL")
    assert e.value.status_code == 404


async def test_remove_held_ticker_stays_tracked(ctx):
    await execute_trade(ctx, "AAPL", "buy", 1)
    wl = await remove_ticker(ctx, "AAPL")
    assert "AAPL" not in [r["ticker"] for r in wl]
    assert "AAPL" in ctx.market_source.get_tickers()
    assert ctx.price_cache.get("AAPL") is not None
    assert "AAPL" in db.get_tracked_tickers()
    # Selling it fully now stops tracking.
    await execute_trade(ctx, "AAPL", "sell", 1)
    assert "AAPL" not in ctx.market_source.get_tickers()
