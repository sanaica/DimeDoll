import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from pydantic import BaseModel
import hashlib

from services.yfinance_fetcher import YFinanceFetcher
from database import connect_to_mongo, close_mongo_connection, get_database

class UserProfile(BaseModel):
    age: int
    employment: str
    income: str
    goal: str
    experience: str
    risk_tolerance: str
    auto_invest: bool

class UserAuth(BaseModel):
    username: str
    password: str

class DepositRequest(BaseModel):
    username: str
    amount: float

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DimeDoll Flash Layer API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis client
redis_client = Redis(host="localhost", port=6379, db=0, decode_responses=True)

# State
fetcher = None
active_websockets = set()
# The tickers to track
TICKERS = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"]

@app.on_event("startup")
async def startup_event():
    global redis_client, fetcher
    redis_client = Redis(host="localhost", port=6379, db=0, decode_responses=True)
    await connect_to_mongo()
    
    # Start the background fetcher task
    fetcher = YFinanceFetcher(redis_client, TICKERS)
    asyncio.create_task(fetcher.fetch_and_publish())
    logger.info("Started background fetcher.")

@app.on_event("shutdown")
async def shutdown_event():
    global fetcher
    if fetcher:
        fetcher.stop()
    await redis_client.close()
    await close_mongo_connection()
    logger.info("Shutdown complete.")

@app.websocket("/ws/live-ticks")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    logger.info(f"New websocket connection. Total: {len(active_websockets)}")
    
    # Send initial data from cache immediately
    try:
        initial_data = []
        for t in TICKERS:
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
        # Keep connection alive and listen for redis pub/sub
        # We need to multiplex reading from websocket (to detect disconnect) and reading from redis
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

        # Run both tasks concurrently
        client_task = asyncio.create_task(read_from_client())
        redis_task = asyncio.create_task(read_from_redis())
        
        done, pending = await asyncio.wait(
            [client_task, redis_task], 
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel the other task
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

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/api/auth/signup")
async def signup(user: UserAuth):
    db = get_database()
    existing = await db.users.find_one({"username": user.username})
    if existing:
        return {"status": "error", "message": "Username already exists"}
        
    hashed_pw = hashlib.sha256(user.password.encode()).hexdigest()
    await db.users.insert_one({
        "username": user.username,
        "password": hashed_pw,
        "profile": {}
    })
    
    await db.portfolios.insert_one({
        "username": user.username,
        "cash": 0.0,
        "total_deposited": 0.0,
        "holdings": {}
    })
    return {"status": "success", "username": user.username}

@app.post("/api/auth/login")
async def login(user: UserAuth):
    db = get_database()
    hashed_pw = hashlib.sha256(user.password.encode()).hexdigest()
    
    doc = await db.users.find_one({
        "username": user.username,
        "password": hashed_pw
    })
    if not doc:
        return {"status": "error", "message": "Invalid credentials"}
        
    # Set as active user for the simulated router
    await redis_client.set("active_username", user.username)
    return {"status": "success", "username": user.username}

@app.post("/api/profile")
async def save_profile(profile: UserProfile, username: str = "default_user"):
    db = get_database()
    
    # Simulated AI logic for Risk Tolerance
    score = 0
    if profile.age < 35: score += 2
    elif profile.age < 55: score += 1
    
    if profile.income == "> 15L": score += 2
    elif profile.income == "5L-15L": score += 1
    
    if profile.experience == "Pro": score += 2
    elif profile.experience == "Intermediate": score += 1
    
    if profile.goal == "Short-term Wealth": score += 1
    elif profile.goal == "Retirement": score -= 1
    
    if score >= 5: ai_risk = "Aggressive"
    elif score >= 3: ai_risk = "Moderate"
    else: ai_risk = "Conservative"
        
    profile.risk_tolerance = ai_risk
    profile_dict = profile.model_dump()
    
    await db.users.update_one(
        {"username": username},
        {"$set": {"profile": profile_dict}},
        upsert=True
    )
    # Cache in Redis for execution router
    await redis_client.set("user:profile", json.dumps(profile_dict))
    
    return {"status": "success", "ai_risk": ai_risk}

@app.get("/api/profile")
async def get_profile(username: str = "default_user"):
    db = get_database()
    user = await db.users.find_one({"username": username})
    if user and "profile" in user:
        return user["profile"]
    return {}

@app.get("/api/portfolio")
async def get_portfolio(username: str = "default_user"):
    db = get_database()
    portfolio = await db.portfolios.find_one({"username": username})
    if portfolio:
        portfolio.pop("_id", None)
        # Ensure it's in Redis too
        await redis_client.set("user:portfolio", json.dumps(portfolio))
        return portfolio
        
    default_portfolio = {
        "username": username,
        "cash": 0.0,
        "total_deposited": 0.0,
        "holdings": {}
    }
    await db.portfolios.update_one(
        {"username": username},
        {"$set": default_portfolio},
        upsert=True
    )
    await redis_client.set("user:portfolio", json.dumps(default_portfolio))
    return default_portfolio

@app.post("/api/portfolio/deposit")
async def deposit(req: DepositRequest):
    db = get_database()
    await db.portfolios.update_one(
        {"username": req.username},
        {"$inc": {"cash": req.amount, "total_deposited": req.amount}}
    )
    portfolio = await db.portfolios.find_one({"username": req.username})
    if portfolio:
        portfolio.pop("_id", None)
        await redis_client.set("user:portfolio", json.dumps(portfolio))
        # Broadcast update
        await redis_client.publish("live_ticks", json.dumps({"type": "portfolio_update", "data": portfolio}))
    return {"status": "success"}
