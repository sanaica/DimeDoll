from motor.motor_asyncio import AsyncIOMotorClient

class Database:
    client: AsyncIOMotorClient = None
    db = None

db = Database()

async def connect_to_mongo():
    db.client = AsyncIOMotorClient("mongodb://localhost:27017")
    db.db = db.client.dimedoll

async def close_mongo_connection():
    if db.client:
        db.client.close()

def get_database():
    return db.db
