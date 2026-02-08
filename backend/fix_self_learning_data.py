#!/usr/bin/env python
"""
Script to fix Self Learning data in the database.
Updates BOTH buckets AND content items to have correct learning_path_type.
"""
from app.config.settings import settings
from sqlalchemy import create_engine, text

engine = create_engine(settings.DATABASE_URL)

print("=" * 60)
print("FIXING SELF LEARNING DATA")
print("=" * 60)

with engine.connect() as conn:
    # Step 1: Find all buckets that should be "self_learning"
    # These are buckets with name containing "Self Learning" (case insensitive)
    result = conn.execute(text("""
        SELECT id, name, learning_path_type
        FROM course_buckets
        WHERE LOWER(TRIM(name)) LIKE '%self learning%'
           OR LOWER(TRIM(name)) = 'self learning'
    """))

    self_learning_buckets = result.fetchall()
    bucket_ids = [row[0] for row in self_learning_buckets]

    print(f"\nFound {len(self_learning_buckets)} 'Self Learning' buckets:")
    for row in self_learning_buckets:
        print(f"  - {row[0]}: '{row[1]}' (current: {row[2]})")

    if not bucket_ids:
        print("\nNo Self Learning buckets found. Checking by explicit IDs...")
        # Fallback to known IDs
        bucket_ids = [
            "bucket_a395158a",
            "bucket_1785c3f0",
            "bucket_d99863b4",
        ]

    # Step 2: Update buckets to self_learning
    print(f"\n--- Updating {len(bucket_ids)} buckets to 'self_learning' ---")
    for bucket_id in bucket_ids:
        try:
            conn.execute(text("""
                UPDATE course_buckets
                SET learning_path_type = 'self_learning'
                WHERE id = :id
            """), {"id": bucket_id})
            print(f"  [OK] Updated bucket: {bucket_id}")
        except Exception as e:
            print(f"  [FAIL] Failed bucket {bucket_id}: {e}")

    # Step 3: Update ALL content in these buckets to self_learning
    print(f"\n--- Updating content in Self Learning buckets ---")

    # First, let's see how many content items are affected
    placeholders = ", ".join([f":b{i}" for i in range(len(bucket_ids))])
    params = {f"b{i}": bid for i, bid in enumerate(bucket_ids)}

    count_result = conn.execute(text(f"""
        SELECT COUNT(*) FROM content
        WHERE bucket_id IN ({placeholders})
    """), params)
    content_count = count_result.scalar()
    print(f"  Found {content_count} content items in Self Learning buckets")

    # Update content items
    conn.execute(text(f"""
        UPDATE content
        SET learning_path_type = 'self_learning'
        WHERE bucket_id IN ({placeholders})
    """), params)
    print(f"  [OK] Updated {content_count} content items to 'self_learning'")

    # Step 4: Also update content that has bucket name containing "Self Learning"
    print(f"\n--- Updating content by bucket name ---")
    conn.execute(text("""
        UPDATE content
        SET learning_path_type = 'self_learning'
        WHERE LOWER(TRIM(bucket)) LIKE '%self learning%'
    """))
    print("  [OK] Updated content with 'Self Learning' bucket name")

    # Commit all changes
    conn.commit()
    print("\n" + "=" * 60)
    print("ALL CHANGES COMMITTED!")
    print("=" * 60)

    # Step 5: Show final counts
    print("\n--- FINAL DATABASE STATE ---")

    # Bucket counts
    result = conn.execute(text("""
        SELECT learning_path_type, COUNT(*)
        FROM course_buckets
        WHERE is_active = true
        GROUP BY learning_path_type
    """))
    print("\nBuckets by learning_path_type:")
    for row in result.fetchall():
        path_type = row[0] or "NULL"
        print(f"  {path_type}: {row[1]} buckets")

    # Content counts
    result = conn.execute(text("""
        SELECT learning_path_type, COUNT(*)
        FROM content
        GROUP BY learning_path_type
    """))
    print("\nContent by learning_path_type:")
    for row in result.fetchall():
        path_type = row[0] or "NULL"
        print(f"  {path_type}: {row[1]} items")

    # Show Self Learning specific counts
    result = conn.execute(text("""
        SELECT cb.name, COUNT(c.id) as content_count
        FROM course_buckets cb
        LEFT JOIN content c ON c.bucket_id = cb.id
        WHERE cb.learning_path_type = 'self_learning'
        GROUP BY cb.id, cb.name
    """))
    print("\nSelf Learning buckets and their content:")
    for row in result.fetchall():
        print(f"  {row[0]}: {row[1]} items")

print("\n" + "=" * 60)
print("DONE! Restart your backend server to see changes.")
print("=" * 60)
