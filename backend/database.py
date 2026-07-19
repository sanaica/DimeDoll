import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))


class Database:
    client: AsyncIOMotorClient = None
    db = None


db = Database()


async def connect_to_mongo():
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGODB_DB", "dimedoll")
    db.client = AsyncIOMotorClient(uri)
    db.db = db.client[db_name]


async def close_mongo_connection():
    if db.client:
        db.client.close()


def get_database():
    return db.db
