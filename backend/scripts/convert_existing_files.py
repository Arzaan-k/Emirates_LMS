import asyncio
import os
import sys
import logging
import uuid
import shutil
import tempfile
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load env variables
load_dotenv(override=True)

from app.config.database import SessionLocal
from app.models.content import Content
from app.services.document_converter import get_converter
from app.services.cdn_service import CDNService
from app.config.settings import settings
import httpx

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def get_remote_file_size(url: str) -> float:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.head(url)
            size_bytes = int(response.headers.get("content-length", 0))
            return size_bytes / (1024 * 1024)
    except Exception as e:
        logger.warning(f"Could not get size for {url}: {e}")
        return 0.0

async def download_file(url: str, dest_path: str):
    async with httpx.AsyncClient(timeout=300.0) as client:
        async with client.stream("GET", url) as response:
            with open(dest_path, "wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)

async def process_content():
    converter = get_converter()
    cdn = CDNService()

    if not converter.api_key:
        logger.error("CLOUDCONVERT_API_KEY is not set! Please set it in your .env file.")
        return

    # 1. Fetch all content first (Short DB Session)
    # We load minimal data needed to check eligibility to avoid holding DB connection
    logger.info("Fetching content candidates from database...")
    content_candidates = []
    
    try:
        with SessionLocal() as db:
            all_content = db.query(Content).all()
            for c in all_content:
                content_candidates.append({
                    "id": c.id,
                    "title": c.title,
                    "video_url": c.video_url,
                    "file_url": c.file_url,
                    "pdf_url": c.pdf_url
                })
        logger.info(f"Loaded {len(content_candidates)} items to scan.")
    except Exception as e:
        logger.error(f"Failed to fetch content from DB: {e}")
        return

    count_converted = 0
    count_errors = 0

    # 2. Process Candidates
    for item in content_candidates:
        content_id = item["id"]
        title = item["title"]
        original_url = item["video_url"] or item["file_url"]
        
        if not original_url:
            continue
            
        # Check if already converted
        if item["pdf_url"] and item["video_url"] == item["pdf_url"]:
            continue

        # Check extension
        clean_url = original_url.split('?')[0]
        ext = os.path.splitext(clean_url)[1].lower().replace('.', '')
        
        if ext == 'pdf':
            continue

        if ext not in converter.supported_formats:
            continue
            
        # Check Size (Async/Remote)
        size_mb = 0
        is_remote = False

        if original_url.startswith("http") and "localhost" not in original_url:
            is_remote = True
            size_mb = await get_remote_file_size(original_url)
        else:
            # Skip local complexity or implement if needed
            continue

        if size_mb < 25:
            continue

        logger.info(f"Found large file: '{title}' (ID: {content_id}) - {size_mb:.2f} MB. Processing...")

        # 3. Perform Long-Running Conversion (NO DB Connection Active)
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                input_path = os.path.join(temp_dir, f"input.{ext}")
                output_dir = os.path.join(temp_dir, "output")
                os.makedirs(output_dir, exist_ok=True)

                # Download
                logger.info(f"Downloading from {original_url}...")
                await download_file(original_url, input_path)

                # Convert
                success, pdf_path, message = await converter.convert_to_pdf(input_path, output_dir)
                
                if success and pdf_path:
                    logger.info(f"Conversion successful: {pdf_path}")
                    
                    # Upload to CDN
                    pdf_filename = f"{content_id}_optimized.pdf"
                    with open(pdf_path, "rb") as f:
                        upload_res = cdn.upload_file(f, pdf_filename, "application/pdf", folder="content")
                    
                    new_url = ""
                    if isinstance(upload_res, dict):
                        new_url = upload_res.get("url")
                    else:
                        new_url = str(upload_res)
                        
                    if new_url:
                        # 4. Update DB (New Short Session)
                        logger.info(f"Updating database for {content_id}...")
                        try:
                            with SessionLocal() as db_update:
                                content = db_update.query(Content).filter(Content.id == content_id).first()
                                if content:
                                    content.pdf_url = new_url
                                    content.video_url = new_url
                                    content.resource_type = "PDF"
                                    # Update file_url too if it was used
                                    if content.file_url:
                                        content.file_url = new_url
                                        
                                    db_update.add(content)
                                    db_update.commit()
                                    logger.info(f"SUCCESS: Updated {title} to use optimized PDF.")
                                    count_converted += 1
                                else:
                                    logger.error(f"Content {content_id} not found regarding update.")
                        except Exception as e:
                            logger.error(f"DB Update failed for {content_id}: {e}")
                            count_errors += 1
                            continue

                        # 5. Delete Original (After DB success)
                        if "r2.dev" in original_url or (cdn.public_url and cdn.public_url in original_url):
                            orig_filename = os.path.basename(clean_url)
                            orig_key = f"content/{orig_filename}"
                            try:
                                cdn.delete_file(orig_key)
                                logger.info(f"Deleted original file: {orig_key}")
                            except Exception as e:
                                logger.warning(f"Failed to delete original: {e}")
                    else:
                        logger.error("Failed to get URL from CDN upload")
                        count_errors += 1
                else:
                    logger.error(f"Conversion logic failed: {message}")
                    count_errors += 1

        except Exception as e:
            logger.error(f"General error processing {content_id}: {e}")
            count_errors += 1
                
    logger.info(f"Scan complete. Converted: {count_converted}, Errors: {count_errors}")

if __name__ == "__main__":
    asyncio.run(process_content())
