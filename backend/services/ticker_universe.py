"""
Dynamic Ticker Universe — replaces the hardcoded 4-ticker list.

Core tier  : Nifty 50 constituents, always live-ticked via WebSocket
Extended   : Broader NSE universe, lazy-fetched on search
"""

import asyncio
import logging
import json
import os
from datetime import datetime, timedelta
from typing import Optional

import httpx
import pandas as pd
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

# Bundled fallback — current Nifty 50 constituents (updated periodically)
NIFTY50_FALLBACK = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BPCL",
    "BHARTIARTL", "BRITANNIA", "CIPLA", "COALINDIA", "DRREDDY",
    "EICHERMOT", "ETERNAL", "GRASIM", "HCLTECH", "HDFCBANK",
    "HDFCLIFE", "HEROMOTOCO", "HINDALCO", "HINDUNILVR", "ICICIBANK",
    "ITC", "INDUSINDBK", "INFY", "JSWSTEEL", "KOTAKBANK",
    "LT", "M&M", "MARUTI", "NTPC", "NESTLEIND",
    "SBIN", "SUNPHARMA", "TCS", "TATACONSUM", "HINDZINC",
    "TATASTEEL", "TECHM", "TITAN", "TRENT", "ULTRACEMCO",
    "WIPRO",
]

# NSE CSV URL for Nifty 50 constituents
NIFTY50_CSV_URL = "https://archives.nseindia.com/content/indices/ind_nifty50list.csv"

# Cache durations
CORE_CACHE_TTL = 86400  # 24 hours
SEARCH_CACHE_TTL = 86400  # 24 hours


class TickerUniverse:
    def __init__(self, redis_client: Redis):
        self.redis = redis_client
        self._core_cache: Optional[list[str]] = None
        self._core_cache_time: Optional[datetime] = None

    async def get_core_tickers(self) -> list[str]:
        """
        Return the Nifty 50 ticker list with .NS suffix for yfinance.
        Tries live fetch first, falls back to cache then static list.
        """
        # Check in-memory cache
        if (
            self._core_cache
            and self._core_cache_time
            and datetime.now() - self._core_cache_time < timedelta(seconds=CORE_CACHE_TTL)
        ):
            return self._core_cache

        # Check Redis cache
        cached = await self.redis.get("ticker_universe:core")
        if cached:
            try:
                tickers = json.loads(cached)
                self._core_cache = tickers
                self._core_cache_time = datetime.now()
                return tickers
            except json.JSONDecodeError:
                pass

        # Attempt live fetch
        tickers = await self._fetch_nifty50_live()
        if not tickers:
            # Fall back to static list
            logger.info("Using fallback Nifty 50 list")
            tickers = [f"{sym}.NS" for sym in NIFTY50_FALLBACK]

        # Cache in Redis
        await self.redis.set(
            "ticker_universe:core",
            json.dumps(tickers),
            ex=CORE_CACHE_TTL,
        )
        self._core_cache = tickers
        self._core_cache_time = datetime.now()
        return tickers

    async def _fetch_nifty50_live(self) -> Optional[list[str]]:
        """Fetch current Nifty 50 constituents from NSE's public CSV."""
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/csv,text/html,*/*",
                }
                resp = await client.get(NIFTY50_CSV_URL, headers=headers)
                resp.raise_for_status()

                # Parse CSV — the NSE file has a "Symbol" column
                from io import StringIO
                df = pd.read_csv(StringIO(resp.text))

                # Normalise column names
                df.columns = [c.strip() for c in df.columns]

                if "Symbol" in df.columns:
                    symbols = df["Symbol"].dropna().str.strip().tolist()
                    tickers = [f"{sym}.NS" for sym in symbols if sym]
                    if len(tickers) >= 40:  # sanity check
                        logger.info(f"Fetched {len(tickers)} Nifty 50 constituents live")
                        return tickers

            logger.warning("Live Nifty 50 CSV had too few symbols")
            return None
        except Exception as e:
            logger.warning(f"Failed to fetch live Nifty 50 list: {e}")
            return None

    async def search_tickers(self, query: str) -> list[dict]:
        """
        Search for tickers matching a query string.
        Returns basic info for matches across the broader NSE universe.
        """
        query = query.strip().upper()
        if not query or len(query) < 2:
            return []

        # Check if the query matches any core ticker first
        core = await self.get_core_tickers()
        results = []

        for ticker in core:
            symbol = ticker.replace(".NS", "")
            if query in symbol:
                results.append({
                    "symbol": ticker,
                    "name": symbol,
                    "tier": "core",
                })

        # For extended search, try yfinance lookup
        if len(results) < 5:
            try:
                import yfinance as yf
                test_ticker = f"{query}.NS"
                stock = await asyncio.to_thread(yf.Ticker, test_ticker)
                info = await asyncio.to_thread(lambda: stock.info)
                if info and info.get("regularMarketPrice"):
                    already = any(r["symbol"] == test_ticker for r in results)
                    if not already:
                        results.append({
                            "symbol": test_ticker,
                            "name": info.get("shortName", query),
                            "tier": "extended",
                            "price": info.get("regularMarketPrice"),
                            "sector": info.get("sector", ""),
                        })
            except Exception:
                pass  # yfinance lookup failed, that's fine

        return results[:20]

    async def get_ticker_info(self, ticker: str) -> dict:
        """Get info for a single ticker, with caching."""
        cache_key = f"ticker_info:{ticker}"
        cached = await self.redis.get(cache_key)
        if cached:
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                pass

        try:
            import yfinance as yf
            stock = await asyncio.to_thread(yf.Ticker, ticker)
            info = await asyncio.to_thread(lambda: stock.info)
            result = {
                "symbol": ticker,
                "name": info.get("shortName", ticker.replace(".NS", "")),
                "sector": info.get("sector", ""),
                "industry": info.get("industry", ""),
                "price": info.get("regularMarketPrice", 0),
                "marketCap": info.get("marketCap", 0),
                "tier": "core" if ticker in (self._core_cache or []) else "extended",
            }
            await self.redis.set(cache_key, json.dumps(result), ex=SEARCH_CACHE_TTL)
            return result
        except Exception as e:
            logger.error(f"Failed to get ticker info for {ticker}: {e}")
            return {"symbol": ticker, "name": ticker.replace(".NS", ""), "error": str(e)}

    async def start_daily_refresh(self):
        """Background task to refresh the core tier daily."""
        while True:
            try:
                # Clear in-memory cache to force refresh
                self._core_cache = None
                self._core_cache_time = None
                await self.redis.delete("ticker_universe:core")
                await self.get_core_tickers()
                logger.info("Daily ticker universe refresh complete")
            except Exception as e:
                logger.error(f"Ticker universe refresh error: {e}")
            await asyncio.sleep(CORE_CACHE_TTL)
