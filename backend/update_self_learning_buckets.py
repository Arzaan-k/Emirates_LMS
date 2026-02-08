#!/usr/bin/env python
"""
Script to update Self Learning buckets to self_learning path type
"""
from app.config.settings import settings
from sqlalchemy import create_engine, text

engine = create_engine(settings.DATABASE_URL)

# Buckets to move to "self_learning" path type
# These are the buckets named "Self Learning" that should be under the Self Learning category
buckets_to_update = [
    "bucket_a395158a",  # Self Learning
    "bucket_1785c3f0",  # Self Learning
    "bucket_d99863b4",  # Self Learning (with trailing space)
]

print("Updating buckets to 'self_learning' path type...")
print("-" * 50)

with engine.connect() as conn:
    for bucket_id in buckets_to_update:
        try:
            # First get the bucket name
            result = conn.execute(text("SELECT name FROM course_buckets WHERE id = :id"), {"id": bucket_id})
            row = result.fetchone()
            bucket_name = row[0] if row else "Unknown"
            
            # Update the path type
            conn.execute(text("""
                UPDATE course_buckets 
                SET learning_path_type = 'self_learning' 
                WHERE id = :id
            """), {"id": bucket_id})
            
            print(f"✓ Updated '{bucket_name}' ({bucket_id}) to self_learning")
            
        except Exception as e:
            print(f"✗ Failed to update {bucket_id}: {e}")
    
    conn.commit()
    print("-" * 50)
    print("All updates committed successfully!")
    
    # Show updated counts
    result = conn.execute(text("""
        SELECT learning_path_type, COUNT(*) 
        FROM course_buckets 
        WHERE is_active = true 
        GROUP BY learning_path_type
    """))
    
    print("\nBucket counts by path type:")
    for row in result.fetchall():
        print(f"  {row[0]}: {row[1]} buckets")
