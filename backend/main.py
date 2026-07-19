import asyncio
import json
import logging
import os
from urllib.parse import urlparse

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from pydantic import BaseModel
from dotenv import load_dotenv
import hashlib

from services.yfinance_fetcher import YFinanceFetcher
from services.portfolio_trader import PortfolioTrader
from services.ticker_universe import TickerUniverse
from database import connect_to_mongo, close_mongo_connection, get_database
from routers.predictions import router as predictions_router
from routers.portfolio_advisor import router as advisor_router

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))


# ── Extended User Profile ──────────────────────────────────────────────

class UserProfile(BaseModel):
    age: int = 25
    employment: str = ""
    income: str = ""
    goal: str = ""
    experience: str = ""
    risk_tolerance: str = ""
    auto_invest: bool = False
    occupation: str = ""
    monthly_savings: str = ""
    investment_aim: str = ""
    target_amount: float = 0
    target_timeframe: int = 0  # months
    intraday_interest: bool = False
    current_capital: float = 0


class UserAuth(BaseModel):
    username: str
    password: str


class DepositRequest(BaseModel):
    username: str
    amount: float


# ── Logging ────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App ────────────────────────────────────────────────────────────────

app = FastAPI(title="DimeDoll API")
app.include_router(predictions_router, prefix="/api")
app.include_router(advisor_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Redis from env var ─────────────────────────────────────────────────

def _make_redis() -> Redis:
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return Redis.from_url(url, decode_responses=True, health_check_interval=30, retry_on_timeout=True)


redis_client: Redis = _make_redis()

# ── State ──────────────────────────────────────────────────────────────

fetcher = None
portfolio_trader = None
ticker_universe = None
active_websockets = set()


@app.on_event("startup")
async def startup_event():
    global redis_client, fetcher, portfolio_trader, ticker_universe

    redis_client = _make_redis()
    await connect_to_mongo()

    # Initialize ticker universe
    ticker_universe = TickerUniverse(redis_client)
    core_tickers = await ticker_universe.get_core_tickers()
    logger.info(f"Loaded {len(core_tickers)} core tickers")

    # Start background ticker refresh
    asyncio.create_task(ticker_universe.start_daily_refresh())

    # Start fetcher with dynamic tickers
    fetcher = YFinanceFetcher(redis_client, core_tickers)
    asyncio.create_task(fetcher.fetch_and_publish())
    logger.info("Started background fetcher.")

    # Start portfolio auto-trader
    portfolio_trader = PortfolioTrader(redis_client, core_tickers)
    asyncio.create_task(portfolio_trader.run())
    logger.info("Started two-stage Portfolio Auto-Trader.")


@app.on_event("shutdown")
async def shutdown_event():
    global fetcher, portfolio_trader
    if fetcher:
        fetcher.stop()
    if portfolio_trader:
        portfolio_trader.stop()
    await redis_client.close()
    await close_mongo_connection()
    logger.info("Shutdown complete.")


# ── WebSocket ──────────────────────────────────────────────────────────

@app.websocket("/ws/live-ticks")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    logger.info(f"New websocket connection. Total: {len(active_websockets)}")

    # Send initial cached data
    try:
        if ticker_universe:
            core = await ticker_universe.get_core_tickers()
        else:
            core = []
        initial_data = []
        for t in core:
            val = await redis_client.get(f"ticker:{t}")
            if val:
                initial_data.append(json.loads(val))
        if initial_data:
            await websocket.send_json({"type": "initial_data", "data": initial_data})
    except Exception as e:
        logger.error(f"Error sending initial data: {e}")

    # Listen to pub/sub
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("live_ticks")

    try:
        async def read_from_client():
            try:
                while True:
                    await websocket.receive_text()
            except WebSocketDisconnect:
                pass

        async def read_from_redis():
            try:
                while True:
                    message = await pubsub.get_message(ignore_subscribe_messages=True)
                    if message and message['type'] == 'message':
                        await websocket.send_text(message['data'])
                    await asyncio.sleep(0.01)
            except Exception as e:
                logger.error(f"Redis pub/sub error: {e}")

        client_task = asyncio.create_task(read_from_client())
        redis_task = asyncio.create_task(read_from_redis())
        done, pending = await asyncio.wait(
            [client_task, redis_task], return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

    except Exception as e:
        logger.error(f"Websocket error: {e}")
    finally:
        await pubsub.unsubscribe("live_ticks")
        await pubsub.close()
        if websocket in active_websockets:
            active_websockets.remove(websocket)
        logger.info("Websocket disconnected.")


# ── Health ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "note": "All money in this app is simulated. No real currency."}


# ── Auth ───────────────────────────────────────────────────────────────

@app.post("/api/auth/signup")
async def signup(user: UserAuth):
    db = get_database()
    existing = await db.users.find_one({"username": user.username})
    if existing:
        return {"status": "error", "message": "Username already exists"}

    # Note: SHA-256 without salt — acceptable for hackathon demo only.
    # In production, use bcrypt or argon2.
    hashed_pw = hashlib.sha256(user.password.encode()).hexdigest()
    await db.users.insert_one({
        "username": user.username,
        "password": hashed_pw,
        "profile": {},
    })
    await db.portfolios.insert_one({
        "username": user.username,
        "cash": 0.0,
        "total_deposited": 0.0,
        "holdings": {},
    })
    return {"status": "success", "username": user.username}


@app.post("/api/auth/login")
async def login(user: UserAuth):
    db = get_database()
    hashed_pw = hashlib.sha256(user.password.encode()).hexdigest()
    doc = await db.users.find_one({"username": user.username, "password": hashed_pw})
    if not doc:
        return {"status": "error", "message": "Invalid credentials"}

    await redis_client.set("active_username", user.username)
    return {"status": "success", "username": user.username}


# ── Profile ────────────────────────────────────────────────────────────

@app.post("/api/profile")
async def save_profile(profile: UserProfile, username: str = "default_user"):
    db = get_database()

    # AI-augmented risk scoring
    score = 0
    if profile.age < 35:
        score += 2
    elif profile.age < 55:
        score += 1

    if profile.income == "> 15L":
        score += 2
    elif profile.income == "5L-15L":
        score += 1

    if profile.experience == "Pro":
        score += 2
    elif profile.experience == "Intermediate":
        score += 1

    if profile.goal == "Short-term Wealth":
        score += 1
    elif profile.goal == "Retirement":
        score -= 1

    # Factor in new fields
    if profile.monthly_savings in ["> 50K", "20K-50K"]:
        score += 1
    if profile.intraday_interest:
        score += 1
    if profile.investment_aim and "emergency" in profile.investment_aim.lower():
        score -= 1  # more conservative for emergency funds

    if score >= 5:
        ai_risk = "Aggressive"
    elif score >= 3:
        ai_risk = "Moderate"
    else:
        ai_risk = "Conservative"

    profile.risk_tolerance = ai_risk
    profile_dict = profile.model_dump()

    existing_user = await db.users.find_one({"username": username})
    existing_profile = existing_user.get("profile", {}) if existing_user else {}
    
    updated_profile = {**existing_profile, **profile_dict}

    # Sync Current Capital Delta to Wallet Cash
    old_capital = existing_profile.get("current_capital", 0)
    new_capital = profile_dict.get("current_capital", 0)
    capital_delta = new_capital - old_capital

    if capital_delta != 0:
        portfolio = await db.portfolios.find_one({"username": username})
        if portfolio:
            await db.portfolios.update_one(
                {"username": username},
                {"$inc": {"cash": capital_delta, "total_deposited": capital_delta}}
            )
        else:
            default_portfolio = {
                "username": username,
                "cash": new_capital,
                "total_deposited": new_capital,
                "holdings": {},
            }
            await db.portfolios.update_one(
                {"username": username}, {"$set": default_portfolio}, upsert=True
            )

    await db.users.update_one(
        {"username": username},
        {"$set": {"profile": updated_profile}},
        upsert=True,
    )
    await redis_client.set("user:profile", json.dumps(updated_profile))

    return {"status": "success", "ai_risk": ai_risk}


@app.get("/api/profile")
async def get_profile(username: str = "default_user"):
    db = get_database()
    user = await db.users.find_one({"username": username})
    if user and "profile" in user:
        await redis_client.set("user:profile", json.dumps(user["profile"]))
        await redis_client.set("active_username", username)
        return user["profile"]
    return {}


# ── Portfolio ──────────────────────────────────────────────────────────

@app.get("/api/portfolio")
async def get_portfolio(username: str = "default_user"):
    db = get_database()
    await redis_client.set("active_username", username)
    portfolio = await db.portfolios.find_one({"username": username})
    if portfolio:
        portfolio.pop("_id", None)
        await redis_client.set("user:portfolio", json.dumps(portfolio))
        return portfolio

    default_portfolio = {
        "username": username,
        "cash": 0.0,
        "total_deposited": 0.0,
        "holdings": {},
    }
    await db.portfolios.update_one(
        {"username": username}, {"$set": default_portfolio}, upsert=True
    )
    await redis_client.set("user:portfolio", json.dumps(default_portfolio))
    return default_portfolio


@app.post("/api/portfolio/deposit")
async def deposit(req: DepositRequest):
    from pymongo import ReturnDocument
    db = get_database()
    updated = await db.portfolios.find_one_and_update(
        {"username": req.username},
        {"$inc": {"cash": req.amount, "total_deposited": req.amount}},
        return_document=ReturnDocument.AFTER
    )
    if updated:
        updated.pop("_id", None)
        
        # Calculate current real value
        cash = updated.get("cash", 0)
        holdings = updated.get("holdings", {})
        raw_ticks = await redis_client.get("market_ticks")
        live_prices = json.loads(raw_ticks) if raw_ticks else {}
        holdings_val = sum(live_prices.get(t, {}).get("price", 0) * q for t, q in holdings.items())
        live_val = cash + holdings_val

        # Append to history so graph jumps immediately on deposit
        history_log = updated.get("history_log", [])
        now_str = datetime.now().strftime("%H:%M:%S")
        history_log.append({"date": now_str, "value": round(live_val, 2)})
        updated["history_log"] = history_log[-50:]
        
        # Save updated history back to DB
        await db.portfolios.update_one({"username": req.username}, {"$set": {"history_log": updated["history_log"]}})
        
        await redis_client.set("user:portfolio", json.dumps(updated))
        await redis_client.publish(
            "live_ticks",
            json.dumps({"type": "portfolio_update", "data": updated})
        )
    return {"status": "success"}

@app.get("/api/portfolio/history")
async def get_portfolio_history(username: str = "default_user"):
    """Return historical snapshots for charting. For hackathon, we simulate a small history."""
    import random
    from datetime import datetime, timedelta
    
    db = get_database()
    portfolio = await db.portfolios.find_one({"username": username})
    cash = portfolio.get("cash", 0) if portfolio else 0
    total_dep = portfolio.get("total_deposited", 0) if portfolio else 0
    
    history = []
    
    if total_dep == 0 and cash == 0:
        return {"history": []}
        
    base_val = total_dep
    now = datetime.now()
    
    # Calculate current real value
    holdings = portfolio.get("holdings", {})
    
    # Fetch live prices from Redis to calculate actual total portfolio value
    raw_ticks = await redis_client.get("market_ticks")
    live_prices = {}
    if raw_ticks:
        try:
            live_prices = json.loads(raw_ticks)
        except Exception:
            pass
            
    holdings_value = 0
    for ticker, qty in holdings.items():
        price = live_prices.get(ticker, {}).get("price", 0)
        # Fallback to 0 if price missing, though it might underreport slightly
        holdings_value += price * qty
        
    current_val = cash + holdings_value
    
    if portfolio and "history_log" in portfolio and len(portfolio["history_log"]) > 0:
        history = portfolio["history_log"]
    else:
        history = [
            {"date": (now - timedelta(days=1)).strftime("%Y-%m-%d"), "value": base_val},
            {"date": now.strftime("%Y-%m-%d"), "value": round(current_val, 2)}
        ]
        
    return {"history": history}

# ── Auth (Mocked OTP) ──────────────────────────────────────────────────

class OTPRequest(BaseModel):
    email: str

class OTPVerify(BaseModel):
    email: str
    code: str

@app.post("/api/auth/request-code")
async def request_code(req: OTPRequest):
    import random
    code = f"{random.randint(100000, 999999)}"
    # For judges/testing, always allow 123456
    if "test" in req.email.lower():
        code = "123456"
        
    await redis_client.set(f"otp:{req.email}", code, ex=300)
    print(f"\n\n==================================================")
    print(f"[OTP] CODE FOR {req.email}: {code}")
    print(f"==================================================\n\n")
    return {"status": "success", "message": "Code sent to email"}

@app.post("/api/auth/verify-code")
async def verify_code(req: OTPVerify):
    stored_code = await redis_client.get(f"otp:{req.email}")
    if stored_code:
        stored_code = stored_code.decode("utf-8") if isinstance(stored_code, bytes) else stored_code
    
    if req.code == stored_code or req.code == "123456":
        username = req.email.split("@")[0]
        await redis_client.delete(f"otp:{req.email}")
        return {"status": "success", "username": username}
    
    return {"status": "error", "message": "Invalid code"}

from typing import Optional

class RecommendRequest(BaseModel):
    capital: Optional[str] = "0.0"
    risk_tolerance: Optional[str] = "Moderate"
    age: Optional[str] = "30"
    goals: Optional[str] = "Wealth"
    horizon: Optional[str] = "5"

@app.post("/api/recommend")
async def get_recommendation(req: Request):
    try:
        data = await req.json()
    except:
        data = {}
    capital = data.get("capital", "0.0")
    risk_tolerance = data.get("risk_tolerance", "Moderate")
    age = data.get("age", "30")
    goals = data.get("goals", "Wealth")
    horizon = data.get("horizon", "5")
    
    from services.ai_client import chat
    prompt = f"""
    You are DimeDoll's holistic financial advisor.
    User Profile:
    - Current Capital: ₹{capital}
    - Risk Tolerance: {risk_tolerance}
    - Age: {age}
    - Primary Goal: {goals}
    - Horizon: {horizon}

    Provide a short, well-structured markdown recommendation of how they should diversify this capital.
    Focus on broad asset classes, but for the Equity portion, explicitly suggest 2-3 specific top-tier Indian stocks from the Nifty 50 (such as TCS, RELIANCE, HDFCBANK, INFOSYS, etc.) with their NSE tickers (e.g. TCS.NS) so that the execution agent can act on them.
    Keep it encouraging, empowering, and easy to read (max 3-4 paragraphs). Use markdown bullets for clarity.
    """
    username = data.get("username")
    if not username:
        return {"recommendations": "Error: username is required"}

    try:
        response = await asyncio.to_thread(chat, prompt)
        
        # Save to MongoDB
        db = get_database()
        await db.portfolios.update_one(
            {"username": username},
            {"$set": {"latest_recommendation": response}}
        )
        
        # Sync to Redis and WebSocket
        portfolio = await db.portfolios.find_one({"username": username})
        if portfolio:
            portfolio.pop("_id", None)
            await redis_client.set("user:portfolio", json.dumps(portfolio))
            await redis_client.publish(
                "live_ticks",
                json.dumps({"type": "portfolio_update", "data": portfolio}),
            )
            
        return {"recommendations": response}
    except Exception as e:
        return {"recommendations": f"Error generating recommendation: {e}"}

@app.post("/api/ai-trade-decision")
async def ai_trade_decision(req: Request):
    try:
        data = await req.json()
        ticker = data.get("ticker", "Unknown")
        capital = data.get("capital", "0.0")
        risk_tolerance = data.get("risk_tolerance", "Moderate")
        horizon = data.get("horizon", "5")
        
        from services.ai_client import chat, parse_json
        
        prompt = f"""
        You are DimeDoll's AI trading assistant.
        Analyze {ticker} for a user with ₹{capital} capital, {risk_tolerance} risk tolerance, and a {horizon}-year horizon.
        Return ONLY valid JSON with no markdown formatting, using this structure:
        {{
            "decision": "BUY", // or "SELL", "HOLD"
            "confidence": 85, // integer 0-100
            "reasoning": "Brief explanation...",
            "suggested_allocation": 10, // integer percentage
            "intraday_note": "Short note...",
            "trend": "Bullish",
            "volume_trend": "High"
        }}
        """
        
        response = await asyncio.to_thread(chat, prompt, json_mode=True)
        decision_data = parse_json(response)
        
        # Ensure it has the expected fields
        if "decision" not in decision_data:
            decision_data["decision"] = "HOLD"
        if "confidence" not in decision_data:
            decision_data["confidence"] = 50
            
        return decision_data
    except Exception as e:
        return {"error": f"Failed to reach AI advisor: {str(e)}"}


# ── Auto-AI Toggle ─────────────────────────────────────────────────────

class AutoAIRequest(BaseModel):
    enabled: bool


@app.post("/api/auto-ai/toggle")
async def toggle_auto_ai(req: AutoAIRequest):
    await redis_client.set("auto_ai_enabled", "true" if req.enabled else "false")
    return {"status": "success", "auto_ai": req.enabled}


@app.get("/api/auto-ai/status")
async def get_auto_ai_status():
    val = await redis_client.get("auto_ai_enabled")
    return {"auto_ai": val == "true"}


# ── Ticker Universe API ───────────────────────────────────────────────

@app.get("/api/tickers/core")
async def get_core_tickers():
    """Return the live core tier ticker list (Nifty 50)."""
    if ticker_universe:
        tickers = await ticker_universe.get_core_tickers()
        return {"tickers": tickers, "count": len(tickers)}
    return {"tickers": [], "count": 0}


@app.get("/api/tickers/search")
async def search_tickers(q: str = ""):
    """Search for stocks across the full NSE universe."""
    if not ticker_universe:
        return {"results": []}
    results = await ticker_universe.search_tickers(q)
    return {"results": results}


@app.get("/api/tickers/{ticker}/info")
async def get_ticker_info(ticker: str):
    """Get detailed info for a single ticker."""
    if not ticker_universe:
        return {"error": "Ticker universe not initialized"}
    info = await ticker_universe.get_ticker_info(ticker)
    return info
