"""
Document Converter Service
Strategy:
1. FIRST: Try to compress PPT/DOCX to <25MB so Google Viewer can preview directly
2. FALLBACK: If compression fails or file still too large, use CloudConvert for PDF conversion

This preserves the original format when possible, only converting when necessary.
"""

import os
import io
import zipfile
import tempfile
import logging
import shutil
from typing import Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

# CloudConvert API Key - only used as fallback
CLOUDCONVERT_API_KEY = os.getenv("CLOUDCONVERT_API_KEY", "")

# Max file size for Google Viewer (25MB with some buffer)
MAX_PREVIEW_SIZE = 24 * 1024 * 1024  # 24MB to be safe


class DocumentConverterService:
    """
    Service for optimizing office documents for web preview.

    Strategy:
    1. Compress images in PPT/DOCX to reduce file size
    2. If compressed file is <25MB, use Google Viewer (preserves original format)
    3. If still >25MB, convert to PDF using CloudConvert (exact design preservation)
    """

    def __init__(self):
        self.supported_formats = ['ppt', 'pptx', 'doc', 'docx', 'odp', 'odt', 'xls', 'xlsx']
        self.compressible_formats = ['pptx', 'docx', 'xlsx']  # Office Open XML formats
        self.api_key = CLOUDCONVERT_API_KEY

        # Check for Pillow (needed for image compression)
        try:
            from PIL import Image
            self.has_pillow = True
            logger.info("Pillow available - image compression enabled")
        except ImportError:
            self.has_pillow = False
            logger.warning("Pillow not installed. Install with: pip install Pillow")

        if self.api_key:
            logger.info("CloudConvert API configured as fallback for large files")
        else:
            logger.info("CloudConvert not configured - large files will use original")

    def needs_conversion(self, filename: str) -> bool:
        """Check if file might need optimization"""
        ext = filename.lower().split('.')[-1]
        return ext in self.supported_formats

    def _get_file_size_mb(self, file_path: str) -> float:
        """Get file size in MB"""
        return os.path.getsize(file_path) / (1024 * 1024)

    async def compress_office_file(self, input_path: str, output_path: str) -> Tuple[bool, str]:
        """
        Compress Office Open XML file (PPTX, DOCX, XLSX) by:
        1. Extracting the ZIP archive
        2. Compressing all images inside
        3. Re-packaging with maximum ZIP compression

        Returns: (success, message)
        """
        if not self.has_pillow:
            return False, "Pillow not installed for image compression"

        from PIL import Image

        ext = input_path.lower().split('.')[-1]
        if ext not in self.compressible_formats:
            return False, f"Cannot compress {ext} format"

        original_size = self._get_file_size_mb(input_path)
        logger.info(f"Compressing {os.path.basename(input_path)} ({original_size:.2f} MB)...")

        try:
            # Create temp directory for extraction
            temp_dir = tempfile.mkdtemp()

            # Extract the Office file (it's a ZIP archive)
            with zipfile.ZipFile(input_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)

            # Find and compress all images
            images_compressed = 0
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_lower = file.lower()
                    if file_lower.endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tiff')):
                        img_path = os.path.join(root, file)
                        try:
                            # Open and compress image
                            with Image.open(img_path) as img:
                                # Get original size
                                orig_img_size = os.path.getsize(img_path)

                                # Convert to RGB if necessary (for JPEG)
                                if img.mode in ('RGBA', 'P'):
                                    # For PNG with transparency, keep as PNG but optimize
                                    if file_lower.endswith('.png'):
                                        img.save(img_path, 'PNG', optimize=True)
                                    else:
                                        img = img.convert('RGB')
                                        img.save(img_path, 'JPEG', quality=70, optimize=True)
                                elif img.mode == 'RGB':
                                    # Resize if very large
                                    max_dim = 1920
                                    if img.width > max_dim or img.height > max_dim:
                                        ratio = min(max_dim / img.width, max_dim / img.height)
                                        new_size = (int(img.width * ratio), int(img.height * ratio))
                                        img = img.resize(new_size, Image.LANCZOS)

                                    if file_lower.endswith('.png'):
                                        img.save(img_path, 'PNG', optimize=True)
                                    else:
                                        img.save(img_path, 'JPEG', quality=70, optimize=True)
                                else:
                                    img.save(img_path, optimize=True)

                                new_img_size = os.path.getsize(img_path)
                                if new_img_size < orig_img_size:
                                    images_compressed += 1
                                    logger.debug(f"  Compressed {file}: {orig_img_size/1024:.1f}KB -> {new_img_size/1024:.1f}KB")

                        except Exception as e:
                            logger.debug(f"Could not compress {file}: {e}")
                            continue

            # Repack with maximum compression
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, temp_dir)
                        zipf.write(file_path, arcname)

            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

            # Check results
            new_size = self._get_file_size_mb(output_path)
            reduction = ((original_size - new_size) / original_size) * 100

            logger.info(f"Compression complete: {original_size:.2f}MB -> {new_size:.2f}MB ({reduction:.1f}% reduction)")
            logger.info(f"Images compressed: {images_compressed}")

            return True, f"Compressed {reduction:.1f}% ({images_compressed} images)"

        except Exception as e:
            logger.error(f"Compression failed: {e}")
            # Cleanup on error
            if 'temp_dir' in locals():
                shutil.rmtree(temp_dir, ignore_errors=True)
            return False, str(e)

    async def convert_with_cloudconvert(self, input_path: str, output_dir: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Convert document to PDF using CloudConvert API (fallback for large files)
        """
        if not self.api_key:
            return False, None, "CloudConvert API key not configured"

        import httpx
        import asyncio

        filename = os.path.basename(input_path)
        base_name = os.path.splitext(filename)[0]
        pdf_path = os.path.join(output_dir, f"{base_name}.pdf")

        try:
            logger.info(f"Converting {filename} to PDF using CloudConvert...")

            async with httpx.AsyncClient(timeout=300.0) as client:
                # Create job
                job_response = await client.post(
                    "https://api.cloudconvert.com/v2/jobs",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "tasks": {
                            "upload-file": {"operation": "import/upload"},
                            "convert-to-pdf": {
                                "operation": "convert",
                                "input": ["upload-file"],
                                "output_format": "pdf",
                                "engine": "office"
                            },
                            "export-result": {
                                "operation": "export/url",
                                "input": ["convert-to-pdf"],
                                "inline": False
                            }
                        }
                    }
                )

                if job_response.status_code != 201:
                    return False, None, f"Job creation failed: {job_response.text}"

                job_data = job_response.json()
                job_id = job_data["data"]["id"]

                # Find upload task
                upload_task = None
                for task in job_data["data"]["tasks"]:
                    if task["name"] == "upload-file":
                        upload_task = task
                        break

                if not upload_task or "result" not in upload_task:
                    return False, None, "Upload task not found"

                upload_url = upload_task["result"]["form"]["url"]
                upload_params = upload_task["result"]["form"]["parameters"]

                # Upload file
                with open(input_path, "rb") as f:
                    file_content = f.read()

                upload_response = await client.post(
                    upload_url,
                    data=upload_params,
                    files={"file": (filename, file_content)}
                )

                if upload_response.status_code not in [200, 201, 204]:
                    return False, None, f"Upload failed: {upload_response.text}"

                # Wait for completion
                for _ in range(60):  # 2 minutes max
                    await asyncio.sleep(2)

                    status_response = await client.get(
                        f"https://api.cloudconvert.com/v2/jobs/{job_id}",
                        headers={"Authorization": f"Bearer {self.api_key}"}
                    )

                    if status_response.status_code != 200:
                        continue

                    status_data = status_response.json()
                    job_status = status_data["data"]["status"]

                    if job_status == "finished":
                        break
                    elif job_status == "error":
                        return False, None, "CloudConvert conversion failed"
                else:
                    return False, None, "Conversion timed out"

                # Download PDF
                export_task = None
                for task in status_data["data"]["tasks"]:
                    if task["name"] == "export-result" and task["status"] == "finished":
                        export_task = task
                        break

                if not export_task or "result" not in export_task:
                    return False, None, "Export failed"

                download_url = export_task["result"]["files"][0]["url"]
                download_response = await client.get(download_url)

                if download_response.status_code != 200:
                    return False, None, "Download failed"

                with open(pdf_path, "wb") as f:
                    f.write(download_response.content)

                logger.info(f"CloudConvert PDF saved: {pdf_path}")
                return True, pdf_path, None

        except Exception as e:
            return False, None, str(e)

    async def convert_to_pdf(
        self,
        input_path: str,
        output_dir: Optional[str] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Optimize document for web preview.

        Strategy:
        1. If file is already <25MB, return original (Google Viewer will work)
        2. Try to compress the file
        3. If compressed file is <25MB, return compressed version
        4. If still >25MB, convert to PDF using CloudConvert

        Returns: (success, output_path, error_or_info)
        """
        if not os.path.exists(input_path):
            return False, None, f"File not found: {input_path}"

        filename = os.path.basename(input_path)
        ext = filename.lower().split('.')[-1]

        if ext == 'pdf':
            return True, input_path, "Already PDF"

        if ext not in self.supported_formats:
            return False, None, f"Unsupported format: {ext}"

        # Create output directory
        if output_dir is None:
            output_dir = tempfile.mkdtemp()
        os.makedirs(output_dir, exist_ok=True)

        original_size = self._get_file_size_mb(input_path)
        logger.info(f"Processing {filename} ({original_size:.2f} MB)")

        # Step 1: Check if already small enough
        if original_size < 24:
            logger.info(f"File is already under 24MB - Google Viewer will work")
            # Return None to indicate no conversion needed - use original
            return True, None, "File small enough for direct preview"

        # Step 2: Try compression for Office Open XML formats
        if ext in self.compressible_formats and self.has_pillow:
            compressed_path = os.path.join(output_dir, filename)

            success, message = await self.compress_office_file(input_path, compressed_path)

            if success:
                compressed_size = self._get_file_size_mb(compressed_path)

                if compressed_size < 24:
                    logger.info(f"Compression successful! {original_size:.2f}MB -> {compressed_size:.2f}MB")
                    return True, compressed_path, f"Compressed to {compressed_size:.2f}MB"
                else:
                    logger.info(f"Compressed file still too large ({compressed_size:.2f}MB)")
                    # Remove compressed file, will try CloudConvert
                    os.remove(compressed_path)
            else:
                logger.warning(f"Compression failed: {message}")

        # Step 3: Fallback to CloudConvert for PDF conversion
        if self.api_key:
            logger.info("File too large for Google Viewer - converting to PDF with CloudConvert")
            success, pdf_path, error = await self.convert_with_cloudconvert(input_path, output_dir)

            if success:
                return True, pdf_path, "Converted to PDF (file was too large)"
            else:
                logger.error(f"CloudConvert failed: {error}")
                return False, None, f"CloudConvert failed: {error}"
        else:
            # No CloudConvert configured, return original and hope for the best
            logger.warning("File too large and CloudConvert not configured - using original")
            return True, None, "File too large for preview, CloudConvert not configured"

    async def convert_file(
        self,
        file_path: str,
        keep_original: bool = True
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Convert/compress file and optionally clean up original"""
        success, output_path, message = await self.convert_to_pdf(file_path)

        if success and not keep_original and output_path and output_path != file_path:
            try:
                os.remove(file_path)
                logger.info(f"Removed original file: {file_path}")
            except Exception as e:
                logger.warning(f"Could not remove original: {e}")

        return success, output_path, message

    def get_pdf_filename(self, original_filename: str) -> str:
        """Get PDF filename from original filename"""
        base_name = os.path.splitext(original_filename)[0]
        return f"{base_name}.pdf"


# Singleton instance
_converter_instance = None


def get_converter() -> DocumentConverterService:
    """Get or create converter service instance"""
    global _converter_instance
    if _converter_instance is None:
        _converter_instance = DocumentConverterService()
    return _converter_instance
