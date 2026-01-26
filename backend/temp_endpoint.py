
@app.get("/content")
async def get_all_content_api(db: Session = Depends(get_db)):
    """
    Get All Content (Video/Documents) from Database.
    This endpoint is used by:
    1. Admin Panel -> Curriculum Hierarchy -> Available Courses
    2. Content Library (initially)
    """
    try:
        # Fetch from database to ensure fresh data
        db_content = db_ops.get_all_content(db)
        
        content_list = []
        for item in db_content:
            content_list.append({
                "id": item.id,
                "title": item.title,
                "description": item.description or "",
                "bucket": item.bucket,
                "video_url": item.video_url or item.file_url or "",
                "file_url": item.video_url or item.file_url or "",
                "audio_url": getattr(item, 'audio_url', None),
                "thumbnail_url": item.thumbnail,  # Use compatible field
                "learning_path_type": item.learning_path_type or "career_progression",
                "isPathNode": item.is_path_node or False,
                "timestamp": item.timestamp.isoformat() if item.timestamp else datetime.now().isoformat(),
                "duration": "30s", # Placeholder if not in DB
                "authorRole": "Store Manager",
                "resource_type": "Store Manager",
                "transcript": item.transcript or "",
                "quiz": item.quiz
            })
            
        return content_list
        
    except Exception as e:
        logger.error(f"Error fetching all content: {e}")
        # Fallback to in-memory content_store if DB fails
        return content_store
