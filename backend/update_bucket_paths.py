#!/usr/bin/env python
"""
Script to update specific buckets to "Self Learning" path type
Run this script to see all buckets and update selected ones to self_learning
"""
from app.config.settings import settings
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine(settings.DATABASE_URL)
Session = sessionmaker(bind=engine)

def list_all_buckets():
    """List all buckets with their current learning path type"""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, name, learning_path_type, description 
            FROM course_buckets 
            WHERE is_active = true
            ORDER BY name
        """))
        
        buckets = result.fetchall()
        
        print("\n" + "="*80)
        print("CURRENT BUCKETS")
        print("="*80)
        print(f"{'#':<3} {'ID':<25} {'NAME':<25} {'PATH TYPE':<20}")
        print("-"*80)
        
        for i, row in enumerate(buckets, 1):
            bucket_id = row[0]
            name = row[1] or "N/A"
            path_type = row[2] or "career_progression"
            print(f"{i:<3} {bucket_id:<25} {name:<25} {path_type:<20}")
        
        print("="*80)
        return buckets

def update_buckets_to_self_learning(bucket_ids):
    """Update specified buckets to self_learning path type"""
    with engine.connect() as conn:
        for bucket_id in bucket_ids:
            try:
                conn.execute(text("""
                    UPDATE course_buckets 
                    SET learning_path_type = 'self_learning' 
                    WHERE id = :id
                """), {"id": bucket_id})
                print(f"✓ Updated bucket '{bucket_id}' to self_learning")
            except Exception as e:
                print(f"✗ Failed to update bucket '{bucket_id}': {e}")
        conn.commit()
        print("\nAll updates committed successfully!")

def update_buckets_to_career_progression(bucket_ids):
    """Update specified buckets back to career_progression path type"""
    with engine.connect() as conn:
        for bucket_id in bucket_ids:
            try:
                conn.execute(text("""
                    UPDATE course_buckets 
                    SET learning_path_type = 'career_progression' 
                    WHERE id = :id
                """), {"id": bucket_id})
                print(f"✓ Updated bucket '{bucket_id}' to career_progression")
            except Exception as e:
                print(f"✗ Failed to update bucket '{bucket_id}': {e}")
        conn.commit()
        print("\nAll updates committed successfully!")

def main():
    print("\n" + "="*80)
    print("BUCKET LEARNING PATH UPDATER")
    print("="*80)
    
    while True:
        buckets = list_all_buckets()
        
        print("\nOptions:")
        print("  1. Move bucket(s) to SELF LEARNING")
        print("  2. Move bucket(s) to CAREER PROGRESSION")
        print("  3. Refresh list")
        print("  4. Exit")
        
        choice = input("\nEnter choice (1-4): ").strip()
        
        if choice == "1":
            print("\nEnter bucket ID(s) to move to SELF LEARNING")
            print("(Separate multiple IDs with commas, e.g., bucket_123,bucket_456)")
            ids_input = input("Bucket IDs: ").strip()
            
            if ids_input:
                bucket_ids = [id.strip() for id in ids_input.split(",")]
                update_buckets_to_self_learning(bucket_ids)
                
        elif choice == "2":
            print("\nEnter bucket ID(s) to move to CAREER PROGRESSION")
            print("(Separate multiple IDs with commas)")
            ids_input = input("Bucket IDs: ").strip()
            
            if ids_input:
                bucket_ids = [id.strip() for id in ids_input.split(",")]
                update_buckets_to_career_progression(bucket_ids)
                
        elif choice == "3":
            continue
            
        elif choice == "4":
            print("\nExiting...")
            break
        else:
            print("\nInvalid choice. Please try again.")

if __name__ == "__main__":
    main()
