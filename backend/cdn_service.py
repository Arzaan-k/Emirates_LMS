"""
Cloudflare R2 CDN Service for Video Storage
Provides S3-compatible object storage with global CDN edge caching
"""

import os
import logging
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from typing import Optional, Dict, Any

logger = logging.getLogger("CDN_Service")

# ==========================================
# CLOUDFLARE R2 CONFIGURATION
# ==========================================

# R2 Credentials (from .env)
R2_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "lms-videos")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")  # Your custom domain or R2 public URL

# R2 Endpoint
R2_ENDPOINT = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else ""

# CDN Mode - if False, falls back to local storage
CDN_ENABLED = bool(R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ACCOUNT_ID)

def get_r2_client():
    """Get Cloudflare R2 client (S3-compatible)."""
    if not CDN_ENABLED:
        return None
    
    try:
        client = boto3.client(
            's3',
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(
                signature_version='s3v4',
                s3={'addressing_style': 'path'}
            ),
            region_name='auto'  # R2 uses 'auto' region
        )
        return client
    except Exception as e:
        logger.error(f"Failed to create R2 client: {e}")
        return None


def upload_to_cdn(file_path: str, object_key: str, content_type: str = "video/mp4") -> Optional[str]:
    """
    Upload a file to Cloudflare R2 CDN.
    
    Args:
        file_path: Local path to the file
        object_key: Key (path) for the object in the bucket
        content_type: MIME type of the file
    
    Returns:
        CDN URL if successful, None otherwise
    """
    if not CDN_ENABLED:
        logger.warning("CDN is not enabled. Using local storage.")
        return None
    
    client = get_r2_client()
    if not client:
        return None
    
    try:
        # Upload file
        with open(file_path, 'rb') as f:
            client.upload_fileobj(
                f,
                R2_BUCKET_NAME,
                object_key,
                ExtraArgs={
                    'ContentType': content_type,
                    'CacheControl': 'public, max-age=31536000',  # Cache for 1 year
                }
            )
        
        # Generate CDN URL
        if R2_PUBLIC_URL:
            cdn_url = f"{R2_PUBLIC_URL.rstrip('/')}/{object_key}"
        else:
            # Use R2 public access URL if configured
            cdn_url = f"https://{R2_BUCKET_NAME}.{R2_ACCOUNT_ID}.r2.dev/{object_key}"
        
        logger.info(f"Uploaded to CDN: {cdn_url}")
        return cdn_url
        
    except ClientError as e:
        logger.error(f"Failed to upload to R2: {e}")
        return None
    except Exception as e:
        logger.error(f"CDN upload error: {e}")
        return None


def upload_bytes_to_cdn(file_bytes: bytes, object_key: str, content_type: str = "video/mp4") -> Optional[str]:
    """
    Upload bytes directly to Cloudflare R2 CDN.
    
    Args:
        file_bytes: File content as bytes
        object_key: Key (path) for the object in the bucket
        content_type: MIME type of the file
    
    Returns:
        CDN URL if successful, None otherwise
    """
    if not CDN_ENABLED:
        return None
    
    client = get_r2_client()
    if not client:
        return None
    
    try:
        import io
        file_obj = io.BytesIO(file_bytes)
        
        client.upload_fileobj(
            file_obj,
            R2_BUCKET_NAME,
            object_key,
            ExtraArgs={
                'ContentType': content_type,
                'CacheControl': 'public, max-age=31536000',
            }
        )
        
        if R2_PUBLIC_URL:
            cdn_url = f"{R2_PUBLIC_URL.rstrip('/')}/{object_key}"
        else:
            cdn_url = f"https://{R2_BUCKET_NAME}.{R2_ACCOUNT_ID}.r2.dev/{object_key}"
        
        logger.info(f"Uploaded bytes to CDN: {cdn_url}")
        return cdn_url
        
    except Exception as e:
        logger.error(f"CDN bytes upload error: {e}")
        return None


def delete_from_cdn(object_key: str) -> bool:
    """
    Delete a file from Cloudflare R2 CDN.
    
    Args:
        object_key: Key (path) of the object to delete
    
    Returns:
        True if successful, False otherwise
    """
    if not CDN_ENABLED:
        return False
    
    client = get_r2_client()
    if not client:
        return False
    
    try:
        client.delete_object(
            Bucket=R2_BUCKET_NAME,
            Key=object_key
        )
        logger.info(f"Deleted from CDN: {object_key}")
        return True
    except Exception as e:
        logger.error(f"CDN delete error: {e}")
        return False


def get_cdn_url(object_key: str) -> str:
    """
    Get the CDN URL for an existing object.
    
    Args:
        object_key: Key (path) of the object
    
    Returns:
        CDN URL string
    """
    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL.rstrip('/')}/{object_key}"
    elif R2_ACCOUNT_ID and R2_BUCKET_NAME:
        return f"https://{R2_BUCKET_NAME}.{R2_ACCOUNT_ID}.r2.dev/{object_key}"
    else:
        return ""


def check_cdn_status() -> Dict[str, Any]:
    """
    Check CDN configuration and connectivity status.
    
    Returns:
        Dict with status information
    """
    status = {
        "enabled": CDN_ENABLED,
        "configured": bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID),
        "bucket": R2_BUCKET_NAME,
        "public_url": R2_PUBLIC_URL or "Not configured",
        "connected": False,
        "error": None
    }
    
    if not CDN_ENABLED:
        status["error"] = "CDN credentials not configured in .env"
        return status
    
    client = get_r2_client()
    if not client:
        status["error"] = "Failed to create R2 client"
        return status
    
    try:
        # Test connection by listing bucket
        client.head_bucket(Bucket=R2_BUCKET_NAME)
        status["connected"] = True
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        if error_code == '404':
            status["error"] = f"Bucket '{R2_BUCKET_NAME}' not found"
        elif error_code == '403':
            status["error"] = "Access denied - check credentials"
        else:
            status["error"] = f"Connection failed: {error_code}"
    except Exception as e:
        status["error"] = str(e)
    
    return status


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_content_type(filename: str) -> str:
    """Get MIME content type from filename."""
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    content_types = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
    }
    return content_types.get(ext, 'application/octet-stream')
