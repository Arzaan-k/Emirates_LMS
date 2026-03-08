"""
AI Service Endpoints
"""
import logging
import os
import json
import uuid
import shutil
import numpy as np
import base64
from typing import Dict, Any, List, Optional
import PyPDF2
from docx import Document as DocxDocument
from pptx import Presentation
import pandas as pd
import io

from fastapi import APIRouter, Depends, HTTPException, Body, Form, UploadFile, File, Request
from sqlalchemy.orm import Session
from groq import Groq

from app.config.database import get_db
from app.config.settings import settings
from app.core.dependencies import get_current_user_optional
from app.services.ai_service import AIService
from app.services.content_service import ContentService
from app.services.admin_chatbot_service import AdminChatbotService

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
    3. Adds disclaimer for answers outside Emirates LMS context
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
        system_prompt = """You are Emirates AI Assistant, the intelligent helper for Emirates Airlines' Learning Management System.

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
- If the answer is from Emirates LMS training materials, mention the relevant course/resource
- If answering general questions OUTSIDE the Emirates LMS scope, add this note at the end:
  "ℹ️ Note: This information is general knowledge and not part of Emirates LMS training materials."

Emirates Airlines SPECIFIC INFO:
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
                {"role": "system", "content": f"You are Emirates AI Assistant for Emirates Airlines Be concise and helpful. Context: {context_text}"},
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

@router.post("/generate-quiz")
async def generate_custom_quiz(
    text: Optional[str] = Form(""),
    file: Optional[UploadFile] = File(None),
    num_questions: int = Form(5),
    difficulty: str = Form("medium")
):
    """
    Generate multiple-choice quiz questions from a custom text description or uploaded document.
    Used by admins to manually generate quizzes for videos lacking audio.
    """
    try:
        extracted_text = text or ""
        
        if file:
            content = await file.read()
            filename = file.filename.lower()
            
            if filename.endswith('.pdf'):
                import io
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
                text_chunks = [page.extract_text() for page in pdf_reader.pages if page.extract_text()]
                extracted_text += "\n" + "\n".join(text_chunks)
            elif filename.endswith('.docx') or filename.endswith('.doc'):
                import io
                doc = DocxDocument(io.BytesIO(content))
                text_chunks = [para.text for para in doc.paragraphs if para.text]
                extracted_text += "\n" + "\n".join(text_chunks)
            elif filename.endswith('.pptx') or filename.endswith('.ppt'):
                import io
                prs = Presentation(io.BytesIO(content))
                text_chunks = []
                for slide in prs.slides:
                    for shape in slide.shapes:
                        if hasattr(shape, "text") and shape.text:
                            text_chunks.append(shape.text)
                extracted_text += "\n" + "\n".join(text_chunks)
            elif filename.endswith(('.png', '.jpg', '.jpeg', '.webp')):
                # Use Groq Vision to transcribe the image text natively!
                try:
                    base64_img = base64.b64encode(content).decode('utf-8')
                    fmt = "image/jpeg"
                    if filename.endswith(".png"): fmt = "image/png"
                    elif filename.endswith(".webp"): fmt = "image/webp"
                    
                    client = Groq(api_key=settings.GROQ_API_KEY)
                    vision_res = client.chat.completions.create(
                        model="llama-3.2-11b-vision-preview",
                        messages=[{
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Transcribe all visible strings and textual data explicitly in plain-text from this image without introductory dialogue."},
                                {"type": "image_url", "image_url": {"url": f"data:{fmt};base64,{base64_img}"}}
                            ]
                        }],
                        temperature=0.1,
                        max_tokens=6000
                    )
                    extracted_text += "\n" + vision_res.choices[0].message.content.strip()
                except Exception as ve:
                    logger.error(f"Groq Vision Extraction Error: {ve}")
                    pass
            else:
                # Assume raw text string
                try:
                    extracted_text += "\n" + content.decode('utf-8')
                except:
                    pass

        if not extracted_text.strip():
            return {"status": "error", "error": "No valid text provided or extracted from file."}

        service = AIService()
        questions = await service.generate_quiz_from_text(extracted_text.strip(), num_questions, difficulty)
        return {"status": "success", "questions": questions}
    except Exception as e:
        logger.error(f"Manual Quiz Generation Error: {e}")
        return {"status": "error", "error": str(e)}

@router.post("/parse-bulk-quiz")
async def parse_bulk_quiz(
    file: UploadFile = File(...)
):
    """
    Parse a CSV or Excel file containing raw quiz structured columns.
    Returns JSON array of questions to be loaded into the Quiz Editor UI.
    Requires formats mapping standard Question | Opt1 | Opt2 | Opt3 | Opt4 | AnswerIdx
    """
    try:
        content = await file.read()
        filename = file.filename.lower()
        
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            df = pd.read_excel(io.BytesIO(content))
        else:
            return {"status": "error", "error": "Invalid format, requires .csv or .xlsx"}
            
        questions = []
        for index, row in df.iterrows():
            if pd.isna(row.iloc[0]): continue # skip empty
            try:
                question = str(row.iloc[0]).strip()
                opts = [
                    str(row.iloc[1]).strip(),
                    str(row.iloc[2]).strip(),
                    str(row.iloc[3]).strip(),
                    str(row.iloc[4]).strip()
                ]
                ans_idx = int(row.iloc[5]) - 1
                
                if 0 <= ans_idx < len(opts):
                    questions.append({
                        "question": question,
                        "options": opts,
                        "answer": opts[ans_idx]
                    })
            except Exception as e:
                logger.warning(f"Error parsing row {index}: {e}")
                
        return {"status": "success", "questions": questions}

    except Exception as e:
        logger.error(f"Bulk Parse Quiz Error: {e}")
        return {"status": "error", "error": str(e)}


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
        
        system_prompt = f"""You are Emirates AI Assistant, helping a learner with questions about the course: "{course_title}".

