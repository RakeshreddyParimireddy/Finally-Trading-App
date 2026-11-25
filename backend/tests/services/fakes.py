"""Deterministic market source + fixtures helpers shared by service and API tests."""

from __future__ import annotations

from app.market import MarketDataSource, PriceCache

DEFAULT_PRICES = {
    "AAPL": 190.0,
    "GOOGL": 175.0,
    "MSFT": 420.0,
    "AMZN": 185.0,
    "TSLA": 250.0,
    "NVDA": 880.0,
    "META": 500.0,
    "JPM": 200.0,
    "V": 280.0,
    "NFLX": 650.0,
    "PYPL": 60.0,
}


class FakeMarketSource(MarketDataSource):
    """Tracks tickers and seeds the cache from a fixed price table.

    Tickers absent from ``prices`` get no cached price (to exercise 409 paths).
    """

    def __init__(self, cache: PriceCache, prices: dict[str, float] | None = None) -> None:
        self.cache = cache
        self.prices = dict(DEFAULT_PRICES if prices is None else prices)
        self.tickers: list[str] = []
        self.started = False
        self.stopped = False

    async def start(self, tickers: list[str]) -> None:
        self.started = True
        for t in tickers:
            await self.add_ticker(t)

    async def stop(self) -> None:
        self.stopped = True

    async def add_ticker(self, ticker: str) -> None:
        if ticker not in self.tickers:
            self.tickers.append(ticker)
            if ticker in self.prices:
                self.cache.update(ticker, self.prices[ticker])

    async def remove_ticker(self, ticker: str) -> None:
        if ticker in self.tickers:
            self.tickers.remove(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return list(self.tickers)

    def set_price(self, ticker: str, price: float) -> None:
        self.prices[ticker] = price
        self.cache.update(ticker, price)
