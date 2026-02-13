
import sys
import os

# Add the current directory to the python path so we can import app modules
# sys.path.append(os.getcwd())
# backend should be in python path if we run from backend
if 'backend' in os.getcwd():
    sys.path.append(os.getcwd())
elif 'BWC' in os.getcwd():
    sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.config.database import SessionLocal
from app.services.content_service import ContentService
from app.models.content import CourseBucket

def check_buckets():
    db = SessionLocal()
    try:
        service = ContentService(db)
        
        # We need to query directly to bypass any service logic if needed, but repository is fine
        buckets = db.query(CourseBucket).all()
        
        print(f"Total buckets in DB: {len(buckets)}")
        
        counts = {}
        for b in buckets:
            print(f"ID: {b.id}, Name: '{b.name}', Active: {b.is_active}, InternalOrder: {b.order_index}")
            counts[b.name] = counts.get(b.name, 0) + 1
            
        print("\nDuplicate Bucket Names:")
        for name, count in counts.items():
            if count > 1:
                print(f" - '{name}': found {count} times")
                # Show IDs for duplicates
                dups = [b.id for b in buckets if b.name == name]
                print(f"   IDs: {dups}")
                
        # Also check the specific IDs again just to be 100% sure
        log_ids = [
            "bucket_7cbc64eb", "bucket_4ec05299", "bucket_ee056b5f", 
            "bucket_34f19eeb", "bucket_da1a2ec5"
        ]
        
        print("\nStatus of target IDs:")
        for bid in log_ids:
            exists = any(b.id == bid for b in buckets)
            print(f"{bid}: {'EXISTS' if exists else 'DELETED'}")

    finally:
        db.close()

if __name__ == "__main__":
    check_buckets()
