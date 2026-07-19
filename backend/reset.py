import asyncio
import json
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

async def reset():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.dimedoll
    await db.portfolios.update_many({}, {"$set": {"cash": 0.0, "total_deposited": 0.0, "holdings": {}}})
    redis = Redis()
    await redis.set("user:portfolio", json.dumps({"cash": 0.0, "total_deposited": 0.0, "holdings": {}}))
    await redis.publish("live_ticks", json.dumps({"type": "portfolio_update", "data": {"cash": 0.0, "total_deposited": 0.0, "holdings": {}}}))
    print("Reset successful")
    client.close()

asyncio.run(reset())
