#!/usr/bin/env python
"""
Script to add the learning_path_type column to course_buckets table
"""
from app.config.settings import settings
from sqlalchemy import create_engine, text

engine = create_engine(settings.DATABASE_URL)

with engine.connect() as conn:
    try:
        # Check if column exists first
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'course_buckets' AND column_name = 'learning_path_type'
        """))
        if result.fetchone():
            print("Column 'learning_path_type' already exists in course_buckets table")
        else:
            # Add the column
            conn.execute(text("ALTER TABLE course_buckets ADD COLUMN learning_path_type VARCHAR(100) DEFAULT 'career_progression'"))
            conn.commit()
            print("Column 'learning_path_type' added successfully!")
            
            # Create index
            try:
                conn.execute(text("CREATE INDEX idx_bucket_learning_path ON course_buckets(learning_path_type)"))
                conn.commit()
                print("Index created successfully!")
            except Exception as e:
                print(f"Index creation failed (may already exist): {e}")
                
    except Exception as e:
        print(f"Error: {e}")
