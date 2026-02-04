import os
import sys

# Ensure backend directory is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from app.config.database import engine
from sqlalchemy import text

def clean_data():
    print("Cleaning requested data tables...")
    try:
        with engine.connect() as conn:
            # Notifications
            print("Cleaning notifications table...")
            conn.execute(text("DELETE FROM notifications"))
            
            # News Feed
            print("Cleaning news_feed table...")
            conn.execute(text("DELETE FROM news_feed"))
            
            # Live Topic Quizzes
            print("Cleaning live_quizzes table...")
            conn.execute(text("DELETE FROM live_quizzes"))
            
            conn.commit()
            print("✅ All requested data cleaned successfully!")
            
    except Exception as e:
        print(f"❌ Error cleaning data: {e}")

if __name__ == "__main__":
    clean_data()
