"""
AI Service Endpoints
"""
import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.services.ai_service import AIService
from app.services.content_service import ContentService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI"])

@router.post("/translate")
async def translate_text(
    data: Dict[str, Any] = Body(...),
):
    """
    Translate text using AI.
    """
    text = data.get("text")
    target_lang = data.get("target_language", "Hindi")
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    service = AIService()
    
    try:
        translated = service.translate_text(text, target_lang)
        return {"translated_text": translated}
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        # Return original if fail, for graceful fallback
        return {"translated_text": text}

@router.post("/ask")
async def ask_ai(
    data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Ask AI context-aware questions.
    """
    question = data.get("question")
    course_id = data.get("course_id")
    
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
        
    content_service = ContentService(db)
    ai_service = AIService()
    
    context = ""
    if course_id:
        content = content_service.get_content_by_id(course_id)
        if content:
            context = f"Title: {content.title}\nDescription: {content.description}\n"
    
    try:
        answer = ai_service.answer_question(question, context=context)
        return {"answer": answer}
    except Exception as e:
        logger.error(f"AI Chat failed: {e}")
        return {"answer": "I'm having trouble connecting to my brain right now. Please try again later."}


@router.get("/ask")
async def ask_ai_get(
    question: str = None,
    course_id: str = None,
    db: Session = Depends(get_db)
):
    """
    Ask AI context-aware questions (GET method for compatibility).
    """
    if not question:
        # Return friendly message instead of error when no question provided
        return {"answer": "Please ask me a question about your courses!"}
        
    content_service = ContentService(db)
    ai_service = AIService()
    
    context = ""
    if course_id:
        content = content_service.get_content_by_id(course_id)
        if content:
            context = f"Title: {content.title}\nDescription: {content.description}\n"
    
    try:
        answer = ai_service.answer_question(question, context=context)
        return {"answer": answer}
    except Exception as e:
        logger.error(f"AI Chat failed: {e}")
        return {"answer": "I'm having trouble connecting to my brain right now. Please try again later."}
