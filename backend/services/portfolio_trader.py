"""
Two-stage portfolio AI — replaces the monolithic single-call approach.

Agent 1 (Risk Analyst)  → advisory only, never executes trades
Agent 2 (Auto-Executor) → executes trades, only when auto_ai_enabled
"""

import asyncio
import json
import logging
from datetime import datetime
from redis.asyncio import Redis
from database import get_database

logger = logging.getLogger(__name__)


class PortfolioTrader:
    def __init__(self, redis_client: Redis, tickers: list[str]):
        self.redis = redis_client
        self.tickers = tickers
        self.is_running = False
        self.CHECK_INTERVAL = 60  # seconds

    def update_tickers(self, tickers: list[str]):
        """Update the ticker list (called when universe refreshes)."""
        self.tickers = tickers

    # ── Agent 1: Risk Analyst (advisory only) ──────────────────────────

    async def run_risk_analyst(
        self, profile: dict, portfolio: dict, market_data: dict
    ) -> dict | None:
        """
        Analyze the portfolio and suggest changes — never executes trades.
        Used by both the auto-invest loop AND the manual advisor endpoint.
        """
        try:
            import os
            if os.getenv("DEMO_MODE", "false").lower() == "true":
                try:
                    with open(os.path.join("demo_snapshots", "agent1_analysis.json"), "r") as f:
                        return json.load(f)
                except Exception as e:
                    logger.error(f"Failed to load DEMO_MODE agent 1 snapshot: {e}")

            from services.ai_client import chat_json, chat_with_tools, parse_json

            cash = portfolio.get("cash", 0)
            holdings = portfolio.get("holdings", {})
            risk = profile.get("risk_tolerance", "Moderate")
            occupation = profile.get("occupation", "Not specified")
            savings = profile.get("monthly_savings", "Not specified")
            aim = profile.get("investment_aim", "General wealth building")
            current_cap = profile.get("current_capital", 0)
            target_amt = profile.get("target_amount", 0)
            target_tf = profile.get("target_timeframe", 0)
            intraday = profile.get("intraday_interest", False)

            # Build market context
            market_lines = []
            for ticker, data in market_data.items():
                insight = data.get("insight", {})
                price = data.get("price", "N/A")
                pattern = insight.get("pattern", "N/A")
                confidence = insight.get("confidence", 0)
                market_lines.append(
                    f"  - {ticker}: ₹{price}, Pattern: {pattern}, Signal confidence: {confidence}%"
                )
            market_context = "\n".join(market_lines) if market_lines else "  No market data available"

            prompt = f"""You are DimeDoll's Portfolio Risk Analyst — a calm, thoughtful financial advisor
who helps women build wealth confidently.

YOUR ROLE: Analyze and advise ONLY. You do NOT place trades. You provide a structured
risk assessment with suggested actions that a separate executor will review.

══════════════ USER PROFILE ══════════════
- Current Capital (Starting Point): ₹{current_cap:,.2f}
- Available Cash (To Invest Now): ₹{cash:,.2f}
- Current Holdings: {json.dumps(holdings) if holdings else "None (all cash)"}
- Risk Tolerance: {risk}
- Occupation: {occupation}
- Monthly Savings: {savings}
- Investment Aim: {aim}
- Target Amount: {"₹" + f"{target_amt:,.0f}" if target_amt else "Not set"}
- Target Timeframe: {f"{target_tf} months" if target_tf else "Not set"}
- Intraday Interest: {"Yes — include short-term plays" if intraday else "No — focus on longer-horizon"}

══════════════ LIVE MARKET DATA ══════════════
{market_context}

══════════════ YOUR TASK ══════════════
1. Assess overall portfolio risk and diversification
2. Consider the user's occupation stability, savings capacity, and stated investment aim. If Target Amount and Timeframe are set, explicitly calculate the required return or gap from their Current Capital and advise how realistic it is to reach that target.
3. Suggest specific actions (BUY/SELL/HOLD). You MUST explicitly name specific tickers from the LIVE MARKET DATA list that best fit the user's profile (e.g. "I recommend prioritizing RELIANCE.NS and TCS.NS").
4. If intraday interest is off, emphasize longer-term positions
5. Explain everything in plain, jargon-free language a beginner would understand

Respond ONLY with valid JSON in this exact structure:
{{
  "risk_level": "Low" or "Medium" or "High",
  "risk_summary": "2-3 sentences about portfolio health in plain English",
  "diversification_notes": "Are holdings well-spread? Any concentration risk?",
  "suggestions": [
    {{
      "ticker": "SYMBOL.NS",
      "action": "BUY" or "SELL" or "HOLD",
      "quantity": 5,
      "reasoning": "Clear, plain-English explanation",
      "confidence": 78
    }}
  ],
  "overall_reasoning": "Your complete market view and why these suggestions make sense for THIS user"
}}"""

            system_prompt = "You are DimeDoll's portfolio risk analyst. Respond only in valid JSON unless calling tools."
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]

            tools = [
                {
                    "type": "function",
                    "function": {
                        "name": "scan_red_flags",
                        "description": "Scan a stock ticker for deterministic red flags (leverage, cash flow, interest coverage).",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "ticker": {"type": "string", "description": "The stock ticker symbol"}
                            },
                            "required": ["ticker"]
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "compute_scorecard",
                        "description": "Get the deterministic 0-10 scorecard for a stock ticker based on momentum, financials, and red flags.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "ticker": {"type": "string", "description": "The stock ticker symbol"}
                            },
                            "required": ["ticker"]
                        }
                    }
                }
            ]

            # 1. First API call (with tools)
            response_msg = await asyncio.to_thread(
                chat_with_tools,
                messages=messages,
                tools=tools,
                max_tokens=1500,
                temperature=0.5
            )

            if getattr(response_msg, "tool_calls", None):
                # Execute tools
                messages.append(response_msg.model_dump())
                
                db = get_database()
                from services.stock_scorer import scan_red_flags, compute_scorecard
                
                for tool_call in response_msg.tool_calls:
                    fn_name = tool_call.function.name
                    try:
                        args = json.loads(tool_call.function.arguments)
                        ticker = args.get("ticker")
                        
                        # Check MongoDB cache first
                        cached = await db.computed_scores.find_one({"ticker": ticker})
                        
                        if fn_name == "scan_red_flags":
                            if cached and "red_flags" in cached:
                                res = cached["red_flags"]
                            else:
                                res = await asyncio.to_thread(scan_red_flags, ticker)
                        elif fn_name == "compute_scorecard":
                            if cached:
                                # Remove mongodb id
                                cached.pop("_id", None)
                                res = cached
                            else:
                                res = await asyncio.to_thread(compute_scorecard, ticker)
                        else:
                            res = {"error": "Unknown function"}
                            
                    except Exception as e:
                        res = {"error": str(e)}
                        
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": fn_name,
                        "content": json.dumps(res)
                    })
                
                # 2. Second API call (force JSON)
                from services.ai_client import _get_client, FREE_MODEL, PAID_MODEL
                client = _get_client()
                
                try:
                    resp = await asyncio.to_thread(
                        client.chat.completions.create,
                        model=FREE_MODEL,
                        messages=messages,
                        max_tokens=1500,
                        temperature=0.5,
                        response_format={"type": "json_object"}
                    )
                except Exception as free_e:
                    logger.warning(f"Agent 1 free model failed on second call: {free_e}")
                    resp = await asyncio.to_thread(
                        client.chat.completions.create,
                        model=PAID_MODEL,
                        messages=messages,
                        max_tokens=1500,
                        temperature=0.5,
                        response_format={"type": "json_object"}
                    )
                
                raw_content = resp.choices[0].message.content
                result = parse_json(raw_content)
            else:
                # No tool calls made, just parse content
                result = parse_json(response_msg.content)

            if "error" in result and "raw" in result:
                logger.warning(f"Agent 1 returned unparseable response: {result.get('raw', '')[:200]}")
                return None

            return result

        except Exception as e:
            logger.error(f"Agent 1 (Risk Analyst) failed: {e}")
            return None

    # ── Agent 2: Auto-Invest Executor ──────────────────────────────────

    async def run_executor(
        self, analysis: dict, portfolio: dict, market_data: dict
    ) -> dict | None:
        """
        Given Agent 1's analysis, independently decide and execute trades.
        Has ABSOLUTE FREEDOM — can concentrate, diversify, or hold all cash.
        """
        try:
            import os
            if os.getenv("DEMO_MODE", "false").lower() == "true":
                try:
                    with open(os.path.join("demo_snapshots", "agent2_decision.json"), "r") as f:
                        return json.load(f)
                except Exception as e:
                    logger.error(f"Failed to load DEMO_MODE agent 2 snapshot: {e}")

            from services.ai_client import chat_json

            cash = portfolio.get("cash", 0)
            holdings = portfolio.get("holdings", {})

            # Build market context for Agent 2
            market_lines = []
            for ticker, data in market_data.items():
                insight = data.get("insight", {})
                price = data.get("price", "N/A")
                pattern = insight.get("pattern", "N/A")
                confidence = insight.get("confidence", 0)
                market_lines.append(
                    f"  - {ticker}: ₹{price}, Pattern: {pattern}, Signal confidence: {confidence}%"
                )
            market_context = "\n".join(market_lines) if market_lines else "  No market data available"

            latest_rec = portfolio.get("latest_recommendation", "")
            memory_section = ""
            if latest_rec:
                memory_section = f"\n══════════════ OVERARCHING STRATEGY (USER PROFILE) ══════════════\nThe user previously ran a profile analysis which generated the following long-term strategy. Align your trades with this strategic memory if possible:\n{latest_rec}\n"

            prompt = f"""You are DimeDoll's Auto-Invest Executor — an elite AI fund manager.
{memory_section}
You have received the following analysis from the Risk Analyst (Stage 2):

══════════════ ANALYST'S ASSESSMENT ══════════════
Risk Level: {analysis.get("risk_level", "Unknown")}
Summary: {analysis.get("risk_summary", "N/A")}
Diversification: {analysis.get("diversification_notes", "N/A")}
Overall Reasoning: {analysis.get("overall_reasoning", "N/A")}

Analyst's Suggestions:
{json.dumps(analysis.get("suggestions", []), indent=2)}

══════════════ STAGE 1: TECHNICAL SIGNALS (MARKET DATA) ══════════════
{market_context}

══════════════ CURRENT STATE ══════════════
Available Cash: ₹{cash:,.2f}
Current Holdings: {json.dumps(holdings) if holdings else "None"}

══════════════ YOUR MANDATE ══════════════
You are the final Executor. You must explicitly reconcile Stage 1 (Technical Signals) and Stage 2 (Analyst's Assessment).
- Compare the technical signal against Agent 1's risk-based suggestion for each candidate stock.
- Explain in your reasoning where they agree and where they disagree, and how you are resolving any disagreement (e.g. "Technical signal says BUY on RELIANCE with 55% confidence, and Agent 1 flags it as within risk tolerance — proceeding with BUY").
- You have ABSOLUTE FREEDOM to override Agent 1 if the technicals demand it, or ignore technicals if Agent 1 warns of risk.
- If buying, total cost must NOT exceed Available Cash.
- If selling, you can only sell shares you actually hold.

Respond ONLY with valid JSON:
{{
  "thoughts": "Your independent market view reconciling the two stages and why you are making these specific choices",
  "trades": [
    {{
      "ticker": "SYMBOL.NS",
      "action": "BUY" or "SELL",
      "quantity": 5,
      "reasoning": "Why you're executing this specific trade",
      "confidence": 85
    }}
  ]
}}

"trades" can be an empty array [] if you decide to hold."""

            result = await asyncio.to_thread(
                chat_json,
                prompt,
                system="You are DimeDoll's auto-invest executor. Respond only in valid JSON.",
                max_tokens=1200,
                temperature=0.4,
            )

            if "error" in result and "raw" in result:
                logger.warning(f"Agent 2 returned unparseable response")
                return None

            return result

        except Exception as e:
            logger.error(f"Agent 2 (Executor) failed: {e}")
            return None

    # ── Trade execution logic (only Agent 2 calls this) ────────────────

    async def _execute_trades(
        self, trades: list, portfolio: dict, market_data: dict, username: str, thoughts: str = ""
    ) -> list:
        """Execute a list of trades against simulated portfolio. Returns executed list."""
        executed = []
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
                    executed.append({
                        "ticker": ticker,
                        "price": current_price,
                        "action": "BUY",
                        "quantity": quantity,
                        "timestamp": datetime.now().isoformat(),
                        "reason": trade.get("reasoning", ""),
                        "source": "agent2_executor",
                    })
                    await self._track_prediction(trade, current_price, username, thoughts)

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
                    executed.append({
                        "ticker": ticker,
                        "price": current_price,
                        "action": "SELL",
                        "quantity": qty_to_sell,
                        "timestamp": datetime.now().isoformat(),
                        "reason": trade.get("reasoning", ""),
                        "source": "agent2_executor",
                    })
                    await self._track_prediction(trade, current_price, username, thoughts)

        if portfolio_updated:
            await db.portfolios.update_one(
                {"username": username}, {"$set": portfolio}, upsert=True
            )
            await self.redis.set("user:portfolio", json.dumps(portfolio))
            await self.redis.publish(
                "live_ticks",
                json.dumps({"type": "portfolio_update", "data": portfolio}),
            )

        return executed

    async def _track_prediction(self, trade: dict, price: float, username: str, thoughts: str = ""):
        """Record the AI's trade in the prediction scorecard."""
        try:
            db = get_database()
            prediction = {
                "ticker": trade["ticker"],
                "decision": trade["action"],
                "confidence": trade.get("confidence", 75),
                "reasoning": thoughts or trade.get("reasoning", "Auto-Trader execution"),
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
            logger.error(f"Failed to track prediction: {e}")

    # ── Main loop (auto-invest mode) ───────────────────────────────────

    async def run(self):
        """Background loop: Agent 1 → Agent 2 → execute, when auto_ai_enabled."""
        self.is_running = True
        self._ticker_index = getattr(self, '_ticker_index', 0)
        logger.info("Started two-stage Portfolio Auto-Trader.")

        while self.is_running:
            try:
                # Check if auto-invest is enabled
                auto_ai_enabled = await self.redis.get("auto_ai_enabled")
                val = auto_ai_enabled.decode("utf-8") if isinstance(auto_ai_enabled, bytes) else auto_ai_enabled
                if val != "true":
                    logger.debug("Auto-Invest is disabled. Skipping cycle.")
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                active_username = await self.redis.get("active_username")
                if not active_username:
                    logger.warning("Auto-Invest enabled, but no active_username found in Redis.")
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue
                username = active_username.decode("utf-8") if isinstance(active_username, bytes) else active_username

                # Load current state
                profile_data = await self.redis.get("user:profile")
                profile = json.loads(profile_data) if profile_data else {}

                portfolio_data = await self.redis.get("user:portfolio")
                portfolio = json.loads(portfolio_data) if portfolio_data else {"cash": 0, "holdings": {}}

                cash = portfolio.get("cash", 0)
                if cash <= 0 and not portfolio.get("holdings"):
                    logger.info("Auto-Invest: Portfolio cash is 0 and no holdings. Broadcasting waiting message.")
                    await self.redis.publish(
                        "live_ticks",
                        json.dumps({"type": "auto_trader_thoughts", "data": "Portfolio cash is zero. Waiting for you to deposit simulated funds before I execute any trades."}),
                    )
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                # Process ONE ticker per cycle (round-robin) to avoid API rate limits
                if not self.tickers:
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                target_ticker = self.tickers[self._ticker_index % len(self.tickers)]
                self._ticker_index += 1

                market_data = {}
                val = await self.redis.get(f"ticker:{target_ticker}")
                if val:
                    market_data[target_ticker] = json.loads(val)
                
                if not market_data:
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                # ── Stage 1: Risk Analyst ──
                logger.info("Auto-Trader: Running Agent 1 (Risk Analyst)...")
                await self.redis.publish(
                    "live_ticks",
                    json.dumps({"type": "auto_trader_analysis", "data": "🔍 Analyzing your portfolio and market conditions..."}),
                )

                analysis = await self.run_risk_analyst(profile, portfolio, market_data)
                if not analysis:
                    logger.info("Agent 1 returned nothing — skipping this cycle.")
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                # Broadcast Agent 1's reasoning
                broadcast_data = {
                    "risk_level": analysis.get("risk_level", "Unknown"),
                    "risk_summary": analysis.get("risk_summary", ""),
                    "suggestions": analysis.get("suggestions", []),
                    "overall_reasoning": analysis.get("overall_reasoning", ""),
                }
                await self.redis.publish(
                    "live_ticks",
                    json.dumps({"type": "auto_trader_analysis", "data": broadcast_data}),
                )

                # ── Stage 2: Executor ──
                logger.info("Auto-Trader: Running Agent 2 (Executor)...")
                execution_plan = await self.run_executor(analysis, portfolio, market_data)
                if not execution_plan:
                    logger.info("Agent 2 returned nothing — holding position.")
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                thoughts = execution_plan.get("thoughts", "Evaluating options...")
                trades = execution_plan.get("trades", [])

                # Broadcast Agent 2's thoughts (separate from Agent 1)
                await self.redis.publish(
                    "live_ticks",
                    json.dumps({"type": "auto_trader_thoughts", "data": thoughts}),
                )

                # Calculate live total value for continuous graph FIRST, before any 'continue' statements
                # so the graph updates even if the AI decides to HOLD
                current_cash = portfolio.get("cash", 0)
                current_holdings = portfolio.get("holdings", {})
                holdings_val = 0
                for t, qty in current_holdings.items():
                    price = market_data.get(t, {}).get("price", 0)
                    holdings_val += price * qty
                live_val = current_cash + holdings_val
                
                history_log = portfolio.get("history_log", [])
                now_str = datetime.now().strftime("%H:%M:%S")
                history_log.append({"date": now_str, "value": round(live_val, 2)})
                portfolio["history_log"] = history_log[-50:] # Keep last 50 data points for UI graph
                
                # Save & sync live portfolio
                await self.redis.set("user:portfolio", json.dumps(portfolio))
                # Fix: Use local db variable, not self.db
                db = get_database()
                await db.portfolios.update_one({"username": username}, {"$set": {"history_log": portfolio["history_log"]}})
                
                # Publish portfolio update so UI graph animates
                await self.redis.publish(
                    "live_ticks",
                    json.dumps({"type": "portfolio_update", "data": portfolio}),
                )

                if not trades:
                    logger.info(f"Agent 2 holding: {thoughts}")
                    dummy_executed = [{
                        "ticker": "PORTFOLIO",
                        "price": 0,
                        "action": "HOLD",
                        "quantity": 0,
                        "timestamp": datetime.now().isoformat(),
                        "reason": thoughts,
                        "source": "agent2_executor",
                    }]
                    await self.redis.publish(
                        "live_ticks",
                        json.dumps({"type": "auto_trader_execution", "data": dummy_executed}),
                    )
                    await asyncio.sleep(self.CHECK_INTERVAL)
                    continue

                # Execute trades
                executed = await self._execute_trades(trades, portfolio, market_data, username, thoughts)

                if executed:
                    await self.redis.publish(
                        "live_ticks",
                        json.dumps({"type": "auto_trader_execution", "data": executed}),
                    )
                    logger.info(f"Agent 2 executed {len(executed)} trades.")



            except Exception as e:
                logger.error(f"Auto-Trader loop error: {e}")

            await asyncio.sleep(self.CHECK_INTERVAL)

    def stop(self):
        self.is_running = False
