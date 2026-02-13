
import sys
import os

# Add the current directory to the python path so we can import app modules
if 'backend' in os.getcwd():
    sys.path.append(os.getcwd())
elif 'BWC' in os.getcwd():
    sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.config.database import SessionLocal
from app.models.content import CourseBucket

def list_buckets():
    db = SessionLocal()
    try:
        buckets = db.query(CourseBucket).all()
        
        with open('bucket_list_output.txt', 'w') as f:
            f.write(f"Total buckets in DB: {len(buckets)}\n")
            f.write("-" * 50 + "\n")
            
            counts = {}
            for b in buckets:
                f.write(f"ID: {b.id}, Name: '{b.name}', Active: {b.is_active}, InternalOrder: {b.order_index}\n")
                counts[b.name] = counts.get(b.name, 0) + 1
                
            f.write("-" * 50 + "\n")
            f.write("Frequency of Bucket Names:\n")
            for name, count in counts.items():
                f.write(f" - '{name}': {count}\n")
                if count > 1:
                    dups = [b.id for b in buckets if b.name == name]
                    f.write(f"   Duplicate IDs: {dups}\n")

    except Exception as e:
        with open('bucket_list_output.txt', 'w') as f:
            f.write(f"Error: {str(e)}")
            
    finally:
        db.close()

if __name__ == "__main__":
    list_buckets()
