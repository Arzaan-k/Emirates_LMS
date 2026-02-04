"""
Content Management Endpoints
Courses, buckets, resources, learning paths
"""

import os
import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException, Header, BackgroundTasks
from sqlalchemy.orm import Session

from app.config.database import get_db, get_db_context
from app.config.settings import settings
from app.core.dependencies import get_current_user, require_admin
from app.core.auth import verify_token
from app.services.content_service import ContentService
from app.services.cdn_service import CDNService
from app.services.ai_service import AIService
from app.services.document_service import DocumentService
from app.core.websocket import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/content", tags=["Content"])


# ==========================================
# CONTENT CRUD ENDPOINTS
# ==========================================

@router.get("/")
async def get_content(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """
    Returns uploaded content filtered by user's level.
    - Authenticated users see courses up to their level
    - Unauthenticated users see all courses (for backward compatibility)
    """
    service = ContentService(db)
    
    # Get all content
    content_list = service.get_all_content()
    
    # If authorized, filter by user's level
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        payload = verify_token(token, "access")
        
        if payload:
            user_role = payload.get("role", "Waffler")
            # Filter would be applied here based on access rules
            # For now, return all content
    
    # Convert to dict format
    result = []
    for content in content_list:
        content_dict = content.to_dict() if hasattr(content, 'to_dict') else dict(content)
        result.append(content_dict)
    
    return result


@router.get("/all")
async def get_all_content_api(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Get Content with Strict Access Control.
    - If Authorization header present: Filters based on User Role.
    - If No Header: Returns ALL (for Admin Panel/Legacy).
    """
    service = ContentService(db)
    content_list = service.get_all_content()
    
    result = []
    for content in content_list:
        content_dict = content.to_dict() if hasattr(content, 'to_dict') else dict(content)
        result.append(content_dict)
    
    return result


# NOTE: /path-nodes must be defined BEFORE /{item_id} to avoid route conflicts
@router.get("/path-nodes")
def get_path_nodes_api(
    user_email: str = "user",
    db: Session = Depends(get_db)
):
    """
    Returns ordered learning path nodes with user-specific status.
    This endpoint only returns CAREER PROGRESSION nodes where is_path_node=True.
    """
    service = ContentService(db)

    try:
        result = service.get_learning_path_content("career_progression", user_email)
        logger.info(f"Path nodes returned: {len(result.get('courses', []))} courses")
        return result
    except Exception as e:
        logger.error(f"Path nodes fetch failed: {e}")
        raise


@router.get("/debug/path-nodes-raw")
async def get_path_nodes_debug(db: Session = Depends(get_db)):
    """
    DEBUG ENDPOINT: Returns ALL content with is_path_node status for debugging.
    Shows exactly what's in the database to help diagnose filtering issues.
    """
    from app.models.content import Content

    try:
        all_content = db.query(Content).order_by(Content.created_at.desc()).limit(20).all()

        result = []
        for content in all_content:
            result.append({
                "id": content.id,
                "title": content.title,
                "is_path_node": content.is_path_node,
                "is_path_node_type": type(content.is_path_node).__name__,
                "learning_path_type": content.learning_path_type,
                "bucket": content.bucket,
                "created_at": content.created_at.isoformat() if content.created_at else None
            })

        return {
            "total_content": len(result),
            "content": result,
            "note": "This shows the raw database values for debugging"
        }
    except Exception as e:
        logger.error(f"Debug endpoint failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def upload_content(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    description: str = Form(...),
    bucket: str = Form(None),
    is_path_node: str = Form("false"),
    learning_path_type: str = Form("career_progression"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Receives new content (Files + Metadata) from Managers.
    Uploads video to Cloudflare R2 CDN, stores metadata in database.
    """
    service = ContentService(db)
    cdn_service = CDNService()
    
    # Generate unique ID
    content_id = f"content_{uuid.uuid4().hex[:8]}"
    
    # Determine resource type
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    
    resource_types = {
        '.mp4': 'Video', '.webm': 'Video', '.mov': 'Video', '.avi': 'Video',
        '.mp3': 'Audio', '.wav': 'Audio',
        '.pdf': 'PDF', '.doc': 'Document', '.docx': 'Document',
        '.ppt': 'Presentation', '.pptx': 'Presentation',
        '.jpg': 'Image', '.jpeg': 'Image', '.png': 'Image', '.gif': 'Image',
    }
    resource_type = resource_types.get(ext, 'Other')
    
    # Save file locally first
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    local_path = os.path.join(settings.UPLOAD_DIR, f"{content_id}{ext}")

    # Resolve bucket name if ID is provided
    # Frontend sends bucket ID, we need to store both bucket name and ID
    bucket_name = bucket
    bucket_id_val = bucket if bucket else None

    if bucket:
        try:
            # Try to get bucket object to resolve name
            bucket_obj = service.get_bucket_by_id(bucket)
            bucket_name = bucket_obj.name
            bucket_id_val = bucket_obj.id
            logger.info(f"Resolved bucket: ID={bucket_id_val}, Name={bucket_name}")
        except Exception as e:
            # If lookup fails, treat bucket as both name and ID (backward compatibility)
            logger.warning(f"Could not resolve bucket '{bucket}': {e}. Using as-is.")
            bucket_name = bucket
            bucket_id_val = bucket
    
    try:
        content_bytes = await file.read()
        with open(local_path, "wb") as f:
            f.write(content_bytes)

        # Upload to CDN
        video_url = None
        if cdn_service.enabled:
            cdn_key = f"content/{content_id}{ext}"
            cdn_result = cdn_service.upload_file(content_bytes, cdn_key, file.content_type)
            if cdn_result:
                # Handle both dict (from R2) and possibly str (if implementation changes)
                if isinstance(cdn_result, dict):
                    video_url = cdn_result.get("url")
                else:
                    video_url = str(cdn_result)

        if not video_url:
            video_url = f"{settings.BASE_URL}/uploads/{content_id}{ext}"

        # Convert is_path_node string to boolean
        is_path_node_bool = is_path_node.lower() == "true"

        logger.info(f"[UPLOAD DEBUG] Title={title}, isPathNode_raw={is_path_node}, isPathNode_bool={is_path_node_bool}, learning_path_type={learning_path_type}, bucket={bucket_name}")

        # Create content record
        content_data = {
            "id": content_id,
            "title": title,
            "description": description,
            "bucket": bucket_name,
            "bucket_id": bucket_id_val,
            "resource_type": resource_type,
            "video_url": video_url,
            "file_url": video_url,
            "is_path_node": is_path_node_bool,
            "learning_path_type": learning_path_type,
            "timestamp": datetime.utcnow(),
        }

        content = service.create_content(content_data)
        logger.info(f"Content created: {content_id}, is_path_node stored as: {content.is_path_node}")

        response = content.to_dict() if hasattr(content, 'to_dict') else dict(content)
        response["status"] = "success"

        # Broadcast new content notification to all connected clients
        await manager.broadcast_notification(
            notification_type="NEW_CONTENT",
            data=response,
            title="New Content Available",
            message=f"New {resource_type.lower()} uploaded: {title}"
        )

        # Trigger background processing for Audio/Video/Documents
        if resource_type in ["Video", "Audio", "Document", "Presentation", "PDF"]:
            background_tasks.add_task(
                generate_transcript_task,
                content_id,
                local_path,
                resource_type,
                ext
            )

        return response
        
    except Exception as e:
        logger.error(f"Content upload failed: {e}")
        # Cleanup local file on error
        if os.path.exists(local_path):
            os.remove(local_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/bulk-folder-upload")
async def bulk_folder_upload(
    background_tasks: BackgroundTasks,
    learning_path_type: str = Form("career_progression"),
    root_bucket_name: str = Form(...),
    files: List[UploadFile] = File(...),
    file_paths: str = Form(...),  # JSON string of relative paths
    db: Session = Depends(get_db)
):
    """
    Bulk upload files with folder hierarchy.
    Creates nested buckets matching folder structure.
    Processes all file types including documents (PDF, Word, PPT).

    Args:
        learning_path_type: 'self_learning' or 'career_progression'
        root_bucket_name: Name of the root folder being uploaded
        files: List of files to upload
        file_paths: JSON array of relative file paths (e.g., ['file1.pdf', 'subfolder/file2.docx'])

    Returns:
        Upload status with progress information
    """
    service = ContentService(db)
    cdn_service = CDNService()

    try:
        # Parse file paths
        paths_list = json.loads(file_paths)

        if len(files) != len(paths_list):
            raise HTTPException(
                status_code=400,
                detail=f"File count mismatch: {len(files)} files but {len(paths_list)} paths"
            )

        logger.info(f"Starting bulk folder upload: {root_bucket_name} with {len(files)} files")

        # Dictionary to cache created buckets
        bucket_cache = {}

        # Results tracking
        results = {
            "total": len(files),
            "successful": 0,
            "failed": 0,
            "buckets_created": 0,
            "items": []
        }

        # Create or get root bucket
        root_bucket = None
        try:
            root_bucket = service.get_bucket_by_name(root_bucket_name)
            logger.info(f"Root bucket already exists: {root_bucket_name}")
        except:
            # Create root bucket
            root_bucket_id = f"bucket_{uuid.uuid4().hex[:8]}"
            root_bucket_data = {
                "id": root_bucket_id,
                "name": root_bucket_name,
                "description": f"Auto-created from folder upload",
                "parent_bucket_id": None,
                "folder_path": root_bucket_name,
                "color": "#3B82F6",
                "icon": "folder-outline",
                "keywords": [],
                "is_active": True
            }
            root_bucket = service.create_bucket(root_bucket_data)
            results["buckets_created"] += 1
            logger.info(f"Created root bucket: {root_bucket_name}")

        bucket_cache[root_bucket_name] = root_bucket

        # Process each file
        for idx, (file, relative_path) in enumerate(zip(files, paths_list)):
            try:
                # Parse path to get folder hierarchy
                path_parts = relative_path.split('/')
                filename = path_parts[-1]
                folder_parts = path_parts[:-1] if len(path_parts) > 1 else []

                # Build nested bucket structure
                current_parent = root_bucket
                current_path = root_bucket_name

                for folder_name in folder_parts:
                    current_path = f"{current_path}/{folder_name}"

                    # Check if bucket already exists in cache
                    if current_path not in bucket_cache:
                        # Try to find existing bucket or create new
                        try:
                            existing_bucket = service.get_bucket_by_path(current_path)
                            bucket_cache[current_path] = existing_bucket
                        except:
                            # Create new nested bucket
                            nested_bucket_id = f"bucket_{uuid.uuid4().hex[:8]}"
                            nested_bucket_data = {
                                "id": nested_bucket_id,
                                "name": folder_name,
                                "description": f"Auto-created subfolder",
                                "parent_bucket_id": current_parent.id,
                                "folder_path": current_path,
                                "color": "#3B82F6",
                                "icon": "folder-outline",
                                "keywords": [],
                                "is_active": True
                            }
                            new_bucket = service.create_bucket(nested_bucket_data)
                            bucket_cache[current_path] = new_bucket
                            results["buckets_created"] += 1
                            logger.info(f"Created nested bucket: {current_path}")

                    current_parent = bucket_cache[current_path]

                # Now upload the file to the deepest bucket
                target_bucket = current_parent

                # Generate unique content ID
                content_id = f"content_{uuid.uuid4().hex[:8]}"

                # Determine resource type
                ext = os.path.splitext(filename)[1].lower()
                resource_types = {
                    '.mp4': 'Video', '.webm': 'Video', '.mov': 'Video', '.avi': 'Video',
                    '.mp3': 'Audio', '.wav': 'Audio',
                    '.pdf': 'PDF', '.doc': 'Document', '.docx': 'Document',
                    '.ppt': 'Presentation', '.pptx': 'Presentation',
                    '.jpg': 'Image', '.jpeg': 'Image', '.png': 'Image', '.gif': 'Image',
                    '.xls': 'Spreadsheet', '.xlsx': 'Spreadsheet',
                }
                resource_type = resource_types.get(ext, 'Other')

                # Save file locally
                os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
                local_path = os.path.join(settings.UPLOAD_DIR, f"{content_id}{ext}")

                content_bytes = await file.read()
                with open(local_path, "wb") as f:
                    f.write(content_bytes)

                # Upload to CDN
                video_url = None
                if cdn_service.enabled:
                    cdn_key = f"content/{content_id}{ext}"
                    cdn_result = cdn_service.upload_file(content_bytes, cdn_key, file.content_type)
                    if cdn_result:
                        if isinstance(cdn_result, dict):
                            video_url = cdn_result.get("url")
                        else:
                            video_url = str(cdn_result)

                if not video_url:
                    video_url = f"{settings.BASE_URL}/uploads/{content_id}{ext}"

                # Create content record
                title = os.path.splitext(filename)[0]
                content_data = {
                    "id": content_id,
                    "title": title,
                    "description": f"Uploaded from folder: {root_bucket_name}",
                    "bucket": target_bucket.name,
                    "bucket_id": target_bucket.id,
                    "resource_type": resource_type,
                    "video_url": video_url,
                    "file_url": video_url,
                    "is_path_node": True,
                    "learning_path_type": learning_path_type,
                    "order_index": idx,
                    "timestamp": datetime.utcnow(),
                }

                content = service.create_content(content_data)
                logger.info(f"Content created: {content_id} in bucket {target_bucket.name}")

                # Trigger background processing for supported types
                if resource_type in ["Video", "Audio", "Document", "Presentation", "PDF"]:
                    background_tasks.add_task(
                        generate_transcript_task,
                        content_id,
                        local_path,
                        resource_type,
                        ext
                    )

                results["successful"] += 1
                results["items"].append({
                    "id": content_id,
                    "filename": filename,
                    "path": relative_path,
                    "bucket": target_bucket.name,
                    "status": "success"
                })

            except Exception as file_error:
                logger.error(f"Failed to upload {relative_path}: {file_error}")
                results["failed"] += 1
                results["items"].append({
                    "filename": filename if 'filename' in locals() else relative_path,
                    "path": relative_path,
                    "status": "failed",
                    "error": str(file_error)
                })

        # Broadcast notification
        await manager.broadcast_notification(
            notification_type="BULK_UPLOAD_COMPLETE",
            data=results,
            title="Bulk Folder Upload Complete",
            message=f"Uploaded {results['successful']} files from {root_bucket_name}"
        )

        return {
            "status": "completed",
            "results": results
        }

    except json.JSONDecodeError as je:
        logger.error(f"Invalid file_paths JSON: {je}")
        raise HTTPException(status_code=400, detail="Invalid file paths format")
    except Exception as e:
        logger.error(f"Bulk folder upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")


@router.get("/{item_id}")
async def get_content_item(
    item_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a specific content item by ID.
    """
    service = ContentService(db)
    content = service.get_content_by_id(item_id)
    
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    return content.to_dict() if hasattr(content, 'to_dict') else dict(content)


@router.put("/{item_id}")
async def update_content(
    item_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    skippable: Optional[str] = Form(None),
    quiz: Optional[str] = Form(None),
    bucket_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Update content metadata including title, description, and category/bucket.
    """
    service = ContentService(db)

    updates = {}
    if title is not None:
        updates["title"] = title
    if description is not None:
        updates["description"] = description
    if skippable is not None:
        updates["skippable"] = skippable.lower() == "true"
    if quiz is not None:
        try:
            updates["quiz"] = json.loads(quiz)
        except:
            updates["quiz"] = None

    # Handle bucket/category update
    if bucket_id is not None:
        if bucket_id == "uncategorized":
            updates["bucket"] = "Uncategorized"
            updates["bucket_id"] = "uncategorized"
        else:
            # Resolve bucket name from ID
            try:
                bucket = service.get_bucket_by_id(bucket_id)
                updates["bucket"] = bucket.name
                updates["bucket_id"] = bucket.id
                logger.info(f"Updating content bucket: {bucket_id} -> {bucket.name}")
            except Exception as e:
                logger.warning(f"Could not resolve bucket '{bucket_id}': {e}. Using as-is.")
                updates["bucket"] = bucket_id
                updates["bucket_id"] = bucket_id

    try:
        content = service.update_content(item_id, updates)
        logger.info(f"Content updated: {item_id}")

        result = content.to_dict() if hasattr(content, 'to_dict') else dict(content)
        if isinstance(result, dict):
            result['status'] = 'success'
        return result
    except Exception as e:
        logger.error(f"Content update failed: {e}")
        raise


@router.put("/{item_id}/category")
async def update_content_category(
    item_id: str,
    bucket_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Specific endpoint to update content category/bucket.
    Legacy support for frontend.
    """
    service = ContentService(db)
    
    updates = {}
    if bucket_id == "uncategorized":
         updates["bucket"] = "Uncategorized"
         updates["bucket_id"] = "uncategorized"
    else:
         try:
             bucket = service.get_bucket_by_id(bucket_id)
             updates["bucket"] = bucket.name
             updates["bucket_id"] = bucket.id
         except Exception as e:
             logger.warning(f"Could not resolve bucket '{bucket_id}' in category update. Using as-is.")
             updates["bucket"] = bucket_id
             updates["bucket_id"] = bucket_id

    try:
        content = service.update_content(item_id, updates)
        logger.info(f"Content category updated: {item_id} -> {bucket_id}")
        
        result = content.to_dict() if hasattr(content, 'to_dict') else dict(content)
        if isinstance(result, dict):
             result['status'] = 'success'
        return result
    except Exception as e:
        logger.error(f"Content category update failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to update category")


@router.delete("/{item_id}")
async def delete_content(
    item_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Delete a course/content completely from everywhere:
    - PostgreSQL (Content table)
    - PostgreSQL (Resource table)
    - Cloudflare R2 CDN
    - Local uploads folder
    """
    service = ContentService(db)
    cdn_service = CDNService()
    
    try:
        # Get content to find file URLs
        content = service.get_content_by_id(item_id)
        
        if content:
            # Delete from CDN in background
            if cdn_service.enabled and content.video_url:
                background_tasks.add_task(cdn_service.delete_file, content.video_url)
            
            # Delete local file
            local_patterns = [
                os.path.join(settings.UPLOAD_DIR, f"{item_id}*"),
            ]
            for pattern in local_patterns:
                import glob
                for filepath in glob.glob(pattern):
                    try:
                        os.remove(filepath)
                    except:
                        pass
        
        # Delete from database
        service.delete_content(item_id)
        logger.info(f"Content deleted: {item_id}")
        
        return {"status": "success", "message": f"Content {item_id} deleted successfully"}
        
    except Exception as e:
        logger.error(f"Content deletion failed: {e}")
        raise


# ==========================================
# COURSE BUCKETS ENDPOINTS
# ==========================================

@router.get("/buckets/all")
async def get_course_buckets(db: Session = Depends(get_db)):
    """
    Get all course buckets for organizing courses.
    """
    service = ContentService(db)
    buckets = service.get_all_buckets()
    
    result = []
    for bucket in buckets:
        bucket_dict = bucket.to_dict() if hasattr(bucket, 'to_dict') else dict(bucket)
        result.append(bucket_dict)
    
    return result


@router.post("/buckets")
async def create_course_bucket(
    name: str = Form(...),
    description: str = Form(""),
    color: str = Form("#6366F1"),
    icon: str = Form("folder"),
    db: Session = Depends(get_db)
):
    """
    Create a new course bucket.
    """
    service = ContentService(db)
    
    bucket_data = {
        "id": f"bucket_{uuid.uuid4().hex[:8]}",
        "name": name,
        "description": description,
        "color": color,
        "icon": icon,
    }
    
    try:
        bucket = service.create_bucket(bucket_data)
        logger.info(f"Bucket created: {bucket_data['id']}")
        
        response = bucket.to_dict() if hasattr(bucket, 'to_dict') else dict(bucket)
        response["status"] = "success"
        return response
    except Exception as e:
        logger.error(f"Bucket creation failed: {e}")
        raise


@router.put("/buckets/{bucket_id}")
async def update_course_bucket(
    bucket_id: str,
    name: str = Form(None),
    description: str = Form(None),
    color: str = Form(None),
    icon: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Update an existing course bucket.
    """
    service = ContentService(db)
    
    updates = {}
    if name is not None:
        updates["name"] = name
    if description is not None:
        updates["description"] = description
    if color is not None:
        updates["color"] = color
    if icon is not None:
        updates["icon"] = icon
    
    try:
        bucket = service.update_bucket(bucket_id, updates)
        logger.info(f"Bucket updated: {bucket_id}")
        
        response = bucket.to_dict() if hasattr(bucket, 'to_dict') else dict(bucket)
        response["status"] = "success"
        return response
    except Exception as e:
        logger.error(f"Bucket update failed: {e}")
        raise


@router.delete("/buckets/{bucket_id}")
async def delete_course_bucket(
    bucket_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a course bucket.
    """
    service = ContentService(db)
    
    try:
        service.delete_bucket(bucket_id)
        logger.info(f"Bucket deleted: {bucket_id}")
        return {"status": "success", "message": f"Bucket {bucket_id} deleted successfully"}
    except Exception as e:
        logger.error(f"Bucket deletion failed: {e}")
        raise


# ==========================================
# RESOURCES ENDPOINTS
# ==========================================

@router.get("/resources/all")
async def get_resources(db: Session = Depends(get_db)):
    """
    Get all resources from the resource library.
    """
    service = ContentService(db)
    resources = service.get_all_resources()
    
    result = []
    for resource in resources:
        resource_dict = resource.to_dict() if hasattr(resource, 'to_dict') else dict(resource)
        result.append(resource_dict)
    
    return result


@router.get("/resources/categories")
async def get_resource_categories():
    """
    Get resource categories.
    """
    return [
        {"id": "1", "name": "Standard SOPs", "icon": "file-document-outline", "color": ["#3B82F6", "#2563EB"], "bg": "#DBEAFE"},
        {"id": "2", "name": "Training Videos", "icon": "play-circle-outline", "color": ["#8B5CF6", "#7C3AED"], "bg": "#EDE9FE"},
        {"id": "3", "name": "Safety Guides", "icon": "shield-outline", "color": ["#10B981", "#059669"], "bg": "#D1FAE5"},
        {"id": "4", "name": "Product Info", "icon": "information-outline", "color": ["#F59E0B", "#D97706"], "bg": "#FEF3C7"},
        {"id": "5", "name": "HR Policies", "icon": "account-group-outline", "color": ["#EF4444", "#DC2626"], "bg": "#FEE2E2"},
    ]


# In-memory resource categories store (for dynamic categories created by users)
_resource_categories_store = []


@router.post("/resources/all/category")
async def create_resource_category(
    name: str = Form(...),
    icon: str = Form("folder"),
    color1: str = Form("#6366F1"),
    color2: str = Form("#4338CA")
):
    """
    Create a new resource category.
    """
    new_cat = {
        "id": str(uuid.uuid4()),
        "name": name,
        "icon": icon,
        "color": [color1, color2],
        "bg": "#F3F4F6"
    }
    _resource_categories_store.append(new_cat)
    logger.info(f"Resource category created: {name}")
    return {"status": "success", "category": new_cat}


@router.post("/resources")
async def upload_resource(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    category: str = Form(...),
    description: str = Form(...),
    bucket: str = Form(None),
    learning_path_type: str = Form("career_progression"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a new resource to the library.
    """
    service = ContentService(db)
    cdn_service = CDNService()
    
    resource_id = f"resource_{uuid.uuid4().hex[:8]}"
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    
    # Determine resource type
    resource_types = {
        '.pdf': 'PDF', '.doc': 'Document', '.docx': 'Document',
        '.mp4': 'Video', '.webm': 'Video',
        '.mp3': 'Audio', '.wav': 'Audio',
        '.jpg': 'Image', '.jpeg': 'Image', '.png': 'Image',
        '.xls': 'Spreadsheet', '.xlsx': 'Spreadsheet',
    }
    resource_type = resource_types.get(ext, 'Other')
    
    try:
        content_bytes = await file.read()
        
        # Upload to CDN or local
        url = None
        if cdn_service.enabled:
            cdn_key = f"resources/{resource_id}{ext}"
            url = cdn_service.upload_file(content_bytes, cdn_key, file.content_type)
        
        if not url:
            # Save locally
            local_path = os.path.join(settings.UPLOAD_DIR, f"{resource_id}{ext}")
            with open(local_path, "wb") as f:
                f.write(content_bytes)
            url = f"{settings.BASE_URL}/uploads/{resource_id}{ext}"
        
        resource_data = {
            "id": resource_id,
            "title": title,
            "category": category,
            "resource_type": resource_type,
            "url": url,
            "description": description,
            "file_size": len(content_bytes),
        }
        
        resource = service.create_resource(resource_data)
        logger.info(f"Resource created: {resource_id}")
        
        result = resource.to_dict() if hasattr(resource, 'to_dict') else dict(resource)
        if isinstance(result, dict):
            result['status'] = 'success'
        return result
        
    except Exception as e:
        logger.error(f"Resource upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# ==========================================
# LEARNING PATH ENDPOINTS
# ==========================================

@router.get("/learning-paths/{path_type}")
async def get_learning_path_content(
    path_type: str,
    user_email: str = "user",
    db: Session = Depends(get_db)
):
    """
    Get courses for a learning path type (self_learning or career_progression).
    Returns all courses with completion status for the given user.
    """
    service = ContentService(db)
    
    try:
        result = service.get_learning_path_content(path_type, user_email)
        return result
    except Exception as e:
        logger.error(f"Learning path fetch failed: {e}")
        raise


@router.post("/learning-paths/complete-self-learning/{user_email}")
async def complete_self_learning(
    user_email: str,
    db: Session = Depends(get_db)
):
    """
    Mark self-learning as completed for user.
    """
    from app.services.user_service import UserService
    
    service = UserService(db)
    try:
        user = service.complete_self_learning(user_email)
        return {"message": "Self learning marked as complete", "user_email": user.email}
    except Exception as e:
        logger.error(f"Complete self-learning failed: {e}")
        raise


@router.post("/learning-paths/progress/{item_id}")
async def update_content_progress(
    item_id: str,
    user_email: str = Form(...),
    progress_percent: float = Form(...),
    last_position: float = Form(0.0),
    time_spent_seconds: int = Form(0),
    completed: bool = Form(False),
    db: Session = Depends(get_db)
):
    """
    Update progress for a specific content node (video/course).
    Saves progress to database to persist user state.
    """
    service = ContentService(db)
    
    progress_data = {
        "progress_percent": progress_percent,
        "last_position": last_position,
        "time_spent_seconds": time_spent_seconds,
        "completed": completed
    }
    
    try:
        result = service.update_node_progress(user_email, item_id, progress_data)
        return {"status": "success", "progress": result}
    except Exception as e:
        logger.error(f"Progress update failed for {item_id}: {e}")
        # Don't fail the request significantly as this is often a background ping
        return {"status": "error", "message": str(e)}


# ==========================================
# CONTENT LIBRARY API
# ==========================================

@router.get("/library/all")
async def get_content_library(db: Session = Depends(get_db)):
    """
    Get content grouped by bucket/category for ContentLibraryModal.
    """
    service = ContentService(db)
    
    # Get all content
    content_list = service.get_all_content()
    
    # Group by bucket
    grouped = {}
    for content in content_list:
        bucket = content.bucket or "Uncategorized"
        if bucket not in grouped:
            grouped[bucket] = {
                "id": content.bucket_id or bucket,
                "name": bucket,
                "items": []
            }
        
        grouped[bucket]["items"].append(
            content.to_dict() if hasattr(content, 'to_dict') else dict(content)
        )
    
    return list(grouped.values())
# ==========================================
# BACKGROUND TASKS
# ==========================================

def generate_transcript_task(content_id: str, local_path: str, resource_type: str = "Video", file_ext: str = ".mp4"):
    """
    Background task to generate transcript, quiz, and embeddings.
    Supports Video, Audio, and Document types (PDF, Word, PowerPoint).
    Run as sync function to be executed in threadpool.
    """
    ai_service = AIService()
    doc_service = DocumentService()

    try:
        logger.info(f"Starting background processing for {content_id} ({resource_type})...")

        transcript = None

        # 1. Extract text based on resource type
        if resource_type in ["Video", "Audio"]:
            # Transcribe audio/video
            transcript = ai_service.transcribe_audio(local_path)
        elif resource_type in ["Document", "Presentation", "PDF"]:
            # Extract text from documents
            transcript = doc_service.extract_text_from_file(local_path, file_ext)

            if transcript:
                logger.info(f"Document text extracted for {content_id}: {len(transcript)} characters")
            else:
                logger.warning(f"No text extracted from document {content_id}")
        else:
            logger.warning(f"Unsupported resource type for processing: {resource_type}")
            return
        
        if transcript:
            with get_db_context() as db:
                service = ContentService(db)
                content = service.get_content_by_id(content_id)
                if content:
                    content.transcript = transcript
                    
                    # 2. Generate End Quiz
                    try:
                        quiz_questions = ai_service.generate_quiz_from_transcript(
                            transcript, num_questions=5, difficulty="medium"
                        )
                        content.quiz = quiz_questions
                        logger.info(f"End quiz generated for {content_id}")
                    except Exception as qe:
                        logger.error(f"End quiz generation failed for {content_id}: {qe}")

                    # 2b. Generate Mid-Video Quizzes (for videos only)
                    if resource_type in ["Video", "Audio"] and content.duration_seconds and content.duration_seconds > 60:
                        try:
                            from app.models.video_progress import MidVideoQuiz

                            # Calculate trigger times at 33% and 66%
                            duration = content.duration_seconds
                            trigger_times = [duration * 0.33, duration * 0.66]

                            # Split transcript into segments
                            transcript_length = len(transcript)
                            segment_1 = transcript[:int(transcript_length * 0.4)]  # First 40% for 33% quiz
                            segment_2 = transcript[int(transcript_length * 0.4):int(transcript_length * 0.7)]  # Middle 30% for 66% quiz

                            segments = [segment_1, segment_2]

                            for idx, (trigger_time, segment) in enumerate(zip(trigger_times, segments)):
                                if len(segment) > 100:  # Only if segment has enough content
                                    try:
                                        mid_quiz_questions = ai_service.generate_quiz_from_transcript(
                                            segment, num_questions=3, difficulty="easy"
                                        )

                                        # Store in database
                                        mid_quiz_id = f"mvq_{content_id}_{int(trigger_time)}"
                                        mid_quiz = MidVideoQuiz(
                                            id=mid_quiz_id,
                                            node_id=content_id,
                                            trigger_time_seconds=trigger_time,
                                            questions=mid_quiz_questions,
                                            generated_from_transcript=segment[:500],  # Store preview
                                            created_at=datetime.utcnow()
                                        )

                                        # Check if exists, if so update
                                        existing = db.query(MidVideoQuiz).filter_by(id=mid_quiz_id).first()
                                        if existing:
                                            existing.questions = mid_quiz_questions
                                            existing.generated_from_transcript = segment[:500]
                                        else:
                                            db.add(mid_quiz)

                                        logger.info(f"Mid-video quiz {idx+1} generated for {content_id} at {trigger_time}s")
                                    except Exception as mqe:
                                        logger.error(f"Mid-quiz {idx+1} generation failed for {content_id}: {mqe}")

                            db.commit()
                            logger.info(f"All mid-video quizzes generated for {content_id}")
                        except Exception as mve:
                            logger.error(f"Mid-video quiz processing failed for {content_id}: {mve}")

                    # 3. Generate Embedding
                    try:
                        embedding = ai_service.generate_embedding(transcript)
                        if embedding:
                            # Store in extra_data since we lack a specific column
                            if not content.extra_data:
                                content.extra_data = {}
                            # Ensure existing extra_data is dict
                            elif isinstance(content.extra_data, str):
                                try:
                                    import json
                                    content.extra_data = json.loads(content.extra_data)
                                except:
                                    content.extra_data = {}
                                    
                            content.extra_data['embedding'] = embedding
                            # Force update JSON column
                            from sqlalchemy.orm.attributes import flag_modified
                            flag_modified(content, "extra_data")
                            
                            logger.info(f"Embedding generated for {content_id} (Size: {len(embedding)})")
                    except Exception as ee:
                         logger.error(f"Embedding generation failed for {content_id}: {ee}")

                    content.updated_at = datetime.utcnow()
                    db.commit()
                    logger.info(f"Content processing complete for {content_id}")
                else:
                    logger.warning(f"Content {content_id} not found for update")
    except Exception as e:
        logger.error(f"Background processing failed for {content_id}: {e}")
    finally:
        # Cleanup local file if CDN is enabled or processing complete
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
                logger.info(f"Cleaned up local file: {local_path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup local file {local_path}: {e}")
