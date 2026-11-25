import pytest

from app import db
from app.services import ServiceError, execute_trade, get_portfolio
from app.services.snapshots import get_history, record_snapshot


def test_initial_portfolio(ctx):
    p = get_portfolio(ctx)
    assert p == {
        "cash_balance": 10000.0,
        "positions": [],
        "positions_value": 0.0,
        "total_value": 10000.0,
        "unrealized_pnl": 0.0,
    }


async def test_buy(ctx):
    res = await execute_trade(ctx, "aapl ", "BUY", 10)
    t = res["trade"]
    assert t["ticker"] == "AAPL" and t["side"] == "buy"
    assert t["quantity"] == 10.0 and t["price"] == 190.0
    assert {"id", "executed_at"} <= t.keys()
    p = res["portfolio"]
    assert p["cash_balance"] == 8100.0
    assert p["positions"] == [
        {
            "ticker": "AAPL",
            "quantity": 10.0,
            "avg_cost": 190.0,
            "current_price": 190.0,
            "market_value": 1900.0,
            "cost_basis": 1900.0,
            "unrealized_pnl": 0.0,
            "unrealized_pnl_percent": 0.0,
        }
    ]
    assert p["total_value"] == 10000.0
    assert db.get_cash() == pytest.approx(8100.0)


async def test_avg_cost_and_pnl(ctx):
    await execute_trade(ctx, "AAPL", "buy", 10)
    ctx.market_source.set_price("AAPL", 210.0)
    await execute_trade(ctx, "AAPL", "buy", 10)
    ctx.market_source.set_price("AAPL", 220.0)
    p = get_portfolio(ctx)
    pos = p["positions"][0]
    assert pos["avg_cost"] == 200.0
    assert pos["quantity"] == 20.0
    assert pos["market_value"] == 4400.0
    assert pos["unrealized_pnl"] == 400.0
    assert pos["unrealized_pnl_percent"] == 10.0
    assert p["unrealized_pnl"] == 400.0
    assert p["total_value"] == pytest.approx(10000 - 1900 - 2100 + 4400)


async def test_sell_partial_and_at_loss(ctx):
    await execute_trade(ctx, "AAPL", "buy", 10)
    ctx.market_source.set_price("AAPL", 180.0)
    res = await execute_trade(ctx, "AAPL", "sell", 4)
    p = res["portfolio"]
    assert p["cash_balance"] == pytest.approx(8100 + 720)
    pos = p["positions"][0]
    assert pos["quantity"] == 6.0
    assert pos["avg_cost"] == 190.0  # unchanged by a sell
    assert pos["unrealized_pnl"] == -60.0
    assert pos["unrealized_pnl_percent"] == pytest.approx(-5.2632, abs=1e-4)
    assert p["total_value"] == pytest.approx(10000 - 100)


async def test_full_sell_deletes_position(ctx):
    await execute_trade(ctx, "AAPL", "buy", 2.5)
    res = await execute_trade(ctx, "AAPL", "sell", 2.5)
    assert res["portfolio"]["positions"] == []
    assert db.get_position("AAPL") is None
    assert res["portfolio"]["cash_balance"] == 10000.0


async def test_insufficient_cash(ctx):
    with pytest.raises(ServiceError) as e:
        await execute_trade(ctx, "NVDA", "buy", 100)
    assert e.value.status_code == 400
    assert e.value.detail == "Insufficient cash: need $88,000.00, have $10,000.00"
    assert db.get_cash() == 10000.0


async def test_insufficient_shares(ctx):
    await execute_trade(ctx, "AAPL", "buy", 1)
    with pytest.raises(ServiceError) as e:
        await execute_trade(ctx, "AAPL", "sell", 2)
    assert e.value.status_code == 400
    assert e.value.detail == "Insufficient shares: have 1 AAPL"


