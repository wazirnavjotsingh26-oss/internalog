from pymongo import MongoClient
import os

client = None
db = None

def init_db(app):
    global client, db
    mongo_uri = os.environ.get("MONGO_URI")
    if not mongo_uri:
        app.logger.error("MONGO_URI not set in .env")
        return
    
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        # Test connection
        client.admin.command('ismaster')
        db = client["Cemetery_algson"]
        app.logger.info("MongoDB connected")
        
        # Create indexes for performance/queries
        collection = db["Cemetery_data"]
        collection.create_index([("state", 1), ("city", 1)])
        collection.create_index("name")
        collection.create_index([("name", 1), ("latitude", 1), ("longitude", 1)], unique=True, sparse=True)
        
    except Exception as e:
        app.logger.error(f"MongoDB connection failed: {e}")
        raise

def get_collection():
    return db["Cemetery_data"]