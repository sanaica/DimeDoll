from database import get_database, connect_to_mongo
import asyncio
from redis.asyncio import Redis

async def reset():
    await connect_to_mongo()
    db = get_database()
    await db.portfolios.delete_many({})
    await db.ai_predictions.delete_many({})
    
    redis_client = Redis(host="localhost", port=6379, db=0, decode_responses=True)
    await redis_client.delete("user:portfolio")
    await redis_client.close()
    
    print('Database and Redis cache reset.')

asyncio.run(reset())
