"""
AI Service Endpoints
"""
import logging
import os
import json
import uuid
import shutil
import numpy as np
from typing import Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Body, Form, UploadFile, File, Request
from sqlalchemy.orm import Session
from groq import Groq

from app.config.database import get_db
from app.config.settings import settings
from app.services.ai_service import AIService
from app.services.content_service import ContentService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI"])


# ===========================================
# RAG SYSTEM (Lazy-loaded for memory efficiency)
# ===========================================
_rag_model = None
_rag_index = None
rag_metadata: List[Dict] = []


def get_rag_model():
    """Lazy-load the RAG embedding model"""
    global _rag_model
    if _rag_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _rag_model = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("RAG model loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load RAG model: {e}")
    return _rag_model


def get_rag_index():
    """Lazy-load the FAISS index"""
    global _rag_index
    if _rag_index is None:
        try:
            import faiss
            _rag_index = faiss.IndexFlatL2(384)  # 384 dims for MiniLM
            logger.info("FAISS index created")
        except Exception as e:
            logger.warning(f"Could not create FAISS index: {e}")
    return _rag_index


# ===========================================
# ENDPOINTS
# ===========================================

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
        return {"translated_text": text}


@router.post("/chatbot")
async def ai_chatbot(
    message: str = Form(...),
    history: str = Form("[]"),
    db: Session = Depends(get_db)
):
    """
    Dynamic AI Chatbot that:
    1. Searches through courses and resources (RAG)
    2. Uses Groq to generate contextual responses
    3. Adds disclaimer for answers outside BW LMS context
    """
    try:
        # Parse chat history
        try:
            chat_history = json.loads(history)
        except:
            chat_history = []
        
        # --- RAG SEARCH ---
        relevant_context = []
        is_internal_answer = False
        
        rag_model = get_rag_model()
        rag_index = get_rag_index()
        
        if rag_model is not None and rag_index is not None and rag_index.ntotal > 0:
            query_embedding = rag_model.encode(message)
            distances, indices = rag_index.search(
                np.array([query_embedding]).astype("float32"), 
                k=min(3, rag_index.ntotal)
            )
            
            for idx in indices[0]:
                if idx < len(rag_metadata):
                    relevant_context.append(rag_metadata[idx]["text"])
                    is_internal_answer = True
        
        # --- BUILD KNOWLEDGE BASE ---
        content_service = ContentService(db)
        course_summaries = []
        resource_summaries = []
        
        try:
            courses = content_service.get_all_content(limit=20)
            for course in courses:
                if hasattr(course, 'is_path_node') and course.is_path_node:
                    title = course.title if hasattr(course, 'title') else 'Untitled'
                    desc = (course.description[:100] if hasattr(course, 'description') and course.description else 'No description')
                    course_summaries.append(f"- {title}: {desc}")
        except Exception as e:
            logger.warning(f"Could not fetch courses: {e}")
        
        # --- BUILD PROMPT ---
        system_prompt = """You are BWC AI Assistant, the intelligent helper for Belgian Waffle Co.'s Learning Management System.

YOUR KNOWLEDGE BASE INCLUDES:
1. Training courses and learning paths
2. Standard Operating Procedures (SOPs)
3. Recipes and food preparation guides
4. Equipment handling and safety protocols
5. Customer service standards
6. Store operations (opening, closing, cleaning)

RESPONSE GUIDELINES:
- Be helpful, friendly, and professional
- Use emojis sparingly to keep it engaging (🧇, ✅, 📚)
- Format responses with *bold* for important terms
- Use bullet points for lists
- Keep responses concise but informative
- If the answer is from BW LMS training materials, mention the relevant course/resource
- If answering general questions OUTSIDE the BW LMS scope, add this note at the end:
  "ℹ️ Note: This information is general knowledge and not part of BW LMS training materials."

BELGIAN WAFFLE CO. SPECIFIC INFO:
- Standard baking temp: 180-190°C
- Batter: 5kg Premix + 4L Water + 500g Oil
- Cooking time: 3:30 - 4:00 minutes
- Uniform: BWC Cap, Black T-Shirt, Apron, Non-slip shoes"""

        # Build context section
        context_section = ""
        if relevant_context:
            context_section = f"\n\nRELEVANT TRAINING CONTENT:\n" + "\n".join(relevant_context[:3])
        
        if course_summaries:
            context_section += f"\n\nAVAILABLE COURSES:\n" + "\n".join(course_summaries[:10])
        
        if resource_summaries:
            context_section += f"\n\nAVAILABLE RESOURCES:\n" + "\n".join(resource_summaries[:10])
        
        # Build conversation messages
        messages = [{"role": "system", "content": system_prompt + context_section}]
        
        # Add chat history (last 10 messages)
        for msg in chat_history[-10:]:
            role = "user" if msg.get("sender") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("text", "")})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # --- GROQ API CALL ---
        client = Groq(api_key=settings.GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        )
        
        ai_response = response.choices[0].message.content.strip()
        
        # Determine if answer is from internal sources
        internal_keywords = ["sop", "recipe", "batter", "waffle", "temperature", "iron", 
                           "cleaning", "opening", "closing", "uniform", "training", "course"]
        message_lower = message.lower()
        is_internal_question = any(kw in message_lower for kw in internal_keywords)
        
        return {
            "status": "success",
            "response": ai_response,
            "is_internal": is_internal_answer or is_internal_question,
            "sources_found": len(relevant_context)
        }
        
    except Exception as e:
        logger.error(f"AI Chatbot Error: {e}")
        return {
            "status": "error",
            "response": "I'm having trouble connecting right now. Please try again in a moment. 🔄",
            "error": str(e)
        }


