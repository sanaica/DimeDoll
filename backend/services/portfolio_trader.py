import asyncio
import json
import logging
import os
from datetime import datetime
from redis.asyncio import Redis
from database import get_database

logger = logging.getLogger(__name__)

class PortfolioTrader:
    def __init__(self, redis_client: Redis, tickers: list[str]):
        self.redis = redis_client
        self.tickers = tickers
        self.is_running = False
        self.CHECK_INTERVAL = 60  # Run every 60 seconds

    async def _call_portfolio_ai(self, profile: dict, portfolio: dict, market_data: dict):
        """Calls Gemini with the holistic portfolio prompt."""
        try:
            import google.generativeai as genai
            from dotenv import load_dotenv
            env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
            load_dotenv(env_path)

            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                logger.warning("PortfolioTrader: No GEMINI_API_KEY")
                return None

            genai.configure(api_key=api_key)

            cash = portfolio.get("cash", 0)
            holdings = portfolio.get("holdings", {})
            risk = profile.get("risk_tolerance", "Moderate")

            # Build market context string
            market_context = ""
            for ticker, data in market_data.items():
                insight = data.get("insight", {})
                market_context += f"- {ticker}: Price ₹{data.get('price')}. Trend: {insight.get('pattern', 'N/A')}\n"

            prompt = f"""
You are the DimeDoll Portfolio Auto-Trader, an elite AI fund manager.

User Profile:
- Available Cash: ₹{cash:,.2f}
- Current Holdings: {json.dumps(holdings)}
- Risk Profile: {risk}

Live Market Data:
{market_context}

Your Goal:
You have ABSOLUTE FREEDOM to maximize profit. 
- You do NOT have to divide the money equally.
- You can put all eggs in one basket if you strongly believe in a single stock.
- You can hold 100% cash and wait if the market looks bad.
- You can suggest multiple trades at once or none at all.
- If buying, ensure the total cost does not exceed Available Cash.
- If selling, ensure you own the shares in Current Holdings.

Respond ONLY with a valid JSON object. It MUST contain "thoughts" explaining your overall market view and reasoning, and "trades" which is an array of trades (can be empty `[]`).
Example format:
{{
  "thoughts": "The overall market is bearish. I am holding cash to protect capital.",
  "trades": [
    {{
      "ticker": "TCS.NS",
      "action": "BUY",
      "quantity": 2,
      "reasoning": "Strong SMA crossover, adding to tech exposure.",
      "confidence": 85
    }}
  ]
}}
"""
            try:
                model = genai.GenerativeModel('gemini-2.5-flash')
                response = await asyncio.to_thread(model.generate_content, prompt)
                text = response.text.strip()
            except Exception as gemini_e:
                logger.warning(f"Gemini failed, falling back to Claude: {gemini_e}")
                await self.redis.publish("live_ticks", json.dumps({"type": "auto_trader_thoughts", "data": f"Gemini failed: {str(gemini_e)}. Falling back to Claude-3-Haiku..."}))
                
                anthropic_key = os.getenv("ANTHROPIC_API_KEY")
                if not anthropic_key:
                    logger.error("No Anthropic key for fallback.")
                    return {"thoughts": "Gemini failed, and no Anthropic API key is configured.", "trades": []}
                from anthropic import Anthropic
                claude = Anthropic(api_key=anthropic_key)
                
                try:
                    claude_resp = await asyncio.to_thread(
                        claude.messages.create,
                        model="claude-3-haiku-20240307",
                        max_tokens=1000,
                        messages=[{"role": "user", "content": prompt}]
                    )
                    text = claude_resp.content[0].text.strip()
                except Exception as claude_e:
                    logger.error(f"Claude fallback failed: {claude_e}")
                    return {"thoughts": f"Both AI models failed. Gemini error: {str(gemini_e)} | Claude error: {str(claude_e)}", "trades": []}
            
            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
                
            return json.loads(text.strip())

        except Exception as e:
            logger.error(f"Portfolio AI call failed completely: {e}")
            return None

    async def _track_prediction(self, trade: dict, price: float, username: str):
        """Tracks the AI's execution in the Prediction Scorecard."""
        try:
            db = get_database()
            prediction = {
                "ticker": trade["ticker"],
                "decision": trade["action"],
                "confidence": trade.get("confidence", 75),
                "reasoning": trade.get("reasoning", "Auto-Trader execution"),
                "entry_price": price,
                "suggested_allocation": None,
                "username": username,
                "status": "open",
                "source": "auto_trader",
                "created_at": datetime.now().isoformat(),
                "closed_at": None,
                "exit_price": None,
            }
            await db.ai_predictions.insert_one(prediction)
        except Exception as e:
            logger.error(f"Failed to track auto-trader prediction: {e}")

    async def run(self):
        self.is_running = True
        logger.info("Started Holistic Portfolio Auto-Trader.")
        
        while self.is_running:
            try:
                # Check if enabled
                auto_ai_enabled = await self.redis.get("auto_ai_enabled")
                auto_ai_str = auto_ai_enabled.decode('utf-8') if isinstance(auto_ai_enabled, bytes) else auto_ai_enabled
                if auto_ai_str != "true":
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                active_username = await self.redis.get("active_username")
                if not active_username:
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue
                
                username = active_username.decode('utf-8') if isinstance(active_username, bytes) else active_username

                # Fetch current state
                profile_data = await self.redis.get("user:profile")
                profile = json.loads(profile_data) if profile_data else {}
                
                portfolio_data = await self.redis.get("user:portfolio")
                portfolio = json.loads(portfolio_data) if portfolio_data else {"cash": 0, "holdings": {}}
                
                # Gather market data
                market_data = {}
                for t in self.tickers:
                    val = await self.redis.get(f"ticker:{t}")
                    if val:
                        market_data[t] = json.loads(val)
                        
                if not market_data:
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                # Call AI
                logger.info("Auto-Trader evaluating portfolio...")
                ai_response = await self._call_portfolio_ai(profile, portfolio, market_data)
                
                if not ai_response:
                    logger.info("Auto-Trader AI call failed or returned nothing.")
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                if isinstance(ai_response, list):
                    thoughts = "Analyzing market..."
                    trades = ai_response
                else:
                    thoughts = ai_response.get("thoughts", "Analyzing market...")
                    trades = ai_response.get("trades", [])

                # Broadcast thoughts immediately
                await self.redis.publish("live_ticks", json.dumps({"type": "auto_trader_thoughts", "data": thoughts}))

                if not trades:
                    logger.info(f"Auto-Trader holding: {thoughts}")
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                executed_trades = []
                portfolio_updated = False
                db = get_database()

                for trade in trades:
                    ticker = trade.get("ticker")
                    action = trade.get("action")
                    quantity = trade.get("quantity", 0)
                    
                    if not ticker or not action or quantity <= 0 or ticker not in market_data:
                        continue
                        
                    current_price = float(market_data[ticker]["price"])
                    
                    if action == "BUY":
                        cost = current_price * quantity
                        if portfolio["cash"] >= cost:
                            portfolio["cash"] -= cost
                            portfolio["holdings"][ticker] = portfolio["holdings"].get(ticker, 0) + quantity
                            portfolio_updated = True
                            
                            executed_trades.append({
                                "ticker": ticker,
                                "price": current_price,
                                "action": "BUY",
                                "quantity": quantity,
                                "timestamp": datetime.now().isoformat(),
                                "reason": f"[Auto-Trader] {trade.get('reasoning', '')}"
                            })
                            await self._track_prediction(trade, current_price, username)
                            
                    elif action == "SELL":
                        current_qty = portfolio["holdings"].get(ticker, 0)
                        if current_qty > 0:
                            qty_to_sell = min(quantity, current_qty)
                            revenue = current_price * qty_to_sell
                            portfolio["cash"] += revenue
                            portfolio["holdings"][ticker] -= qty_to_sell
                            if portfolio["holdings"][ticker] == 0:
                                del portfolio["holdings"][ticker]
                            portfolio_updated = True
                            
                            executed_trades.append({
                                "ticker": ticker,
                                "price": current_price,
                                "action": "SELL",
                                "quantity": qty_to_sell,
                                "timestamp": datetime.now().isoformat(),
                                "reason": f"[Auto-Trader] {trade.get('reasoning', '')}"
                            })
                            await self._track_prediction(trade, current_price, username)

                if portfolio_updated:
                    # Save to MongoDB
                    await db.portfolios.update_one(
                        {"username": username},
                        {"$set": portfolio},
                        upsert=True
                    )
                    # Sync to Redis
                    await self.redis.set("user:portfolio", json.dumps(portfolio))
                    await self.redis.publish("live_ticks", json.dumps({"type": "portfolio_update", "data": portfolio}))
                    
                if executed_trades:
                    await self.redis.publish("live_ticks", json.dumps({"type": "trade_execution", "data": executed_trades}))
                    logger.info(f"Auto-Trader executed {len(executed_trades)} trades.")

            except Exception as e:
                logger.error(f"Auto-Trader loop error: {e}")
                
            await asyncio.sleep(self.CHECK_INTERVAL)

    def stop(self):
        self.is_running = False