IMPORTANT GUIDELINES:
- Answer based on the provided course content and transcript
- Be concise, helpful, and accurate
- If the answer isn't in the course content, say so and provide general guidance
- Use bullet points for lists
- Use emojis sparingly (🧇, ✅, 📚) to keep it engaging
- Format important terms in bold using *term*

Emirates Airlines CONTEXT:
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


# ===========================================
# ADMIN COPILOT - PRIVILEGE-AWARE AI ASSISTANT
# ===========================================

# Privilege to data access mapping
PRIVILEGE_DATA_ACCESS = {
    "team_list": ["users", "employees", "team_members"],
    "reports": ["analytics", "performance_reports", "completion_stats"],
    "assign_quiz": ["quizzes", "quiz_assignments"],
    "audits": ["audit_logs", "system_activity"],
    "upload_training": ["content", "training_materials", "courses"],
    "bulk_upload": ["bulk_operations", "import_history"],
    "post_news": ["news", "announcements"],
    "post_quiz": ["quizzes", "quiz_creation"],
    "create_user": ["users", "user_management"],
    "live_tracking": ["location", "live_tracking", "employee_locations"],
    "proctored_assessment": ["assessments", "proctored_exams"],
    "proctored_create_manage": ["assessments", "exam_management"],
    "proctored_view_results": ["assessment_results", "exam_scores"],
    "view_analytics": ["analytics", "dashboards", "metrics", "performance"],
    "send_notification": ["notifications", "announcements"],
    "access_control": ["privileges", "access_rules", "permissions"],
    "manage_buckets": ["buckets", "course_categories", "content_organization"],
    "schedule_meeting": ["meetings", "scheduled_meetings"],
    "crm_tickets": ["crm", "tickets", "leads", "customer_data"],
    "manage_simulations": ["simulations", "interactive_training"],
    "manage_learning_path": ["learning_paths", "career_progression"],
    "scheduled_exams": ["scheduled_exams", "exam_calendar"],
    "exam_reports": ["exam_reports", "assessment_analytics"],
    "support_library": ["support_tickets", "help_requests"],
    "view_audit_logs": ["audit_logs", "system_logs"],
}