async def test_sell_without_position(ctx):
    with pytest.raises(ServiceError) as e:
        await execute_trade(ctx, "MSFT", "sell", 1)
    assert e.value.detail == "Insufficient shares: have 0 MSFT"


async def test_no_price_409(ctx):
    # ZZZZ has no price in the fake source table.
    with pytest.raises(ServiceError) as e:
        await execute_trade(ctx, "ZZZZ", "buy", 1)
    assert e.value.status_code == 409
    assert e.value.detail == "Price unavailable for ZZZZ"
    # The temporary tracking was undone.
    assert "ZZZZ" not in ctx.market_source.get_tickers()


@pytest.mark.parametrize("ticker", ["", "AAPL1", "TOOLONGTICKER", "A-B", None, 5])
async def test_bad_ticker(ctx, ticker):
    with pytest.raises(ServiceError) as e:
        await execute_trade(ctx, ticker, "buy", 1)
    assert e.value.status_code == 400


@pytest.mark.parametrize("qty", [0, -1, 0.00001, "abc", None, float("nan"), float("inf"), True])
async def test_bad_quantity(ctx, qty):
    with pytest.raises(ServiceError) as e:
        await execute_trade(ctx, "AAPL", "buy", qty)
    assert e.value.status_code == 400


async def test_bad_side(ctx):
    with pytest.raises(ServiceError) as e:
        await execute_trade(ctx, "AAPL", "short", 1)
    assert e.value.status_code == 400


async def test_quantity_rounded_to_4_decimals(ctx):
    res = await execute_trade(ctx, "AAPL", "buy", "1.234567")
    assert res["trade"]["quantity"] == 1.2346
    assert db.get_position("AAPL")["quantity"] == pytest.approx(1.2346)


async def test_untracked_ticker_409_before_cash_and_shares_checks(ctx):
    # PYPL has a fake price but is not tracked -> no cached price -> 409.
    for side, qty in (("buy", 1), ("buy", 10_000_000), ("sell", 5)):
        with pytest.raises(ServiceError) as e:
            await execute_trade(ctx, "PYPL", side, qty)
        assert e.value.status_code == 409
        assert e.value.detail == "Price unavailable for PYPL"
    assert "PYPL" not in ctx.market_source.get_tickers()


async def test_full_sell_unwatched_ticker_untracks(ctx):
    from app.services import add_ticker, remove_ticker

    await add_ticker(ctx, "PYPL")
    await execute_trade(ctx, "PYPL", "buy", 1)
    await remove_ticker(ctx, "PYPL")  # held -> stays tracked
    assert "PYPL" in ctx.market_source.get_tickers()
    await execute_trade(ctx, "PYPL", "sell", 1)
    assert "PYPL" not in ctx.market_source.get_tickers()
    assert ctx.price_cache.get("PYPL") is None


async def test_full_sell_watched_ticker_stays_tracked(ctx):
    await execute_trade(ctx, "AAPL", "buy", 1)
    await execute_trade(ctx, "AAPL", "sell", 1)
    assert "AAPL" in ctx.market_source.get_tickers()
    assert ctx.price_cache.get("AAPL") is not None


async def test_trade_records_snapshot(ctx):
    assert get_history() == []
    await execute_trade(ctx, "AAPL", "buy", 1)
    hist = get_history()
    assert len(hist) == 1
    assert hist[0]["total_value"] == 10000.0
    assert set(hist[0]) == {"total_value", "recorded_at"}


def test_record_snapshot(ctx):
    record_snapshot(ctx)
    record_snapshot(ctx)
    assert [h["total_value"] for h in get_history()] == [10000.0, 10000.0]


async def test_no_cached_price_values_at_avg_cost(ctx):
    await execute_trade(ctx, "AAPL", "buy", 2)
    ctx.price_cache.remove("AAPL")
    pos = get_portfolio(ctx)["positions"][0]
    assert pos["current_price"] == 190.0
    assert pos["unrealized_pnl"] == 0.0
