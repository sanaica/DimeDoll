import asyncio
import yfinance as yf
import json
import logging
import random
from redis.asyncio import Redis
from typing import List
from database import get_database

logger = logging.getLogger(__name__)

class YFinanceFetcher:
    def __init__(self, redis_client: Redis, tickers: List[str]):
        self.redis = redis_client
        self.tickers = tickers
        self.is_running = False

    async def fetch_and_publish(self):
        self.is_running = True
        logger.info(f"Starting yfinance fetcher for {self.tickers}")
        while self.is_running:
            try:
                # yfinance downloading is blocking, but we run it in a way that doesn't block entirely 
                # or we just use asyncio.to_thread for better performance. For this prototype, basic polling is fine.
                data = await asyncio.to_thread(yf.download, tickers=self.tickers, period="1d", interval="1m", progress=False)
                
                profile_data = await self.redis.get("user:profile")
                profile = json.loads(profile_data) if profile_data else {}
                
                portfolio_data = await self.redis.get("user:portfolio")
                portfolio = json.loads(portfolio_data) if portfolio_data else {"cash": 1000000.0, "holdings": {}}
                portfolio_updated = False
                
                updates = []
                executed_trades = []
                
                for ticker in self.tickers:
                    if ticker in data['Close']:
                        latest_price = data['Close'][ticker].iloc[-1]
                        series = data['Close'][ticker].dropna()
                        if not series.empty:
                             # Add a tiny bit of random noise (between -1% and +1%) 
                             # to simulate a highly volatile market for the prototype demonstration
                             noise = random.uniform(-0.01, 0.01)
                             latest_price = series.iloc[-1] * (1 + noise)
                             
                             # We should also update the series to reflect the noisy price so SMA reacts
                             series.iloc[-1] = latest_price
                             
                        # Dynamic Algorithmic Indicator (SMA Crossover)
                        base_insight = {"action": "HOLD", "confidence": 50, "pattern": "Consolidating"}
                        
                        if len(series) >= 15:
                            # Use 5-tick vs 15-tick SMA
                            sma_short = series.tail(5).mean()
                            sma_long = series.tail(15).mean()
                            
                            diff_percent = abs(sma_short - sma_long) / sma_long * 100
                            confidence = min(50 + int(diff_percent * 200), 99) # Scale diff to confidence
                            
                            if sma_short > sma_long and latest_price > sma_short:
                                base_insight = {"action": "BUY", "confidence": confidence, "pattern": "Bullish SMA Crossover"}
                            elif sma_short < sma_long and latest_price < sma_short:
                                base_insight = {"action": "SELL", "confidence": confidence, "pattern": "Bearish SMA Reversal"}
                        elif len(series) > 1:
                            # Fallback to simple momentum if not enough data
                            if latest_price > series.iloc[-2]:
                                base_insight = {"action": "BUY", "confidence": 60, "pattern": "Upward Momentum"}
                            else:
                                base_insight = {"action": "SELL", "confidence": 60, "pattern": "Downward Momentum"}
                        
                        # Apply Profile Logic
                        if base_insight and profile:
                            risk = profile.get("risk_tolerance", "Moderate")
                            action = base_insight.get("action")
                            confidence = base_insight.get("confidence", 0)
                            
                            if risk == "Conservative":
                                if action == "BUY" and confidence < 90:
                                    base_insight["action"] = "HOLD"
                                    base_insight["pattern"] += " (Downgraded: Conservative)"
                            elif risk == "Aggressive":
                                if action == "HOLD" and confidence >= 60:
                                    base_insight["action"] = "BUY"
                                    base_insight["pattern"] += " (Upgraded: Aggressive)"
                                    
                            if profile.get("auto_invest"):
                                if base_insight["action"] == "BUY":
                                    if portfolio["cash"] >= latest_price:
                                        portfolio["cash"] -= float(latest_price)
                                        portfolio["holdings"][ticker] = portfolio["holdings"].get(ticker, 0) + 1
                                        portfolio_updated = True
                                        executed_trades.append({
                                            "ticker": ticker,
                                            "price": round(float(latest_price), 2),
                                            "action": "BUY",
                                            "timestamp": str(data.index[-1]),
                                            "reason": base_insight["pattern"]
                                        })
                                    else:
                                        base_insight["pattern"] += " (Failed: Insufficient Funds)"
                                        
                                elif base_insight["action"] == "SELL":
                                    if portfolio["holdings"].get(ticker, 0) > 0:
                                        portfolio["cash"] += float(latest_price)
                                        portfolio["holdings"][ticker] -= 1
                                        if portfolio["holdings"][ticker] == 0:
                                            del portfolio["holdings"][ticker]
                                        portfolio_updated = True
                                        executed_trades.append({
                                            "ticker": ticker,
                                            "price": round(float(latest_price), 2),
                                            "action": "SELL",
                                            "timestamp": str(data.index[-1]),
                                            "reason": base_insight["pattern"]
                                        })
                                    else:
                                        base_insight["pattern"] += " (Failed: No Holdings)"
                        
                        tick_data = {
                            "ticker": ticker,
                            "price": round(float(latest_price), 2),
                            "timestamp": str(data.index[-1]),
                            "insight": base_insight
                        }
                        
                        # Set in Redis (Flash Layer Memory)
                        await self.redis.set(f"ticker:{ticker}", json.dumps(tick_data))
                        updates.append(tick_data)

                if updates:
                    await self.redis.publish("live_ticks", json.dumps({"type": "ticks_update", "data": updates}))
                    logger.debug(f"Published updates: {updates}")
                    
                if portfolio_updated:
                    # Sync to Redis for UI
                    await self.redis.set("user:portfolio", json.dumps(portfolio))
                    await self.redis.publish("live_ticks", json.dumps({"type": "portfolio_update", "data": portfolio}))
                    
                    # Fix cache desync: PERMANENTLY save to MongoDB for the ACTIVE user
                    active_username = await self.redis.get("active_username")
                    if active_username:
                        active_username = active_username.decode('utf-8') if isinstance(active_username, bytes) else active_username
                        db = get_database()
                        await db.portfolios.update_one(
                            {"username": active_username},
                            {"$set": portfolio},
                            upsert=True
                        )
                    
                if executed_trades:
                    await self.redis.publish("live_ticks", json.dumps({"type": "trade_execution", "data": executed_trades}))
                
            except Exception as e:
                logger.error(f"Error fetching data from yfinance: {e}")
            
            # yfinance limits: don't spam too hard. We'll poll every 5 seconds for the prototype.
            await asyncio.sleep(5)
            
    def stop(self):
        self.is_running = False
