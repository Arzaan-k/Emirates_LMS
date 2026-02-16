"""
Document Converter Service
Strategy: Use CloudConvert ONLY for PPT/DOC files >= 24MB for exact PDF conversion.
Files under 24MB use Google Viewer directly (no conversion needed).
CloudConvert is NOT used for other file types (PDF, XLS, ODP, etc).
"""

import os
import tempfile
import logging
from typing import Optional, Tuple
from dotenv import load_dotenv

# Reload environment variables to pick up any changes
load_dotenv(override=True)

logger = logging.getLogger(__name__)

# Max file size for Google Viewer (25MB with some buffer)
MAX_PREVIEW_SIZE = 24 * 1024 * 1024  # 24MB to be safe


class DocumentConverterService:
    """
    Service for optimizing office documents for web preview.

    Strategy (PPT/DOC files only):
    1. If file < 24MB: Use Google Viewer directly (no conversion)
    2. If file >= 24MB: Convert to PDF using CloudConvert (fast, exact design)

    Note: CloudConvert is ONLY used for PPT/PPTX/DOC/DOCX files.
    Other formats (PDF, XLS, ODP, etc.) are not converted.
    """

    def __init__(self):
        # Supports all formats via CloudConvert
        self.supported_formats = [
            'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 
            'txt', 'rtf', 'odt', 'ods', 'odp',
            'jpg', 'jpeg', 'png', 'bmp', 'tiff'
        ]

        # Reload env to get latest API key
        load_dotenv(override=True)
        self.api_key = os.getenv("CLOUDCONVERT_API_KEY", "")

        if self.api_key:
            logger.info(f"CloudConvert API configured (key length: {len(self.api_key)})")
        else:
            logger.warning("CloudConvert not configured.")

    def needs_conversion(self, filename: str) -> bool:
        """Check if file might need optimization"""
        ext = filename.lower().split('.')[-1]
        return ext in self.supported_formats

    def _get_file_size_mb(self, file_path: str) -> float:
        """Get file size in MB"""
        return os.path.getsize(file_path) / (1024 * 1024)

    async def convert_with_cloudconvert(self, input_path: str, output_dir: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Convert document to PDF using CloudConvert API.
        Fast and preserves exact design.
        """
        api_key = os.getenv("CLOUDCONVERT_API_KEY", "") or self.api_key

        if not api_key:
            return False, None, "CloudConvert API key not configured"

        import httpx
        import asyncio

        filename = os.path.basename(input_path)
        base_name = os.path.splitext(filename)[0]
        pdf_path = os.path.join(output_dir, f"{base_name}.pdf")

        try:
            file_size_mb = self._get_file_size_mb(input_path)
            logger.info(f"CloudConvert: Converting {filename} ({file_size_mb:.2f} MB) to PDF...")

            # Use longer timeout for large files
            timeout = min(300.0, max(60.0, file_size_mb * 2))  # 2 seconds per MB, min 60s, max 300s

            async with httpx.AsyncClient(timeout=timeout) as client:
                # Create job
                job_response = await client.post(
                    "https://api.cloudconvert.com/v2/jobs",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "tasks": {
                            "upload-file": {"operation": "import/upload"},
                            "convert-to-pdf": {
                                "operation": "convert",
                                "input": ["upload-file"],
                                "output_format": "pdf"
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
                    error_text = job_response.text
                    logger.error(f"CloudConvert job creation failed: {error_text}")
                    return False, None, f"Job creation failed: {error_text}"

                job_data = job_response.json()
                job_id = job_data["data"]["id"]
                logger.info(f"CloudConvert job created: {job_id}")

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
                logger.info(f"Uploading {filename} to CloudConvert...")
                with open(input_path, "rb") as f:
                    file_content = f.read()

                upload_response = await client.post(
                    upload_url,
                    data=upload_params,
                    files={"file": (filename, file_content)},
                    timeout=300.0  # 5 min for upload
                )

                if upload_response.status_code not in [200, 201, 204]:
                    return False, None, f"Upload failed: {upload_response.text}"

                logger.info("Upload complete, waiting for conversion...")

                # Wait for completion (poll every 2 seconds, max 3 minutes)
                for i in range(90):
                    await asyncio.sleep(2)

                    status_response = await client.get(
                        f"https://api.cloudconvert.com/v2/jobs/{job_id}",
                        headers={"Authorization": f"Bearer {api_key}"}
                    )

                    if status_response.status_code != 200:
                        continue

                    status_data = status_response.json()
                    job_status = status_data["data"]["status"]

                    if i % 10 == 0:  # Log every 20 seconds
                        logger.info(f"CloudConvert status: {job_status} ({i*2}s elapsed)")

                    if job_status == "finished":
                        logger.info("Conversion finished!")
                        break
                    elif job_status == "error":
                        error_msg = "CloudConvert conversion failed"
                        for task in status_data["data"]["tasks"]:
                            if task.get("status") == "error":
                                error_msg = task.get("message", error_msg)
                        return False, None, error_msg
                else:
                    return False, None, "Conversion timed out (3 minutes)"

                # Download PDF
                export_task = None
                for task in status_data["data"]["tasks"]:
                    if task["name"] == "export-result" and task["status"] == "finished":
                        export_task = task
                        break

                if not export_task or "result" not in export_task:
                    return False, None, "Export failed"

                download_url = export_task["result"]["files"][0]["url"]
                logger.info("Downloading converted PDF...")

                download_response = await client.get(download_url, timeout=120.0)

                if download_response.status_code != 200:
                    return False, None, "Download failed"

                with open(pdf_path, "wb") as f:
                    f.write(download_response.content)

                pdf_size = self._get_file_size_mb(pdf_path)
                logger.info(f"CloudConvert PDF saved: {pdf_path} ({pdf_size:.2f} MB)")
                return True, pdf_path, None

        except httpx.TimeoutException as e:
            logger.error(f"CloudConvert timeout: {e}")
            return False, None, f"Request timed out: {e}"
        except Exception as e:
            logger.error(f"CloudConvert error: {e}")
            import traceback
            traceback.print_exc()
            return False, None, str(e)

    async def convert_with_convertio(self, input_path: str, output_dir: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Convert document to PDF using ConvertIO API.
        """
        api_key = self.convertio_key
        if not api_key:
            return False, None, "ConvertIO API key not configured"

        import httpx
        import asyncio
        import json

        filename = os.path.basename(input_path)
        base_name = os.path.splitext(filename)[0]
        pdf_path = os.path.join(output_dir, f"{base_name}.pdf")

        try:
            file_size_mb = self._get_file_size_mb(input_path)
            logger.info(f"ConvertIO: Converting {filename} ({file_size_mb:.2f} MB) to PDF...")

            async with httpx.AsyncClient(timeout=300.0) as client:
                # 1. Start Conversion
                start_res = await client.post(
                    "https://api.convertio.co/convert",
                    json={
                        "apikey": api_key,
                        "input": "upload",
                        "file": filename,
                        "outputformat": "pdf"
                    }
                )

                if start_res.status_code != 200:
                    return False, None, f"ConvertIO init failed: {start_res.text}"

                start_data = start_res.json()
                if start_data.get("code") != 200:
                    return False, None, f"ConvertIO error: {start_data.get('status')}"

                upload_url = start_data["data"]["id"] # Actually ID is needed for status, upload URL is likely provided? 
                # Wait, docs say data.url is for PUT. data.id is for status.
                
                conversion_id = start_data["data"]["id"]
                put_url = start_data["data"]["url"]

                logger.info(f"ConvertIO Job ID: {conversion_id}")

                # 2. Upload File
                with open(input_path, "rb") as f:
                    file_content = f.read()
                
                upload_res = await client.put(put_url, content=file_content)
                if upload_res.status_code != 200:
                     return False, None, "ConvertIO upload failed"

                # 3. Poll Status
                for i in range(120): # Wait up to 4 mins
                    await asyncio.sleep(2)
                    status_res = await client.get(f"https://api.convertio.co/convert/{conversion_id}/status")
                    if status_res.status_code != 200: continue
                    
                    status_data = status_res.json()
                    step = status_data["data"]["step"]
                    
                    if i % 10 == 0:
                        logger.info(f"ConvertIO Status: {step} ({status_data['data'].get('percent', 0)}%)")

                    if step == "finish":
                        result_url = status_data["data"]["output"]["url"]
                        download_res = await client.get(result_url)
                        with open(pdf_path, "wb") as f:
                            f.write(download_res.content)
                        
                        return True, pdf_path, None
                    
                    if step == "error":
                         return False, None, f"ConvertIO Failed: {status_data['data'].get('message')}"
                
                return False, None, "ConvertIO timed out"

        except Exception as e:
            logger.error(f"ConvertIO Exception: {e}")
            return False, None, str(e)

    async def convert_to_pdf(
        self,
        input_path: str,
        output_dir: Optional[str] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Optimize document for web preview.

        Strategy:
        1. If file is already <24MB, return None (use Google Viewer directly)
        2. If file >= 24MB, convert to PDF using CloudConvert

        Returns: (success, output_path, message)
        - success=True, output_path=None means file is small enough for direct preview
        - success=True, output_path=<path> means file was converted to PDF
        - success=False means conversion failed
        """
        if not os.path.exists(input_path):
            return False, None, f"File not found: {input_path}"

        filename = os.path.basename(input_path)
        ext = filename.lower().split('.')[-1]

        if ext == 'pdf':
            return True, None, "Already PDF"

        if ext not in self.supported_formats:
            return False, None, f"Unsupported format: {ext}"

        original_size = self._get_file_size_mb(input_path)
        logger.info(f"Processing {filename} ({original_size:.2f} MB)")

        if original_size < 25:
            logger.info(f"File is under 25MB - skipping conversion")
            return True, None, "File small enough"

        # Large file - convert
        logger.info(f"File is {original_size:.2f}MB (>25MB) - converting with CloudConvert...")

        if output_dir is None:
            output_dir = tempfile.mkdtemp()
        os.makedirs(output_dir, exist_ok=True)

        api_key = os.getenv("CLOUDCONVERT_API_KEY", "") or self.api_key

        if not api_key:
            return True, None, "No conversion API configured"

        success, pdf_path, error = await self.convert_with_cloudconvert(input_path, output_dir)

        if success:
            return True, pdf_path, "Converted to PDF"
        else:
            logger.error(f"Conversion failed: {error}")
            return True, None, f"Conversion failed: {error}"

    async def convert_file(
        self,
        file_path: str,
        keep_original: bool = True
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Convert file and optionally clean up original"""
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
    # Always create fresh instance to pick up env changes
    _converter_instance = DocumentConverterService()
    return _converter_instance