@router.post("/voice_query")
async def ai_voice_query(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Handle voice queries - transcribe and respond"""
    temp_path = f"temp_voice_{uuid.uuid4()}.m4a"
    try:
        # Save temp file
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        
        # Transcribe with Groq Whisper API
        client = Groq(api_key=settings.GROQ_API_KEY)
        with open(temp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=audio_file,
                response_format="text"
            )
        
        os.remove(temp_path)
        
        user_text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()
        
        if not user_text:
            return {"status": "error", "error": "Could not understand audio"}
        
        # Get AI response using chatbot endpoint logic
        # Search RAG (with lazy-loaded models)
        relevant_context = []
        rag_model = get_rag_model()
        rag_index = get_rag_index()
        
        if rag_model is not None and rag_index is not None and rag_index.ntotal > 0:
            query_embedding = rag_model.encode(user_text)
            distances, indices = rag_index.search(
                np.array([query_embedding]).astype("float32"), 
                k=min(3, rag_index.ntotal)
            )
            for idx in indices[0]:
                if idx < len(rag_metadata):
                    relevant_context.append(rag_metadata[idx]["text"])
        
        context_text = "\n".join(relevant_context) if relevant_context else ""
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": f"You are BWC AI Assistant for Belgian Waffle Co. Be concise and helpful. Context: {context_text}"},
                {"role": "user", "content": user_text}
            ],
            temperature=0.7,
            max_tokens=500
        )
        
        ai_response = response.choices[0].message.content.strip()
        
        return {
            "status": "success",
            "user_text": user_text,
            "ai_response": ai_response
        }
        
    except Exception as e:
        logger.error(f"Voice Query Error: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return {"status": "error", "error": str(e)}


@router.get("/suggested-questions")
async def get_suggested_questions(db: Session = Depends(get_db)):
    """Get dynamic suggested questions based on available courses"""
    suggestions = [
        "What is the standard waffle baking temperature?",
        "Explain the opening checklist",
        "How do I prepare the batter?",
        "What are the cleaning protocols?",
    ]
    
    # Add course-specific suggestions
    try:
        content_service = ContentService(db)
        courses = content_service.get_all_content(limit=3)
        for course in courses:
            if hasattr(course, 'is_path_node') and course.is_path_node:
                suggestions.append(f"Tell me about {course.title}")
    except Exception as e:
        logger.warning(f"Could not fetch courses for suggestions: {e}")
    
    return {"suggestions": suggestions[:8]}


# ===========================================
# LEGACY ENDPOINTS (for backward compatibility)
# ===========================================

@router.post("/ask")
async def ask_ai(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Ask AI context-aware questions about a specific course.
    Accepts both JSON body (from new UI) and Form data (legacy).
    Robustly handles both content types manually.
    """
    data = {}
    try:
        # Parse based on content type
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)
            
    except Exception as e:
        logger.warning(f"Could not parse request body in ask_ai: {e}")

    # Extract fields with fallbacks
    course_id = data.get("course_id")
    user_question = data.get("question") or data.get("message")
    
    if not user_question:
        raise HTTPException(status_code=400, detail="Message or question is required")
        
    content_service = ContentService(db)
    ai_service = AIService()
    
    # Build context from course data including transcript
    context = ""
    course_title = "Unknown Course"
    if course_id:
        content = content_service.get_content_by_id(course_id)
        if content:
            course_title = content.title if hasattr(content, 'title') else "Course"
            context = f"Course Title: {content.title}\n"
            if hasattr(content, 'description') and content.description:
                context += f"Description: {content.description}\n"
            # Include transcript for context-aware answers
            if hasattr(content, 'transcript') and content.transcript:
                context += f"\nTranscript:\n{content.transcript[:4000]}\n"
    
    try:
        # Use BWC-specific system prompt for course Q&A
        client = Groq(api_key=settings.GROQ_API_KEY)
        
        system_prompt = f"""You are BWC AI Assistant, helping a learner with questions about the course: "{course_title}".

IMPORTANT GUIDELINES:
- Answer based on the provided course content and transcript
- Be concise, helpful, and accurate
- If the answer isn't in the course content, say so and provide general guidance
- Use bullet points for lists
- Use emojis sparingly (🧇, ✅, 📚) to keep it engaging
- Format important terms in bold using *term*

BELGIAN WAFFLE CO. CONTEXT:
- Standard baking temp: 180-190°C
- Batter: 5kg Premix + 4L Water + 500g Oil
- Cooking time: 3:30 - 4:00 minutes"""

        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        if context:
            messages.append({"role": "user", "content": f"Course Context:\n{context}\n\nQuestion: {user_question}"})
        else:
            messages.append({"role": "user", "content": user_question})
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=800
        )
        
        answer = response.choices[0].message.content.strip()
        
        # Return in the format frontend expects (answer field)
        return {
            "answer": answer,
            "status": "success",
            "is_internal": True,
            "sources_found": 1 if context else 0
        }
    except Exception as e:
        logger.error(f"AI Chat failed: {e}")
        return {
            "answer": "I'm having trouble connecting right now. Please try again in a moment. 🔄",
            "status": "error"
        }


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