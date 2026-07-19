"""
Manual Portfolio Advisor — the "AI recommends, I decide" flow.

POST /api/portfolio/analyze  → runs Agent 1 (Risk Analyst) on demand
POST /api/portfolio/apply    → runs Agent 2 (Executor) with Agent 1's output
"""

import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from redis.asyncio import Redis

from database import get_database

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyzeRequest(BaseModel):
    username: str


class ApplyRequest(BaseModel):
    username: str
    analysis: dict  # Agent 1's output, passed back from the frontend


async def _get_redis() -> Redis:
    """Get the shared Redis client from the app state."""
    import os
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return Redis.from_url(url, decode_responses=True, health_check_interval=30, retry_on_timeout=True)


@router.post("/portfolio/analyze")
async def analyze_portfolio(req: AnalyzeRequest):
    """Run Agent 1 (Risk Analyst) on the current portfolio — advisory only."""
    redis = await _get_redis()
    try:
        db = get_database()

        # Load profile
        user = await db.users.find_one({"username": req.username})
        profile = user.get("profile", {}) if user else {}

        # Load portfolio
        portfolio_doc = await db.portfolios.find_one({"username": req.username})
        portfolio = {}
        if portfolio_doc:
            portfolio = {
                "cash": portfolio_doc.get("cash", 0),
                "holdings": portfolio_doc.get("holdings", {}),
            }

        # Gather market data from Redis cache
        from services.ticker_universe import NIFTY50_FALLBACK
        market_data = {}

        # Try to get all cached tickers
        core_cached = await redis.get("ticker_universe:core")
        if core_cached:
            try:
                tickers = json.loads(core_cached)
            except json.JSONDecodeError:
                tickers = [f"{s}.NS" for s in NIFTY50_FALLBACK]
        else:
            tickers = [f"{s}.NS" for s in NIFTY50_FALLBACK]

        for t in tickers:
            val = await redis.get(f"ticker:{t}")
            if val:
                market_data[t] = json.loads(val)

        if not market_data:
            raise HTTPException(
                503,
                "No market data available yet. Please wait for the price feed to populate.",
            )

        # Run Agent 1
        from services.portfolio_trader import PortfolioTrader

        trader = PortfolioTrader(redis, list(market_data.keys()))
        analysis = await trader.run_risk_analyst(profile, portfolio, market_data)

        if not analysis:
            raise HTTPException(500, "AI analysis failed. Please try again in a moment.")

        return {
            "status": "success",
            "analysis": analysis,
            "portfolio_snapshot": {
                "cash": portfolio.get("cash", 0),
                "holdings": portfolio.get("holdings", {}),
            },
        }
    finally:
        await redis.close()


@router.post("/portfolio/apply")
async def apply_suggestions(req: ApplyRequest):
    """Run Agent 2 (Executor) with Agent 1's analysis, then execute trades."""
    redis = await _get_redis()
    try:
        db = get_database()

        # Load current portfolio (fresh, not stale)
        portfolio_doc = await db.portfolios.find_one({"username": req.username})
        portfolio = {}
        if portfolio_doc:
            portfolio = {
                "username": req.username,
                "cash": portfolio_doc.get("cash", 0),
                "total_deposited": portfolio_doc.get("total_deposited", 0),
                "holdings": portfolio_doc.get("holdings", {}),
            }

        # Gather live market data
        market_data = {}
        core_cached = await redis.get("ticker_universe:core")
        if core_cached:
            try:
                tickers = json.loads(core_cached)
            except json.JSONDecodeError:
                tickers = []
        else:
            from services.ticker_universe import NIFTY50_FALLBACK
            tickers = [f"{s}.NS" for s in NIFTY50_FALLBACK]

        for t in tickers:
            val = await redis.get(f"ticker:{t}")
            if val:
                market_data[t] = json.loads(val)

        if not market_data:
            raise HTTPException(503, "No market data available.")

        # Run Agent 2
        from services.portfolio_trader import PortfolioTrader

        trader = PortfolioTrader(redis, list(market_data.keys()))
        execution_plan = await trader.run_executor(req.analysis, portfolio, market_data)

        if not execution_plan:
            return {
                "status": "success",
                "message": "AI decided to hold — no trades executed.",
                "trades_executed": [],
            }

        trades = execution_plan.get("trades", [])
        thoughts = execution_plan.get("thoughts", "")

        if not trades:
            return {
                "status": "success",
                "message": f"AI decided to hold. Reasoning: {thoughts}",
                "trades_executed": [],
                "ai_thoughts": thoughts,
            }

        # Execute
        executed = await trader._execute_trades(
            trades, portfolio, market_data, req.username
        )

        # Broadcast the execution
        await redis.publish(
            "live_ticks",
            json.dumps({"type": "auto_trader_execution", "data": executed}),
        )

        return {
            "status": "success",
            "message": f"Executed {len(executed)} trade(s).",
            "trades_executed": executed,
            "ai_thoughts": thoughts,
        }
    finally:
        await redis.close()