def _fetch_privilege_based_data(db: Session, privileges: List[str], is_superadmin: bool) -> Dict[str, Any]:
    """
    Fetch data from database based on admin's privileges.
    Returns a dictionary with accessible data summaries.
    """
    from app.services.user_service import UserService
    from app.services.quiz_service import QuizService
    from app.repositories.analytics_repository import AnalyticsRepository
    from app.repositories.crm_repository import CRMRepository
    from app.models.content import Content
    from app.models.notification import Notification
    from app.models.simulation import Simulation
    from app.models.assessment import ScheduledExam
    
    data_context = {}
    
    try:
        # If superadmin, grant access to everything
        if is_superadmin:
            privileges = list(PRIVILEGE_DATA_ACCESS.keys())
        
        # TEAM LIST / USERS - fetch user summary with training stats
        if "team_list" in privileges or "create_user" in privileges or is_superadmin:
            try:
                from app.models.tracking import CourseCompletion
                from app.models.video_progress import VideoProgress
                
                user_service = UserService(db)
                users = user_service.get_all_users(limit=200)
                user_summary = []
                role_counts = {}
                store_counts = {}
                category_counts = {}
                
                for user in users:
                    role = getattr(user, 'role', 'Unknown')
                    store = getattr(user, 'store', 'Unknown')
                    category = getattr(user, 'category', 'Employee')
                    role_counts[role] = role_counts.get(role, 0) + 1
                    store_counts[store] = store_counts.get(store, 0) + 1
                    category_counts[category] = category_counts.get(category, 0) + 1
                    user_summary.append({
                        "name": getattr(user, 'name', 'Unknown'),
                        "email": getattr(user, 'email', ''),
                        "role": role,
                        "store": store,
                        "category": category,
                    })
                
                # Get training completion stats
                total_course_completions = db.query(CourseCompletion).count()
                total_video_completions = db.query(VideoProgress).filter(VideoProgress.completed == True).count()
                active_learners = db.query(VideoProgress.user_email).distinct().count()
                
                data_context["users"] = {
                    "total_count": len(users),
                    "by_role": role_counts,
                    "by_store": store_counts,
                    "by_category": category_counts,
                    "training_stats": {
                        "total_course_completions": total_course_completions,
                        "total_video_completions": total_video_completions,
                        "active_learners": active_learners,
                    },
                    "sample_users": user_summary[:15],
                }
            except Exception as e:
                logger.warning(f"Could not fetch users: {e}")
        
        # QUIZZES - fetch quiz data with submission stats
        if "post_quiz" in privileges or "assign_quiz" in privileges or is_superadmin:
            try:
                from app.models.quiz import Quiz, QuizSubmission
                
                quiz_service = QuizService(db)
                quizzes = quiz_service.get_all_quizzes()
                quiz_summary = []
                for quiz in quizzes[:15]:
                    quiz_summary.append({
                        "id": getattr(quiz, 'id', ''),
                        "title": getattr(quiz, 'title', 'Untitled'),
                        "difficulty": getattr(quiz, 'difficulty', 'Medium'),
                        "created_by": getattr(quiz, 'created_by', 'Admin'),
                        "questions_count": len(getattr(quiz, 'questions', []) or []),
                        "passing_score": getattr(quiz, 'passing_score', 70),
                    })
                
                # Get submission statistics
                total_submissions = db.query(QuizSubmission).count()
                unique_users_attempted = db.query(QuizSubmission.user_email).distinct().count()
                
                # Calculate average score
                all_scores = db.query(QuizSubmission.score).all()
                avg_score = 0.0
                if all_scores:
                    scores_list = [s[0] for s in all_scores if s[0] is not None]
                    avg_score = round(sum(scores_list) / len(scores_list), 1) if scores_list else 0.0
                
                # Count passed (score >= 70)
                passed_count = db.query(QuizSubmission).filter(QuizSubmission.score >= 70).count()
                pass_rate = f"{round((passed_count / total_submissions * 100), 1)}%" if total_submissions > 0 else "0%"
                
                data_context["quizzes"] = {
                    "total_quizzes": len(quizzes),
                    "quiz_list": quiz_summary,
                    "submission_stats": {
                        "total_submissions": total_submissions,
                        "unique_users_attempted": unique_users_attempted,
                        "average_score": avg_score,
                        "passed_count": passed_count,
                        "pass_rate": pass_rate,
                    }
                }
            except Exception as e:
                logger.warning(f"Could not fetch quizzes: {e}")
        
        # ANALYTICS / REPORTS - with real metrics
        if "reports" in privileges or "view_analytics" in privileges or is_superadmin:
            try:
                from app.models.tracking import CourseCompletion
                from app.models.video_progress import VideoProgress
                from app.models.quiz import QuizSubmission
                from app.models.simulation import SimulationProgress
                from app.models.assessment import AssessmentSubmission
                
                analytics_repo = AnalyticsRepository(db)
                
                # Aggregate real metrics
                metrics = {
                    "course_completions": db.query(CourseCompletion).count(),
                    "video_completions": db.query(VideoProgress).filter(VideoProgress.completed == True).count(),
                    "quiz_submissions": db.query(QuizSubmission).count(),
                    "simulation_completions": db.query(SimulationProgress).filter(SimulationProgress.completed == True).count(),
                    "assessment_submissions": db.query(AssessmentSubmission).count(),
                    "active_learners": db.query(VideoProgress.user_email).distinct().count(),
                }
                
                # Calculate overall engagement rate
                from app.models.user import User
                total_users = db.query(User).filter(User.has_admin_access == False).count()
                engagement_rate = f"{round((metrics['active_learners'] / total_users * 100), 1)}%" if total_users > 0 else "0%"
                metrics["engagement_rate"] = engagement_rate
                
                data_context["analytics"] = {
                    "metrics": metrics,
                    "available_reports": ["Employee Performance", "Course Completion Rates", "Quiz Scores", "Training Progress", "Simulation Analytics"],
                }
            except Exception as e:
                logger.warning(f"Could not fetch analytics: {e}")
        
        # CONTENT / TRAINING - with video progress stats
        if "upload_training" in privileges or "manage_learning_path" in privileges or is_superadmin:
            try:
                from app.models.video_progress import VideoProgress
                from app.models.content import CourseBucket
                
                content_list = db.query(Content).all()
                content_summary = []
                bucket_counts = {}
                path_type_counts = {"self_learning": 0, "career_progression": 0, "other": 0}
                
                for content in content_list:
                    bucket = getattr(content, 'bucket', 'Uncategorized') or 'Uncategorized'
                    bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
                    path_type = getattr(content, 'learning_path_type', 'other') or 'other'
                    if path_type in path_type_counts:
                        path_type_counts[path_type] += 1
                    content_summary.append({
                        "id": getattr(content, 'id', ''),
                        "title": getattr(content, 'title', 'Untitled'),
                        "bucket": bucket,
                        "is_path_node": getattr(content, 'is_path_node', False),
                        "learning_path_type": path_type,
                    })
                
                # Video progress stats
                total_video_starts = db.query(VideoProgress).count()
                total_video_completions = db.query(VideoProgress).filter(VideoProgress.completed == True).count()
                completion_rate = f"{round((total_video_completions / total_video_starts * 100), 1)}%" if total_video_starts > 0 else "0%"
                
                # Average watch percentage
                watch_percents = db.query(VideoProgress.video_watched_percent).all()
                avg_watch = 0.0
                if watch_percents:
                    valid_percents = [w[0] for w in watch_percents if w[0] is not None]
                    avg_watch = round(sum(valid_percents) / len(valid_percents), 1) if valid_percents else 0.0
                
                # Get buckets
                buckets = db.query(CourseBucket).all()
                bucket_list = [b.name for b in buckets]
                
                data_context["content"] = {
                    "total_courses": len(content_list),
                    "by_bucket": bucket_counts,
                    "by_learning_path_type": path_type_counts,
                    "buckets_available": bucket_list,
                    "video_stats": {
                        "total_video_starts": total_video_starts,
                        "total_video_completions": total_video_completions,
                        "completion_rate": completion_rate,
                        "average_watch_percentage": avg_watch,
                    },
                    "content_list": content_summary[:15],
                }
            except Exception as e:
                logger.warning(f"Could not fetch content: {e}")
        
        # NOTIFICATIONS / NEWS
        if "post_news" in privileges or "send_notification" in privileges or is_superadmin:
            try:
                notifications = db.query(Notification).order_by(Notification.created_at.desc()).limit(20).all()
                notif_summary = []
                for notif in notifications:
                    notif_summary.append({
                        "title": getattr(notif, 'title', 'Notification'),
                        "type": getattr(notif, 'type', 'general'),
                        "created_at": str(getattr(notif, 'created_at', '')),
                    })
                data_context["notifications"] = {
                    "recent_count": len(notifications),
                    "recent_notifications": notif_summary,
                }
            except Exception as e:
                logger.warning(f"Could not fetch notifications: {e}")
        
        # CRM / TICKETS
        if "crm_tickets" in privileges or is_superadmin:
            try:
                crm_repo = CRMRepository(db)
                tickets = crm_repo.get_all_tickets()
                ticket_summary = {
                    "total": len(tickets),
                    "by_status": {},
                    "by_priority": {},
                }
                for ticket in tickets:
                    status = getattr(ticket, 'status', 'open')
                    priority = getattr(ticket, 'priority', 'medium')
                    ticket_summary["by_status"][status] = ticket_summary["by_status"].get(status, 0) + 1
                    ticket_summary["by_priority"][priority] = ticket_summary["by_priority"].get(priority, 0) + 1
                data_context["crm_tickets"] = ticket_summary
            except Exception as e:
                logger.warning(f"Could not fetch CRM tickets: {e}")
        
        # SIMULATIONS
        if "manage_simulations" in privileges or is_superadmin:
            try:
                from app.models.simulation import Simulation, SimulationProgress
                
                # Fetch simulations
                simulations = db.query(Simulation).all()
                sim_summary = []
                for sim in simulations[:10]:
                    sim_summary.append({
                        "id": sim.id,  # Include ID to map with progress
                        "title": getattr(sim, 'title', 'Simulation'),
                        "category": getattr(sim, 'category', 'Training'),
                    })
                
                # Fetch simulation progress stats
                progress_stats = {
                    "total_attempts": db.query(SimulationProgress).count(),
                    "total_completions": db.query(SimulationProgress).filter(SimulationProgress.completed == True).count(),
                    "passed_count": db.query(SimulationProgress).filter(SimulationProgress.passed == True).count(),
                    "avg_score": 0.0
                }
                
                # Calculate avg score if there are attempts
                if progress_stats["total_attempts"] > 0:
                    scores = db.query(SimulationProgress.score).all()
                    total_score = sum([s[0] for s in scores if s[0] is not None])
                    progress_stats["avg_score"] = round(total_score / progress_stats["total_attempts"], 2)
                
                progress_stats["completion_rate"] = (
                    f"{round((progress_stats['total_completions'] / progress_stats['total_attempts'] * 100), 1)}%" 
                    if progress_stats["total_attempts"] > 0 else "0%"
                )

                data_context["simulations"] = {
                    "total_count": len(simulations),
                    "simulation_list": sim_summary,
                    "stats": progress_stats
                }
            except Exception as e:
                logger.warning(f"Could not fetch simulations: {e}")
        
        # SCHEDULED EXAMS with attendance stats
        if "scheduled_exams" in privileges or "proctored_assessment" in privileges or is_superadmin:
            try:
                from app.models.assessment import ScheduledExam, ExamAttendance, ProcturedAssessment, AssessmentSubmission
                
                # Scheduled exams
                exams = db.query(ScheduledExam).all()
                exam_summary = []
                status_counts = {"scheduled": 0, "in_progress": 0, "completed": 0, "cancelled": 0}
                
                for exam in exams[:10]:
                    status = getattr(exam, 'status', 'scheduled')
                    if status in status_counts:
                        status_counts[status] += 1
                    exam_summary.append({
                        "id": getattr(exam, 'id', ''),
                        "title": getattr(exam, 'title', 'Exam'),
                        "exam_date": getattr(exam, 'exam_date', ''),
                        "status": status,
                        "assigned_count": len(getattr(exam, 'assigned_users', []) or []),
                    })
                
                # Exam attendance stats
                total_attendance_marked = db.query(ExamAttendance).filter(ExamAttendance.marked_present == True).count()
                total_exams_completed = db.query(ExamAttendance).filter(ExamAttendance.completed == True).count()
                total_exams_passed = db.query(ExamAttendance).filter(ExamAttendance.passed == True).count()
                
                # Proctored assessments
                proctored_assessments = db.query(ProcturedAssessment).all()
                assessment_summary = []
                for pa in proctored_assessments[:10]:
                    assessment_summary.append({
                        "id": getattr(pa, 'id', ''),
                        "title": getattr(pa, 'title', 'Assessment'),
                        "passing_score": getattr(pa, 'passing_score', 70),
                        "time_limit_minutes": getattr(pa, 'time_limit_minutes', 30),
                    })
                
                # Assessment submission stats
                total_submissions = db.query(AssessmentSubmission).count()
                passed_submissions = db.query(AssessmentSubmission).filter(AssessmentSubmission.passed == True).count()
                
                # Calculate average score
                scores = db.query(AssessmentSubmission.score_percent).all()
                avg_assessment_score = 0.0
                if scores:
                    valid_scores = [s[0] for s in scores if s[0] is not None]
                    avg_assessment_score = round(sum(valid_scores) / len(valid_scores), 1) if valid_scores else 0.0
                
                assessment_pass_rate = f"{round((passed_submissions / total_submissions * 100), 1)}%" if total_submissions > 0 else "0%"
                
                # Integrity stats
                flagged_submissions = db.query(AssessmentSubmission).filter(AssessmentSubmission.integrity_status == 'flagged').count()
                
                data_context["scheduled_exams"] = {
                    "total_scheduled_exams": len(exams),
                    "by_status": status_counts,
                    "exam_list": exam_summary,
                    "attendance_stats": {
                        "total_attendance_marked": total_attendance_marked,
                        "total_exams_completed": total_exams_completed,
                        "total_exams_passed": total_exams_passed,
                    }
                }
                
                data_context["proctored_assessments"] = {
                    "total_assessments": len(proctored_assessments),
                    "assessment_list": assessment_summary,
                    "submission_stats": {
                        "total_submissions": total_submissions,
                        "passed_submissions": passed_submissions,
                        "pass_rate": assessment_pass_rate,
                        "average_score": avg_assessment_score,
                        "flagged_for_integrity": flagged_submissions,
                    }
                }
            except Exception as e:
                logger.warning(f"Could not fetch scheduled exams: {e}")
        
        # AUDIT LOGS
        if "view_audit_logs" in privileges or "audits" in privileges or is_superadmin:
            try:
                analytics_repo = AnalyticsRepository(db)
                logs = analytics_repo.get_audit_logs(limit=20)
                log_summary = []
                for log in logs[:10]:
                    log_dict = log.to_dict() if hasattr(log, 'to_dict') else {}
                    log_summary.append({
                        "action": log_dict.get('action', 'Unknown'),
                        "user": log_dict.get('user_email', 'System'),
                        "timestamp": str(log_dict.get('timestamp', '')),
                    })
                data_context["audit_logs"] = {
                    "recent_count": len(logs),
                    "recent_logs": log_summary,
                }
            except Exception as e:
                logger.warning(f"Could not fetch audit logs: {e}")
        
        # LIVE TRACKING with attendance stats
        if "live_tracking" in privileges or is_superadmin:
            try:
                from app.models.tracking import LocationTracking, AttendanceRecord
                from datetime import datetime, timedelta
                
                # Recent locations
                locations = db.query(LocationTracking).order_by(LocationTracking.timestamp.desc()).limit(100).all()
                unique_users = set()
                store_breakdown = {}
                
                for loc in locations:
                    email = getattr(loc, 'user_email', '')
                    store = getattr(loc, 'store', 'Unknown') or 'Unknown'
                    unique_users.add(email)
                    store_breakdown[store] = store_breakdown.get(store, 0) + 1
                
                # Today's attendance
                today = datetime.utcnow().date()
                today_start = datetime.combine(today, datetime.min.time())
                
                today_punch_ins = db.query(AttendanceRecord).filter(
                    AttendanceRecord.punch_in >= today_start
                ).count()
                
                active_attendance = db.query(AttendanceRecord).filter(
                    AttendanceRecord.punch_in >= today_start,
                    AttendanceRecord.punch_out == None
                ).count()
                
                data_context["live_tracking"] = {
                    "active_users_tracked": len(unique_users),
                    "total_location_records": len(locations),
                    "by_store": store_breakdown,
                    "attendance": {
                        "today_punch_ins": today_punch_ins,
                        "currently_active": active_attendance,
                    }
                }
            except Exception as e:
                logger.warning(f"Could not fetch tracking data: {e}")
        
    except Exception as e:
        logger.error(f"Error fetching privilege-based data: {e}")
    
    return data_context


