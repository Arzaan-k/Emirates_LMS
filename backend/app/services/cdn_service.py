"""
CDN Service
Business logic for Cloudflare R2 CDN storage
"""

import os
import uuid
import logging
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError

from app.config.settings import settings
from app.core.exceptions import ExternalServiceError
from app.core.security import sanitize_filename, get_mime_type

logger = logging.getLogger(__name__)


class CDNService:
    """Service for CDN (Cloudflare R2) operations."""

    def __init__(self):
        self.enabled = settings.cdn_enabled
        self.bucket_name = settings.R2_BUCKET_NAME
        self.public_url = settings.R2_PUBLIC_URL

        if self.enabled:
            self.client = boto3.client(
                's3',
                endpoint_url=f"https://{settings.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com",
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                region_name='auto',
            )
            logger.info("CDN service initialized with Cloudflare R2")
        else:
            self.client = None
            logger.info("CDN service disabled - using local storage")

    def is_enabled(self) -> bool:
        """Check if CDN is enabled."""
        return self.enabled

    def upload_file(
        self,
        file_content: bytes,
        filename: str,
        content_type: Optional[str] = None,
        folder: str = "uploads"
    ) -> Dict[str, Any]:
        """
        Upload file to CDN.

        Args:
            file_content: File content as bytes
            filename: Original filename
            content_type: MIME type
            folder: Folder path in bucket

        Returns:
            Dictionary with URL and metadata
        """
        if not self.enabled:
            # Fall back to local storage
            return self._save_locally(file_content, filename, folder)

        try:
            # Sanitize and generate unique filename
            safe_filename = sanitize_filename(filename)
            unique_filename = f"{uuid.uuid4()}_{safe_filename}"
            key = f"{folder}/{unique_filename}"

            # Determine content type
            if not content_type:
                content_type = get_mime_type(filename)

            # Upload to R2
            self.client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=file_content,
                ContentType=content_type,
            )

            # Generate public URL
            url = f"{self.public_url}/{key}" if self.public_url else key

            logger.info(f"Uploaded to CDN: {key}")

            return {
                "success": True,
                "url": url,
                "key": key,
                "filename": safe_filename,
                "content_type": content_type,
                "size": len(file_content),
                "storage": "cdn",
            }

        except ClientError as e:
            logger.error(f"CDN upload error: {e}")
            # Fall back to local storage
            return self._save_locally(file_content, filename, folder)

    def upload_video(
        self,
        file_content: bytes,
        filename: str,
        content_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload video file to CDN."""
        return self.upload_file(
            file_content,
            filename,
            content_type or "video/mp4",
            folder="videos"
        )

    def upload_thumbnail(
        self,
        file_content: bytes,
        filename: str
    ) -> Dict[str, Any]:
        """Upload thumbnail image to CDN."""
        return self.upload_file(
            file_content,
            filename,
            folder="thumbnails"
        )

    def upload_document(
        self,
        file_content: bytes,
        filename: str,
        content_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload document to CDN."""
        return self.upload_file(
            file_content,
            filename,
            content_type,
            folder="documents"
        )

    def delete_file(self, key: str) -> bool:
        """
        Delete file from CDN.

        Args:
            key: File key in bucket

        Returns:
            True if successful
        """
        if not self.enabled:
            return self._delete_locally(key)

        try:
            self.client.delete_object(
                Bucket=self.bucket_name,
                Key=key
            )
            logger.info(f"Deleted from CDN: {key}")
            return True
        except ClientError as e:
            logger.error(f"CDN delete error: {e}")
            return False

    def get_file_url(self, key: str) -> str:
        """Get public URL for a file."""
        if self.public_url:
            return f"{self.public_url}/{key}"
        return key

    def get_signed_url(
        self,
        key: str,
        expiration: int = 3600
    ) -> str:
        """
        Generate a signed URL for private access.

        Args:
            key: File key
            expiration: URL expiration time in seconds

        Returns:
            Signed URL
        """
        if not self.enabled:
            return self.get_file_url(key)

        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': key
                },
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Signed URL error: {e}")
            return self.get_file_url(key)

    def file_exists(self, key: str) -> bool:
        """Check if file exists in CDN."""
        if not self.enabled:
            local_path = os.path.join(settings.UPLOAD_DIR, key)
            return os.path.exists(local_path)

        try:
            self.client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError:
            return False

    def check_status(self) -> Dict[str, Any]:
        """Check CDN connectivity status."""
        if not self.enabled:
            return {
                "enabled": False,
                "status": "disabled",
                "message": "CDN is disabled, using local storage",
                "local_upload_dir": settings.UPLOAD_DIR,
            }

        try:
            # Try to list bucket (limited to 1 object)
            self.client.list_objects_v2(
                Bucket=self.bucket_name,
                MaxKeys=1
            )

            return {
                "enabled": True,
                "status": "connected",
                "message": "CDN is operational",
                "bucket": self.bucket_name,
                "public_url": self.public_url,
            }
        except ClientError as e:
            return {
                "enabled": True,
                "status": "error",
                "message": f"CDN connection error: {str(e)}",
                "bucket": self.bucket_name,
            }

    # ===========================================
    # LOCAL STORAGE FALLBACK
    # ===========================================

    def _save_locally(
        self,
        file_content: bytes,
        filename: str,
        folder: str
    ) -> Dict[str, Any]:
        """Save file locally as fallback."""
        try:
            safe_filename = sanitize_filename(filename)
            unique_filename = f"{uuid.uuid4()}_{safe_filename}"

            # Create folder if not exists
            folder_path = os.path.join(settings.UPLOAD_DIR, folder)
            os.makedirs(folder_path, exist_ok=True)

            # Save file
            file_path = os.path.join(folder_path, unique_filename)
            with open(file_path, 'wb') as f:
                f.write(file_content)

            # Generate URL (relative path for local)
            url = f"/uploads/{folder}/{unique_filename}"

            logger.info(f"Saved locally: {file_path}")

            return {
                "success": True,
                "url": url,
                "key": f"{folder}/{unique_filename}",
                "filename": safe_filename,
                "content_type": get_mime_type(filename),
                "size": len(file_content),
                "storage": "local",
            }

        except Exception as e:
            logger.error(f"Local save error: {e}")
            raise ExternalServiceError(
                service="Local Storage",
                detail="Failed to save file",
                original_error=str(e)
            )

    def _delete_locally(self, key: str) -> bool:
        """Delete file from local storage."""
        try:
            file_path = os.path.join(settings.UPLOAD_DIR, key)
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Deleted locally: {file_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Local delete error: {e}")
            return False
