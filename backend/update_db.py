
import sys
import os
import logging

# Ensure current directory (backend/) is in path
sys.path.append(os.getcwd())

from app.config.database import engine
from app.models.base import Base
# Import all models to ensure they are registered with Base
from app.models import * 

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def update_db():
    logger.info("Updating database schema...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database schema updated successfully.")
    except Exception as e:
        logger.error(f"Error updating schema: {e}")

if __name__ == "__main__":
    update_db()
