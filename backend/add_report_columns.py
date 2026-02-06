import sys
import os
import logging
from sqlalchemy import text

# Ensure current directory (backend/) is in path
sys.path.append(os.getcwd())

from app.config.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def add_columns():
    logger.info("Adding columns to report_subscriptions table...")
    with engine.connect() as conn:
        try:
            # Transaction 1: day_of_week
            conn.execute(text("ALTER TABLE report_subscriptions ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(20) DEFAULT 'Monday'"))
            # Transaction 2: time_of_day
            conn.execute(text("ALTER TABLE report_subscriptions ADD COLUMN IF NOT EXISTS time_of_day VARCHAR(10) DEFAULT '09:00'"))
            
            conn.commit()
            logger.info("Columns added successfully.")
        except Exception as e:
            logger.error(f"Error adding columns: {e}")
            conn.rollback()

if __name__ == "__main__":
    add_columns()