@router.post("/admin-copilot")
async def admin_copilot(
    request: Request,
    db: Session = Depends(get_db),
    user_token: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """
    Admin Copilot - Access-controlled AI assistant for admins.
    Answers questions based only on data the admin has access to, based on grants.
    """
    try:
        # Parse request body
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
        else:
            try:
                form = await request.form()
                data = dict(form)
            except:
                data = {}
        
        question = data.get("question", "")
        if not question:
            # Maybe it sent 'message'
            question = data.get("message", "")
            
        chat_history = data.get("history", [])
        if isinstance(chat_history, str):
            try:
                chat_history = json.loads(chat_history)
            except:
                chat_history = []
                
        if not question:
            return {"answer": "Please ask me a question!", "status": "error"}
            
        # Determine Admin Identity
        admin_email = None
        admin_name = "Admin"
        is_superadmin = False
        
        if user_token:
            admin_email = user_token.get("email")
            admin_name = user_token.get("name", "Admin")
            is_superadmin = user_token.get("is_superadmin", False)
        
        # Fallback to body params if no token (legacy support)
        if not admin_email:
            admin_email = data.get("admin_email")
            admin_name = data.get("admin_name", "Admin")
            is_superadmin = data.get("is_superadmin", False)
            
        if not admin_email:
            return {
                "answer": "Unauthorized. Could not identify admin user.",
                "status": "error"
            }
            
        # Ensure superadmin flag matches reality, if checking token
        if user_token and not is_superadmin:
            is_superadmin = user_token.get("role", "").lower() == "superadmin"

        # Fetch Access-Controlled Data Context
        chatbot_service = AdminChatbotService(db)
        # If superadmin, AccessControlService handles it internally (returns all users)
        accessible_data_dict = chatbot_service.get_context_for_admin(admin_email)
        accessible_count = accessible_data_dict.get("accessible_count", 0)
        
        context_text = chatbot_service.build_context_string(accessible_data_dict)
        
        # Build system prompt
        access_level = "SUPERADMIN (Full access to all data)" if is_superadmin else f"Admin (Access to {accessible_count} users)"
        
        system_prompt = f"""You are the Admin Copilot AI for Emirates Airlines' Learning Management System (Emirates LMS).
You are assisting {admin_name}.

ACCESS LEVEL: {access_level}
ACCESSIBLE USERS COUNT: {accessible_count}

IMPORTANT STRICT RULES:
1. ONLY answer questions using the data provided below. Do NOT hallucinate data or users.
2. If asked about a specific user, check if they exist in your data. If they don't, clearly state: "I don't have access to data for this user" or "This user is not in our records."
3. Quote exact numbers and statistics from the data when possible.
4. Search by name or email when asked about specific users.
5. Format your response with bullet points and clear sections where appropriate.
6. Use relevant emojis sparingly (📊, 👥, 📚, ✅, 🎯).
7. Be concise, factual, and data-grounded.

--- START OF ACCESSIBLE DATA ---
{context_text}
--- END OF ACCESSIBLE DATA ---
"""

        # Build conversation history
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add chat history (last 10 messages max)
        for msg in chat_history[-10:]:
            # Frontend might send { "sender": "user" } or { "role": "user" }
            # and { "text": "..." } or { "content": "..." }
            role = "user" if msg.get("sender") == "user" else "assistant"
            content = msg.get("text") or msg.get("content") or ""
            if content:
                messages.append({"role": role, "content": content})
                
        # Add current question
        messages.append({"role": "user", "content": question})

        # Call Groq API with lower temperature for factual answers
        client = Groq(api_key=settings.GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.4,
            max_tokens=1500
        )
        
        answer = response.choices[0].message.content.strip()
        
        return {
            "answer": answer,
            "status": "success",
            "accessible_users_count": accessible_count,
            "data_sources": ["user_data", "learning_progress", "quiz_data", "daily_quiz_data", "assessment_data"] if accessible_count > 0 else ["content_overview"],
        }
        
    except Exception as e:
        logger.error(f"Admin Copilot Error: {e}")
        return {
            "answer": "I'm having trouble processing your request right now. Please try again. 🔄",
            "status": "error",
            "error": str(e)
        }