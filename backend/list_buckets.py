#!/usr/bin/env python
"""List all buckets as JSON"""
import json
from app.config.settings import settings
from sqlalchemy import create_engine, text

engine = create_engine(settings.DATABASE_URL)

with engine.connect() as conn:
    result = conn.execute(text("""
        SELECT id, name, learning_path_type
        FROM course_buckets 
        WHERE is_active = true
        ORDER BY name
    """))
    
    buckets = []
    for row in result.fetchall():
        buckets.append({
            "id": row[0],
            "name": row[1],
            "path_type": row[2] or "career_progression"
        })
    
    # Write to JSON file
    with open("buckets.json", "w") as f:
        json.dump(buckets, f, indent=2)
    
    print(f"Saved {len(buckets)} buckets to buckets.json")
