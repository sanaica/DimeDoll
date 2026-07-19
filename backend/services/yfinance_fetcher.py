"""
YFinance Fetcher — polls live price data and publishes via Redis pub/sub.

Handles dynamic ticker lists (Nifty 50) with batched downloads for performance.
"""

import asyncio
import yfinance as yf
import json
import logging
import random
from redis.asyncio import Redis
from typing import List
from database import get_database
from services.stock_scorer import compute_scorecard

logger = logging.getLogger(__name__)

BATCH_SIZE = 10  # Download tickers in batches for performance


class YFinanceFetcher:
    def __init__(self, redis_client: Redis, tickers: List[str]):
        self.redis = redis_client
        self.tickers = tickers
        self.is_running = False

    def update_tickers(self, tickers: List[str]):
        """Update the ticker list (called when universe refreshes)."""
        self.tickers = tickers

    async def fetch_and_publish(self):
        self.is_running = True
        logger.info(f"Starting yfinance fetcher for {len(self.tickers)} tickers")

        while self.is_running:
            try:
                profile_data = await self.redis.get("user:profile")
                profile = json.loads(profile_data) if profile_data else {}

                all_updates = []

                # Process tickers in batches
                for i in range(0, len(self.tickers), BATCH_SIZE):
                    batch = self.tickers[i:i + BATCH_SIZE]
                    try:
                        data = await asyncio.to_thread(
                            yf.download,
                            tickers=batch,
                            period="1d",
                            interval="1m",
                            progress=False,
                        )

                        if data.empty:
                            continue

                        for ticker in batch:
                            try:
                                # Handle single vs multi-ticker DataFrame structure
                                if len(batch) == 1:
                                    close_col = data['Close']
                                else:
                                    if ticker not in data['Close'].columns:
                                        continue
                                    close_col = data['Close'][ticker]

                                series = close_col.dropna()
                                if series.empty:
                                    continue

                                latest_price = float(series.iloc[-1])

                                # Add tiny noise for demo volatility
                                noise = random.uniform(-0.005, 0.005)
                                latest_price = latest_price * (1 + noise)

                                # SMA-based insight
                                base_insight = {"action": "HOLD", "confidence": 50, "pattern": "Consolidating"}

                                if len(series) >= 15:
                                    sma_short = float(series.tail(5).mean())
                                    sma_long = float(series.tail(15).mean())
                                    diff_percent = abs(sma_short - sma_long) / sma_long * 100
                                    confidence = min(50 + int(diff_percent * 200), 99)

                                    if sma_short > sma_long and latest_price > sma_short:
                                        base_insight = {"action": "BUY", "confidence": confidence, "pattern": "Bullish SMA Crossover"}
                                    elif sma_short < sma_long and latest_price < sma_short:
                                        base_insight = {"action": "SELL", "confidence": confidence, "pattern": "Bearish SMA Reversal"}
                                elif len(series) > 1:
                                    if latest_price > float(series.iloc[-2]):
                                        base_insight = {"action": "BUY", "confidence": 60, "pattern": "Upward Momentum"}
                                    else:
                                        base_insight = {"action": "SELL", "confidence": 60, "pattern": "Downward Momentum"}

                                # Apply profile-based adjustments
                                if profile:
                                    risk = profile.get("risk_tolerance", "Moderate")
                                    action = base_insight.get("action")
                                    conf = base_insight.get("confidence", 0)

                                    if risk == "Conservative":
                                        if action == "BUY" and conf < 90:
                                            base_insight["action"] = "HOLD"
                                            base_insight["pattern"] += " (Conservative filter)"
                                    elif risk == "Aggressive":
                                        if action == "HOLD" and conf >= 60:
                                            base_insight["action"] = "BUY"
                                            base_insight["pattern"] += " (Aggressive upgrade)"

                                # Build history points (last 60 candles)
                                history_points = []
                                for ts, p in series.tail(60).items():
                                    try:
                                        time_str = ts.strftime('%H:%M')
                                    except Exception:
                                        time_str = str(ts)
                                    history_points.append({"time": time_str, "price": round(float(p), 2)})

                                tick_data = {
                                    "ticker": ticker,
                                    "price": round(float(latest_price), 2),
                                    "timestamp": str(data.index[-1]),
                                    "insight": base_insight,
                                    "history": history_points,
                                }

                                await self.redis.set(f"ticker:{ticker}", json.dumps(tick_data))
                                all_updates.append(tick_data)

                                # Determine deterministic score and store in MongoDB
                                # To avoid rate-limit blocking the whole loop, do it in a background task
                                asyncio.create_task(self._update_computed_score(ticker))

                            except Exception as ticker_err:
                                logger.debug(f"Error processing {ticker}: {ticker_err}")
                                continue

                    except Exception as batch_err:
                        logger.error(f"Error fetching batch: {batch_err}")
                        continue

                if all_updates:
                    # Publish in chunks to avoid oversized messages
                    for j in range(0, len(all_updates), 10):
                        chunk = all_updates[j:j + 10]
                        await self.redis.publish(
                            "live_ticks",
                            json.dumps({"type": "ticks_update", "data": chunk}),
                        )
                    logger.debug(f"Published {len(all_updates)} ticker updates")

            except Exception as e:
                logger.error(f"Error in fetcher loop: {e}")

            # Poll interval — 10s for 50 tickers is reasonable
            await asyncio.sleep(10)

    async def _update_computed_score(self, ticker: str):
        try:
            # We fetch from yfinance using threads to not block async loop
            score_data = await asyncio.to_thread(compute_scorecard, ticker)
            
            db = get_database()
            await db.computed_scores.update_one(
                {"ticker": ticker},
                {"$set": score_data},
                upsert=True
            )
        except Exception as e:
            logger.debug(f"Failed to update computed score for {ticker}: {e}")

    def stop(self):
        self.is_running = False
