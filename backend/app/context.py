"""Application context shared by routers and services."""

from __future__ import annotations

from dataclasses import dataclass

from app.market import MarketDataSource, PriceCache


@dataclass
class AppContext:
    """Process-wide runtime state. Stored at ``app.state.ctx``."""

    price_cache: PriceCache
    market_source: MarketDataSource
