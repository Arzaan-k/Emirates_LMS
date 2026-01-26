import os
import sys
import shutil
import asyncio
import json
import logging
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from urllib.parse import unquote

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, BackgroundTasks, Request, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import Groq

# Database imports
from database import get_db, SessionLocal, check_database_health
from sqlalchemy.orm import Session
import db_operations as db_ops
from models import User as DBUser, Content as DBContent, CourseCompletion as DBCourseCompletion, ProgressionLevel, AccessRule

# Authentication and Security imports
from auth import (
    hash_password, verify_password, is_password_hashed,
    create_access_token, create_refresh_token, verify_token,
    get_current_user, require_auth, require_admin, require_privilege,
    generate_user_token_data
)
from security import (
    setup_security, limiter, get_allowed_origins,
    sanitize_string, sanitize_filename, validate_email,
    validate_file_extension, get_file_type,
    validate_password_strength, MAX_FILE_SIZE_MB, MAX_VIDEO_SIZE_MB
)

# AI Services (using Groq API instead of local models)
import ai_services

# CDN Service for video storage (Cloudflare R2)
import cdn_service

# RAG Service for vector search (uses Groq - zero extra cost)
import rag_service

# Legacy rag_metadata for backward compatibility
rag_metadata = []

def chunk_text(text, chunk_size=200, overlap=40):
    """Split text into overlapping chunks for RAG."""
    return rag_service.chunk_text(text, chunk_size, overlap)


def add_course_to_rag(course_id, transcript):
    """Add course transcript to RAG system."""
    # Use the new RAG service
    chunks_added = rag_service.add_to_rag(course_id, transcript)
    
    # Also maintain legacy rag_metadata for backward compatibility
    chunks = chunk_text(transcript)
    for chunk in chunks:
        rag_metadata.append({
            "course_id": course_id,
            "text": chunk
        })
    
    return chunks_added

# --- CONFIGURATION ---
# Render sets PORT env variable; fallback to 8000 for local development
PORT = int(os.environ.get("PORT", 8000))
HOST = "0.0.0.0"
# BASE_URL: Use RENDER_EXTERNAL_URL if on Render, otherwise use local IP
BASE_URL = os.environ.get("RENDER_EXTERNAL_URL", "http://172.20.10.2:8000")

# --- LOGGING ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BW_LMS_Backend")

# --- ELEVENLABS CONFIG ---
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
if not ELEVENLABS_API_KEY:
    raise ValueError("ELEVENLABS_API_KEY environment variable is not set. Please check your .env file.")

VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "3AMU7jXQuQa3oRvRqUmb")

# --- GROQ CONFIG ---
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable is not set. Please check your .env file.")

def generate_elevenlabs_audio(text):
    """Generates audio from text using ElevenLabs API and returns Base64 string."""
    try:
        import requests
        import base64
        
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
        headers = {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
        }
        data = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.4,
                "similarity_boost": 0.8,
                "style": 0.6,
                "use_speaker_boost": True
            }
        }
        
        response = requests.post(url, json=data, headers=headers)
        
        if response.status_code == 200:
            return base64.b64encode(response.content).decode('utf-8')
        else:
            logger.error(f"ElevenLabs Error: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        logger.error(f"TTS Generation Error: {e}")
        return None

# --- APP SETUP ---
app = FastAPI(
    title="BW LMS Backend",
    description="Learning Management System Backend API",
    version="2.0.0"
)

# Setup security middleware (rate limiting, headers, logging)
setup_security(app)

# CORS Configuration - use allowed origins from environment
allowed_origins = get_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
logger.info(f"CORS configured for origins: {allowed_origins}")

# --- FFMPEG PATH FOR VIDEO PROCESSING ---
# Required for moviepy video processing
FFMPEG_WINGET_PATH = r"C:\Users\Arzaan Ali Khan\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"
if os.path.exists(FFMPEG_WINGET_PATH) and FFMPEG_WINGET_PATH not in os.environ.get("PATH", ""):
    os.environ["PATH"] = FFMPEG_WINGET_PATH + os.pathsep + os.environ.get("PATH", "")
    logger.info(f"FFmpeg path added: {FFMPEG_WINGET_PATH}")

# Also try imageio_ffmpeg as fallback
try:
    import imageio_ffmpeg
    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_dir = os.path.dirname(ffmpeg_path)
    if ffmpeg_dir not in os.environ["PATH"]:
        os.environ["PATH"] += os.pathsep + ffmpeg_dir
    logger.info(f"FFmpeg imageio Path configured: {ffmpeg_dir}")
except Exception as e:
    logger.warning(f"Could not configure imageio FFmpeg: {e}")

# --- STATIC FILES ---
# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# --- DATA MODELS ---
# --- DATA MODELS ---
# Audit Logs
audit_logs = [
    {
        "id": "log-initial-1",
        "action": "CREATE_USER",
        "timestamp": datetime.now().isoformat(),
        "target": "John Doe",
        "details": "Created new store manager account",
        "admin_email": "admin@bwc.com"
    },
    {
        "id": "log-initial-2",
        "action": "UPLOAD_CONTENT",
        "timestamp": datetime.now().isoformat(),
        "target": "Safety Procedures v2.pdf",
        "details": "Uploaded to Learning Path",
        "admin_email": "admin@bwc.com"
    }
]

def log_action(action: str, target: str, details: str = "", admin_email: str = "admin@bwc.com"):
    """
    Helper to log an audit action.
    """
    log_id = f"log-{uuid.uuid4()}"
    now = datetime.now()
    
    # DB log (without id - let database auto-generate it)
    db_log = {
        "action": action,
        "timestamp": now,
        "target": target,
        "details": details,
        "user_email": admin_email
    }

    # Save to database
    try:
        db = SessionLocal()
        try:
            db_ops.create_audit_log(db, db_log)
            logger.debug(f"Audit log saved to DB: {action} - {target}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error saving audit log to DB: {e}")

    # In-memory log (with string id for backward compatibility)
    new_log = {
        "id": log_id,
        "action": action,
        "timestamp": now.isoformat(),
        "target": target,
        "details": details,
        "user_email": admin_email,
        "admin_email": admin_email  # Keep for backward compatibility
    }

    # Also keep in memory for backward compatibility
    audit_logs.insert(0, new_log)
    # Keep only last 100 logs
    if len(audit_logs) > 100:
        audit_logs.pop()

# --- DATA MODELS ---
class ContentItem(BaseModel):
    id: str  # Unique ID (UUID)
    title: str
    description: str
    videoUrl: str
    authorRole: str
    timestamp: str
    isPathNode: bool = False
    skippable: bool = False  # New permission field
    xp: int = 50
    transcript: Optional[str] = None
    quiz: Optional[dict] = None
    learning_path_type: str = "career_progression"  # "self_learning" or "career_progression"

class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correctIndex: int

class UpdateContentRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    skippable: Optional[bool] = None
    quiz: Optional[dict] = None

class GenerateQuizRequest(BaseModel):
    transcript: str
    correctIndex: int  # 0-3

class Quiz(BaseModel):
    title: str
    description: str
    questions: List[QuizQuestion]

class QuizSubmission(BaseModel):
    quiz_id: str
    user_name: str
    answers: List[int]

class AskAIRequest(BaseModel):
    course_id: str
    question: str

class HygieneAnalysis(BaseModel):
    section: str
    score: int
    tips: List[str]


# --- IN-MEMORY STORE ---
# --- IN-MEMORY STORE ---
content_store: List[dict] = []
quiz_store: List[dict] = []  # {id, title, description, questions, created_at, created_by}
quiz_submissions: List[dict] = []  # {id, quiz_id, user_name, answers, score, submitted_at}
notification_store: List[dict] = [] # {id, title, message, type, created_at, read_by}
resource_store: List[dict] = [] # {id, title, category, type, url, description, created_at, size}

# ==========================================
# DATABASE LOADING ON STARTUP
# ==========================================
def load_data_from_database():
    """Load all data from PostgreSQL database into in-memory stores on startup."""
    global content_store, resource_store, quiz_store
    
    try:
        db = SessionLocal()
        
        # Load Content (Learning Path nodes)
        try:
            db_content = db_ops.get_all_content(db)
            for item in db_content:
                content_item = {
                    "id": item.id,
                    "title": item.title,
                    "description": item.description or "",
                    "videoUrl": item.video_url or item.file_url or "",
                    "authorRole": "Store Manager",
                    "timestamp": item.timestamp.isoformat() if item.timestamp else datetime.now().isoformat(),
                    "isPathNode": item.is_path_node or False,
                    "skippable": False,
                    "xp": 50,
                    "transcript": item.transcript or "",
                    "quiz": item.quiz,
                    "bucket": item.bucket,
                    "learning_path_type": item.learning_path_type or "career_progression",
                }
                content_store.append(content_item)
            logger.info(f"Loaded {len(content_store)} content items from database")
        except Exception as e:
            logger.error(f"Error loading content from DB: {e}")
        
        # Load Resources
        try:
            db_resources = db_ops.get_all_resources(db)
            for item in db_resources:
                resource_item = {
                    "id": item.id,
                    "title": item.title,
                    "category": item.category or "",
                    "description": item.description or "",
                    "url": item.url or "",
                    "type": item.resource_type or "File",
                    "timestamp": item.created_at.isoformat() if item.created_at else datetime.now().isoformat(),
                    "size": str(item.file_size) if item.file_size else "Unknown"
                }
                resource_store.append(resource_item)
            logger.info(f"Loaded {len(resource_store)} resources from database")
        except Exception as e:
            logger.error(f"Error loading resources from DB: {e}")
        
        # Load Quizzes
        try:
            db_quizzes = db_ops.get_all_quizzes(db)
            for item in db_quizzes:
                quiz_item = {
                    "id": item.id,
                    "title": item.title,
                    "description": item.description or "",
                    "questions": item.questions or [],
                    "created_at": item.created_at.isoformat() if item.created_at else datetime.now().isoformat(),
                    "created_by": item.created_by or "",
                    "difficulty": item.difficulty or "medium",
                    "time": item.time_limit or "10 mins"
                }
                quiz_store.append(quiz_item)
            logger.info(f"Loaded {len(quiz_store)} quizzes from database")
        except Exception as e:
            logger.error(f"Error loading quizzes from DB: {e}")
        
        db.close()
        logger.info("Database loading completed successfully!")
        
    except Exception as e:
        logger.error(f"Failed to load data from database: {e}")

# Load data from database on import (server startup)
load_data_from_database()

# LOCATION TRACKING STORE
location_store: dict = {}  # {user_id: {user_id, name, latitude, longitude, timestamp, active}}

# USER MANAGEMENT STORE
# Privileges define what features a user can access in the admin panel
ALL_PRIVILEGES = [
    "team_list",           # View team members
    "reports",             # View reports/analytics
    "assign_quiz",         # Assign quizzes to users
    "audits",              # Audit functionality
    "upload_training",     # Upload training content
    "bulk_upload",         # Bulk upload content
    "post_news",           # Post news updates
    "post_quiz",           # Create quizzes
    "create_user",         # Create new users
    "live_tracking",       # Real-time location tracking
    "proctored_assessment",# Access proctored assessments (take tests)
    "proctored_create_manage",  # Create and manage proctored assessments
    "proctored_view_results",   # View proctored assessment results
    "view_analytics",      # View analytics dashboard
    "send_notification",   # Send notifications
    "access_control",      # Manage access control
    "manage_buckets",      # Manage course buckets
    "schedule_meeting",    # Schedule virtual meetings
    "crm_tickets",         # CRM ticket management
    "manage_simulations",  # Manage interactive simulations
    "manage_learning_path", # Manage learning path content
    "scheduled_exams",     # Scheduled Exams
    "exam_reports",        # Exam Reports
    "support_library",     # LMS Support Library
    "view_audit_logs",     # Audit Logs
]

# PRIVILEGE ICON MAPPING
PRIVILEGE_ICONS = {
    "team_list": "users",
    "reports": "bar-chart-2",
    "assign_quiz": "check-square",
    "audits": "shield",
    "upload_training": "upload-cloud",
    "bulk_upload": "database",
    "post_news": "bell",
    "post_quiz": "edit-3",
    "create_user": "user-plus",
    "live_tracking": "map-pin",
    "proctored_assessment": "eye",
    "proctored_create_manage": "settings",
    "proctored_view_results": "file-text",
    "view_analytics": "pie-chart",
    "send_notification": "send",
    "access_control": "lock",
    "manage_buckets": "grid",
    "schedule_meeting": "video",
    "crm_tickets": "tag",
    "manage_simulations": "play-circle",
    "manage_learning_path": "git-merge",
    "scheduled_exams": "calendar",
    "exam_reports": "file-text",
    "support_library": "book-open",
    "view_audit_logs": "clipboard",
}

@app.get("/users/privileges")
async def get_privileges():
    """Get all available privileges for creating users"""
    return [
       {"id": p, "name": p.replace("_", " ").title(), "icon": PRIVILEGE_ICONS.get(p, "box")}
       for p in ALL_PRIVILEGES
    ]

@app.get("/cdn/status")
async def get_cdn_status():
    """Check CDN configuration and connectivity status"""
    return cdn_service.check_cdn_status()

@app.get("/rag/status")
async def get_rag_status():
    """Check RAG system status and statistics"""
    return rag_service.get_rag_stats()

# User categories for organizing users
user_categories: List[dict] = [
    {"id": "1", "name": "Super Admin", "description": "Full access to everything", "color": "#9333EA"},
    {"id": "2", "name": "Manager", "description": "Store manager with admin access", "color": "#2563EB"},
    {"id": "3", "name": "Supervisor", "description": "Team supervisor with limited admin", "color": "#10B981"},
    {"id": "4", "name": "Employee", "description": "Regular employee access", "color": "#F59E0B"},
]

users_store: dict = {
    "superadmin": {
        "email": "superadmin", 
        "name": "Super Admin", 
        "password": "superadmin@2025", 
        "role": "Super Admin",
        "category": "Super Admin",
        "privileges": ALL_PRIVILEGES.copy(),  # Full access
        "is_superadmin": True,
        "store": "HQ",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
    "user": {
        "email": "user", 
        "name": "Aditya User", 
        "password": "user@123", 
        "role": "Waffler",
        "category": "Employee",
        "privileges": [],  # No admin privileges
        "is_superadmin": False,
        "store": "Mumbai Central",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
    "store.manager": {
        "email": "store.manager", 
        "name": "Store Manager", 
        "password": "bw_store@2025", 
        "role": "Store Manager",
        "category": "Manager",
        "privileges": [
            "team_list", "reports", "audits", "upload_training", 
            "post_news", "create_user", "live_tracking", 
            "send_notification", "schedule_meeting"
        ],  # Manager has limited privileges (no analytics access)
        "is_superadmin": False,
        "store": "Delhi CP",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
    # Sample employees for analytics
    "emp1@bw.com": {
        "email": "emp1@bw.com",
        "name": "Rahul Kumar",
        "password": "test123",
        "role": "Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Mumbai Central",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
    "emp2@bw.com": {
        "email": "emp2@bw.com",
        "name": "Priya Sharma",
        "password": "test123",
        "role": "Silver Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Mumbai Central",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
    "emp3@bw.com": {
        "email": "emp3@bw.com",
        "name": "Amit Patel",
        "password": "test123",
        "role": "Gold Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Delhi CP",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
    "emp4@bw.com": {
        "email": "emp4@bw.com",
        "name": "Sneha Reddy",
        "password": "test123",
        "role": "Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Delhi CP",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
    "emp5@bw.com": {
        "email": "emp5@bw.com",
        "name": "Vijay Singh",
        "password": "test123",
        "role": "Silver Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Bangalore Indiranagar",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
    "emp6@bw.com": {
        "email": "emp6@bw.com",
        "name": "Anita Desai",
        "password": "test123",
        "role": "Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Bangalore Indiranagar",
        "self_learning_completed": True  # Existing users have self-learning completed
    },
}


# ATTENDANCE/PUNCH IN-OUT STORE
attendance_records: List[dict] = []  # {id, user_id, punch_in, punch_out, duration_minutes}

# NEWS FEED STORE
news_feed: List[dict] = []  # {id, title, content, author, image, date, created_at}

# LIVE QUIZZES STORE (Topic Quizzes for Home Screen)
live_quizzes: List[dict] = []  # {id, title, questions, time, difficulty, image}

# NOTIFICATIONS STORE
notification_store: List[dict] = []
crucial_notification_store: dict = {"current": None}

# MEETINGS STORE - Virtual meetings/video calls
meetings_store: List[dict] = []  # {id, title, description, scheduled_at, duration_minutes, host_name, host_email, room_id, created_at, status}

COURSE_TO_TICKET_TYPE = {
    "1": ["Query", "Request"],      # Onboarding → General inquiries
    "2": ["Query", "Request"],      # Product Training → Product questions
    "3": ["Complaint"],             # Safety & Hygiene → Serious complaints
    "4": ["Complaint"],             # Customer Service → Customer complaints
    "5": ["Query", "Request"],      # Operations → Operational queries
}

crm_tickets: List[dict] = []  # Manager creates tickets from dashboard - no sample data

crm_task_assignments: List[dict] = []

resource_categories: List[dict] = [
    {"id": "1", "name": "Standard SOPs", "icon": "file-document-outline", "color": ["#3B82F6", "#2563EB"], "bg": "#DBEAFE"},
    {"id": "2", "name": "Video Tutorials", "icon": "play-circle-outline", "color": ["#F59E0B", "#D97706"], "bg": "#FEF3C7"},
    {"id": "3", "name": "Machine Manuals", "icon": "tools", "color": ["#8B5CF6", "#7C3AED"], "bg": "#EDE9FE"},
    {"id": "4", "name": "Safety Guides", "icon": "shield-check-outline", "color": ["#10B981", "#059669"], "bg": "#D1FAE5"},
]

# COURSE BUCKETS STORE - For organizing courses into categories/buckets
course_buckets: List[dict] = [
    {"id": "1", "name": "Onboarding", "description": "Essential training for new employees", "color": "#3B82F6", "icon": "account-plus"},
    {"id": "2", "name": "Product Training", "description": "Learn about our products and recipes", "color": "#10B981", "icon": "coffee"},
    {"id": "3", "name": "Safety & Hygiene", "description": "Workplace safety and hygiene protocols", "color": "#EF4444", "icon": "shield-check"},
    {"id": "4", "name": "Customer Service", "description": "Excellence in customer interactions", "color": "#F59E0B", "icon": "account-heart"},
    {"id": "5", "name": "Operations", "description": "Store operations and procedures", "color": "#8B5CF6", "icon": "cog"},
]

# PROCTORED ASSESSMENTS STORE
proctored_assessments: List[dict] = []  # {id, title, description, questions, time_limit_minutes, passing_score, created_at, created_by, is_active}
assessment_submissions: List[dict] = []  # {id, assessment_id, user_email, user_name, answers, score, passed, time_taken_seconds, submitted_at, violations}

# ==========================================
# SCHEDULED EXAMS SYSTEM
# ==========================================
# Scheduled offline exams with attendance tracking and proctored online component
scheduled_exams: List[dict] = []  # {id, title, description, exam_date, exam_time, location, shift, supervisor_email, supervisor_name, assigned_users, questions, time_limit_minutes, passing_score, created_by, created_at, status}
scheduled_exam_attendance: List[dict] = []  # {id, exam_id, user_email, user_name, marked_present, marked_by, marked_at, started_exam, start_time, completed, submission_id}
scheduled_exam_submissions: List[dict] = []  # {id, exam_id, user_email, user_name, answers, score, passed, time_taken_seconds, violations, breach_log, submitted_at}


# ==========================================
# LMS SUPPORT TICKET SYSTEM
# ==========================================
# Support tickets for users/admins to contact LMS team
support_tickets: List[dict] = []  # {id, user_email, user_name, user_role, subject, message, category, priority, status, created_at, responses, resolved_at}

SUPPORT_CATEGORIES = [
    {"id": "bug", "name": "Bug Report", "icon": "bug", "color": "#EF4444"},
    {"id": "feature", "name": "Feature Request", "icon": "lightbulb-on", "color": "#F59E0B"},
    {"id": "help", "name": "Help & Support", "icon": "help-circle", "color": "#3B82F6"},
    {"id": "complaint", "name": "Complaint", "icon": "alert-circle", "color": "#DC2626"},
    {"id": "feedback", "name": "General Feedback", "icon": "message-text", "color": "#10B981"},
]

# ==========================================
# STORE AUDITS SYSTEM
# ==========================================
# Store audit submissions by store managers
store_audit_submissions: List[dict] = []  # {id, user_email, user_name, store, category, category_name, checklist_items, checked_items, completion_rate, submitted_at}

# Audit categories for reference
STORE_AUDIT_CATEGORIES = {
    "safety": {"name": "Safety Compliance", "icon": "shield", "color": "#10B981"},
    "cleanliness": {"name": "Cleanliness", "icon": "droplet", "color": "#3B82F6"},
    "equipment": {"name": "Equipment", "icon": "tool", "color": "#8B5CF6"},
    "service": {"name": "Customer Service", "icon": "smile", "color": "#F59E0B"},
}

# ==========================================
# AI COURSE RECOMMENDATION SYSTEM STORES
# ==========================================

# USER LEARNING PROFILES - Tracks overall learning metrics per user
user_learning_profiles: dict = {}  # {user_email: {skill_scores, total_xp, courses_completed, last_activity, learning_streak, weak_areas, strong_areas}}

# COURSE COMPLETION TRACKING - Detailed record of each course/module completion
course_completions: List[dict] = []  # {id, user_email, course_id, course_title, bucket, score, time_spent_seconds, completed_at, quiz_answers, quiz_correct, quiz_total}

# SKILL CATEGORIES with associated courses (mapping skills to courses)
skill_categories: dict = {
    "product_knowledge": {
        "name": "Product Knowledge",
        "icon": "coffee",
        "color": "#F59E0B",
        "description": "Understanding of waffle recipes, ingredients, and preparation techniques",
        "keywords": ["waffle", "recipe", "ingredient", "product", "menu", "preparation", "chocolate", "toppings"]
    },
    "customer_service": {
        "name": "Customer Service",
        "icon": "account-heart",
        "color": "#10B981",
        "description": "Skills for handling customer interactions, complaints, and feedback",
        "keywords": ["customer", "service", "complaint", "feedback", "communication", "satisfaction", "handling", "resolution"]
    },
    "safety_hygiene": {
        "name": "Safety & Hygiene",
        "icon": "shield-check",
        "color": "#EF4444",
        "description": "Knowledge of food safety protocols and workplace hygiene standards",
        "keywords": ["safety", "hygiene", "clean", "sanitation", "health", "protocol", "compliance", "food safety"]
    },
    "operations": {
        "name": "Operations",
        "icon": "cog",
        "color": "#8B5CF6",
        "description": "Understanding of store operations, inventory, and equipment management",
        "keywords": ["operation", "inventory", "equipment", "machine", "maintenance", "stock", "order", "management"]
    },
    "espresso_coffee": {
        "name": "Espresso & Coffee",
        "icon": "coffee",
        "color": "#6366F1",
        "description": "Mastery of espresso preparation, milk texturing, and coffee techniques",
        "keywords": ["espresso", "coffee", "milk", "barista", "grind", "extraction", "latte", "cappuccino"]
    },
    "onboarding": {
        "name": "Onboarding Essentials",
        "icon": "account-plus",
        "color": "#3B82F6",
        "description": "Foundational training for new team members",
        "keywords": ["onboarding", "training", "introduction", "basics", "foundation", "new", "starter"]
    }
}

# USER SKILL ASSESSMENTS - Detailed skill scores per category
user_skill_assessments: List[dict] = []  # {id, user_email, skill_category, score, max_score, assessment_date, source_type, source_id}

# RECOMMENDATION HISTORY - Track what was recommended and user response
recommendation_history: List[dict] = []  # {id, user_email, recommendations, generated_at, ai_reasoning, user_feedback}

# INTERACTION LOGS - Track all user interactions for analysis
user_interactions: List[dict] = []  # {id, user_email, interaction_type, content_id, content_type, duration_seconds, timestamp, metadata}

# ==========================================
# ROBUST LEARNING PATH SYSTEM STORES
# ==========================================

# NODE COMPLETION REQUIREMENTS - Define passing criteria per node/course
node_completion_requirements: dict = {
    "default": {
        "video_watch_percent": 90,      # Must watch 90% of video
        "quiz_pass_percent": 70,        # Must score 70% on end quiz
        "mid_quiz_required": False,     # [FIX] Relax requirement to prevent blockers
        "mid_quiz_pass_percent": 60,    # 60% on mid-video quizzes
    }
}

# USER NODE PROGRESS - Track detailed progress per user per node
# {user_email: {node_id: {video_watched_percent, video_duration_seconds, video_position_seconds, 
#   mid_quizzes_passed, mid_quizzes_total, end_quiz_score, end_quiz_attempts, completed, completed_at}}}
user_node_progress: dict = {}

# MID-VIDEO QUIZ STORE - Generated quizzes based on video segments
# {node_id: [{quiz_id, trigger_time_seconds, questions: [...], generated_from_transcript}]}
mid_video_quizzes: dict = {}

# MID-VIDEO QUIZ ATTEMPTS - User attempts on mid-video quizzes
# [{id, user_email, node_id, quiz_index, trigger_time, score, total, passed, attempted_at}]
mid_video_quiz_attempts: List[dict] = []

# ROLE ADVANCEMENT EXAMS - Auto-generated proctored exams for level advancement
# {user_email: {current_role, target_role, exam_id, questions, status, created_at, expires_at}}
role_advancement_exams: dict = {}

# ROLE ADVANCEMENT SUBMISSIONS - Track exam results
# [{id, user_email, from_role, to_role, exam_id, score, passed, violations, breach_log, submitted_at}]
role_advancement_submissions: List[dict] = []

# LEVEL ADVANCEMENT CONFIG - Requirements for each level transition
level_advancement_config: dict = {
    "Waffler": {
        "target": "Silver Waffler",
        "exam_questions": 15,           # Number of questions in advancement exam
        "exam_time_minutes": 20,        # Time limit
        "pass_percent": 75,             # Must score 75% to pass
        "proctored": True,              # Proctored exam required
        "max_violations": 3,            # Max violations before auto-fail
    },
    "Silver Waffler": {
        "target": "Gold Waffler",
        "exam_questions": 20,
        "exam_time_minutes": 30,
        "pass_percent": 80,
        "proctored": True,
        "max_violations": 2,
    },
    "Gold Waffler": {
        "target": "Shift Manager",
        "exam_questions": 25,
        "exam_time_minutes": 40,
        "pass_percent": 85,
        "proctored": True,
        "max_violations": 2,
    },
    "Shift Manager": {
        "target": "Assistant Store Manager",
        "exam_questions": 30,
        "exam_time_minutes": 45,
        "pass_percent": 90,
        "proctored": True,
        "max_violations": 1,
    },
}

# ==========================================
# HIERARCHY & LEVEL-BASED ACCESS CONTROL
# ==========================================

# HIERARCHY STORE - Dynamic organizational hierarchy (ordered from top to bottom)
hierarchy_store: List[dict] = [
    {"id": "1", "role": "Ops Manager", "name": "Operations Manager", "icon": "account-cog", "color": "#9333EA", "order": 1},
    {"id": "2", "role": "City Manager", "name": "City Manager", "icon": "city", "color": "#2563EB", "order": 2},
    {"id": "3", "role": "Deputy City Manager", "name": "Deputy City Manager", "icon": "city-variant", "color": "#0891B2", "order": 3},
    {"id": "4", "role": "Area Manager", "name": "Area Manager", "icon": "map-marker-radius", "color": "#059669", "order": 4},
    {"id": "5", "role": "Deputy Area Manager", "name": "Deputy Area Manager", "icon": "map-marker", "color": "#10B981", "order": 5},
    {"id": "6", "role": "Store Manager", "name": "Store Manager", "icon": "store", "color": "#D97706", "order": 6},
    {"id": "7", "role": "Assistant Store Manager", "name": "Assistant Store Manager", "icon": "store-outline", "color": "#F59E0B", "order": 7},
    {"id": "8", "role": "Shift Manager", "name": "Shift Manager", "icon": "clock-outline", "color": "#EF4444", "order": 8},
    {"id": "9", "role": "Gold Waffler", "name": "Gold Waffler", "icon": "medal-outline", "color": "#F59E0B", "order": 9},
    {"id": "10", "role": "Silver Waffler", "name": "Silver Waffler", "icon": "medal-outline", "color": "#9CA3AF", "order": 10},
    {"id": "11", "role": "Waffler", "name": "Waffler", "icon": "account", "color": "#6B7280", "order": 11},
]

# LEVEL CONFIG STORE - Requirements for each employee level
# Defines how many nodes/courses need to be completed to reach a level
level_config_store: dict = {
    "Waffler": {
        "min_nodes": 0,
        "description": "Starting level for new team members",

        "icon": "account",
        "color": "#6B7280",
        "next_level": "Silver Waffler"
    },
    "Silver Waffler": {
        "min_nodes": 10,
        "description": "Completed basic training modules",
        "icon": "medal-outline",
        "color": "#9CA3AF",
        "next_level": "Gold Waffler"
    },
    "Gold Waffler": {
        "min_nodes": 25,
        "description": "Expert level with advanced training",
        "icon": "medal",
        "color": "#F59E0B",
        "next_level": "Shift Manager"
    },
    "Shift Manager": {
        "min_nodes": 40,
        "description": "Leadership track initiated",
        "icon": "clock-outline",
        "color": "#EF4444",
        "next_level": "Assistant Store Manager"
    },
    "Assistant Store Manager": {
        "min_nodes": 60,
        "description": "Store management training",
        "icon": "store-outline",
        "color": "#F59E0B",
        "next_level": "Store Manager"
    },
}

# ACCESS CONTROL STORE - Granular course access per role+level
# Maps role -> level -> list of accessible course IDs (or "ALL" for full access)
# If a role is not in this store, they have access to ALL courses
access_control_store: dict = {
    "Waffler": {
        "accessible_courses": [],  # List of specific course IDs accessible to Wafflers
        "accessible_buckets": ["1"],  # Onboarding bucket only by default
        "max_courses_visible": 5  # How many courses from each accessible bucket are visible
    },
    "Silver Waffler": {
        "accessible_courses": [],
        "accessible_buckets": ["1", "2", "3"],  # Onboarding, Product Training, Safety
        "max_courses_visible": 15
    },
    "Gold Waffler": {
        "accessible_courses": [],
        "accessible_buckets": ["1", "2", "3", "4"],  # Add Customer Service
        "max_courses_visible": 30
    },
    "Shift Manager": {
        "accessible_courses": [],
        "accessible_buckets": ["1", "2", "3", "4", "5"],  # All buckets
        "max_courses_visible": -1  # -1 means unlimited
    },
}

# ===========================================================================
# DYNAMIC LEVEL HIERARCHY SYSTEM (DATABASE-BACKED)
# ===========================================================================
# Levels are now stored in PostgreSQL and cached in memory for performance
# Each level has: id, name, order, icon, color, description, min_nodes

# In-memory cache for levels (refreshed on changes)
level_hierarchy_cache: list = []

def load_levels_from_db():
    """Load all progression levels from database into cache."""
    global level_hierarchy_cache
    try:
        db = SessionLocal()
        db_levels = db.query(ProgressionLevel).order_by(ProgressionLevel.order).all()
        
        # Fetch access rules to get courses and buckets
        access_rules = db.query(AccessRule).all()
        rules_map = {rule.level_name: rule for rule in access_rules}
        
        level_hierarchy_cache = []
        for lvl in db_levels:
            # Get associated rule
            rule = rules_map.get(lvl.name)
            courses = rule.accessible_courses if rule else []
            buckets = rule.accessible_buckets if rule else []
            
            level_hierarchy_cache.append({
                "id": lvl.id,
                "name": lvl.name,
                "order": lvl.order,
                "icon": lvl.icon or "medal-outline",
                "color": lvl.color or "#6B7280",
                "description": lvl.description or "",
                "min_nodes": lvl.min_nodes or 0,
                "courses": courses,
                "accessible_buckets": buckets
            })
        db.close()
        db.close()
        logger.info(f"Loaded {len(level_hierarchy_cache)} progression levels from database with course assignments")
        
        # Initialize with defaults if database returned empty list
        if not level_hierarchy_cache:
            logger.info("Database empty, initializing default levels...")
            init_default_levels()
            
    except Exception as e:
        logger.error(f"Failed to load levels from database: {e}")
        # Initialize with defaults if database error
        if not level_hierarchy_cache:
            init_default_levels()

def load_access_rules_from_db():
    """Load all access rules from database into the in-memory access_control_store."""
    global access_control_store
    try:
        db = SessionLocal()
        access_rules = db.query(AccessRule).all()
        
        # Rebuild access_control_store from database
        for rule in access_rules:
            access_control_store[rule.level_name] = {
                "accessible_courses": rule.accessible_courses or [],
                "accessible_buckets": rule.accessible_buckets or [],
                "max_courses_visible": rule.max_courses_visible if rule.max_courses_visible is not None else -1
            }
        
        db.close()
        logger.info(f"Loaded {len(access_rules)} access rules from database into access_control_store")
        
    except Exception as e:
        logger.error(f"Failed to load access rules from database: {e}")


def save_access_rule_to_db(level_name: str, accessible_courses: list, accessible_buckets: list, max_courses_visible: int = -1):
    """Save or update an access rule in the database."""
    try:
        db = SessionLocal()
        
        # Check if rule already exists
        existing_rule = db.query(AccessRule).filter(AccessRule.level_name == level_name).first()
        
        if existing_rule:
            # Update existing rule
            existing_rule.accessible_courses = accessible_courses
            existing_rule.accessible_buckets = accessible_buckets
            existing_rule.max_courses_visible = max_courses_visible
            existing_rule.updated_at = datetime.utcnow()
        else:
            # Create new rule
            new_rule = AccessRule(
                level_name=level_name,
                accessible_courses=accessible_courses,
                accessible_buckets=accessible_buckets,
                max_courses_visible=max_courses_visible
            )
            db.add(new_rule)
        
        db.commit()
        db.close()
        
        # Update in-memory store as well
        access_control_store[level_name] = {
            "accessible_courses": accessible_courses,
            "accessible_buckets": accessible_buckets,
            "max_courses_visible": max_courses_visible
        }
        
        logger.info(f"Access rule saved to database for level: {level_name}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to save access rule to database: {e}")
        return False


def init_default_levels():
    """Initialize default progression levels if table is empty."""
    global level_hierarchy_cache
    default_levels = [
        {"id": "level_0", "name": "Waffler", "order": 0, "icon": "account", "color": "#6B7280", "description": "Entry level - new team members", "min_nodes": 0},
        {"id": "level_1", "name": "Silver Waffler", "order": 1, "icon": "medal-outline", "color": "#9CA3AF", "description": "Basic training completed", "min_nodes": 10},
        {"id": "level_2", "name": "Gold Waffler", "order": 2, "icon": "medal", "color": "#F59E0B", "description": "Advanced training completed", "min_nodes": 25},
        {"id": "level_3", "name": "Shift Manager", "order": 3, "icon": "clock-outline", "color": "#EF4444", "description": "Leadership track initiated", "min_nodes": 40},
        {"id": "level_4", "name": "Assistant Store Manager", "order": 4, "icon": "store-outline", "color": "#F59E0B", "description": "Store management training", "min_nodes": 60},
        {"id": "level_5", "name": "Store Manager", "order": 5, "icon": "store", "color": "#D97706", "description": "Full store management", "min_nodes": 80},
    ]
    
    try:
        db = SessionLocal()
        # Check if levels exist
        existing = db.query(ProgressionLevel).count()
        if existing == 0:
            for lvl in default_levels:
                # Create Level
                db_level = ProgressionLevel(
                    id=lvl["id"],
                    name=lvl["name"],
                    order=lvl["order"],
                    icon=lvl["icon"],
                    color=lvl["color"],
                    description=lvl["description"],
                    min_nodes=lvl["min_nodes"]
                )
                db.add(db_level)
                
                # Create Access Rule (buckets/courses)
                if "accessible_buckets" in lvl and lvl["accessible_buckets"]:
                    rule = AccessRule(
                        level_name=lvl["name"],
                        accessible_buckets=lvl["accessible_buckets"],
                        accessible_courses=lvl.get("courses", [])
                    )
                    db.add(rule)
                    
            db.commit()
            logger.info(f"Initialized {len(default_levels)} default progression levels in database")
        db.close()
        # Reload cache (avoid recursion infinite loop by checking count inside load not needed if we rely on db state)
        # But load_levels_from_db calls init if empty. So we must be sure we actually added something.
        
        # Manually reload cache logic here or better, call load_levels_from_db but prevent infinite loop
        # Since we just added levels, load_levels_from_db should find them and not call init again.
        load_levels_from_db()
    except Exception as e:
        logger.error(f"Failed to init default levels: {e}")
        # Use defaults in memory as fallback
        level_hierarchy_cache = default_levels

def save_level_to_db(level_data: dict):
    """Save or update a level in the database."""
    try:
        db = SessionLocal()
        existing = db.query(ProgressionLevel).filter(ProgressionLevel.id == level_data["id"]).first()
        if existing:
            existing.name = level_data.get("name", existing.name)
            existing.order = level_data.get("order", existing.order)
            existing.icon = level_data.get("icon", existing.icon)
            existing.color = level_data.get("color", existing.color)
            existing.description = level_data.get("description", existing.description)
            existing.min_nodes = level_data.get("min_nodes", existing.min_nodes)
        else:
            new_lvl = ProgressionLevel(
                id=level_data["id"],
                name=level_data["name"],
                order=level_data.get("order", 0),
                icon=level_data.get("icon", "medal-outline"),
                color=level_data.get("color", "#6B7280"),
                description=level_data.get("description", ""),
                min_nodes=level_data.get("min_nodes", 0)
            )
            db.add(new_lvl)
            db.add(new_lvl)
        
        # Also save AccessRule (courses/buckets)
        # Note: level_data might not have courses/buckets if just updating basic info
        # But if they ARE present, we should save them
        if "courses" in level_data or "accessible_buckets" in level_data:
            rule = db.query(AccessRule).filter(AccessRule.level_name == level_data["name"]).first()
            if not rule:
                rule = AccessRule(level_name=level_data["name"])
                db.add(rule)
            
            if "courses" in level_data:
                rule.accessible_courses = level_data["courses"]
            if "accessible_buckets" in level_data:
                rule.accessible_buckets = level_data["accessible_buckets"]
                
        db.commit()
        db.close()
        load_levels_from_db()  # Refresh cache
        return True
    except Exception as e:
        logger.error(f"Failed to save level to database: {e}")
        return False

def delete_level_from_db(level_id: str):
    """Delete a level from the database."""
    try:
        db = SessionLocal()
        db.query(ProgressionLevel).filter(ProgressionLevel.id == level_id).delete()
        db.commit()
        db.close()
        load_levels_from_db()  # Refresh cache
        return True
    except Exception as e:
        logger.error(f"Failed to delete level from database: {e}")
        return False

def update_level_orders_in_db(level_orders: list):
    """Update order of multiple levels in database."""
    try:
        db = SessionLocal()
        for new_order, level_id in enumerate(level_orders):
            db.query(ProgressionLevel).filter(ProgressionLevel.id == level_id).update({"order": new_order})
        db.commit()
        db.close()
        load_levels_from_db()  # Refresh cache
        return True
    except Exception as e:
        logger.error(f"Failed to update level orders: {e}")
        return False

def get_level_hierarchy() -> list:
    """Get the current level hierarchy sorted by order."""
    if not level_hierarchy_cache:
        load_levels_from_db()
    return sorted(level_hierarchy_cache, key=lambda x: x.get("order", 0))

def get_level_names() -> list:
    """Get ordered list of level names (for backward compatibility)."""
    return [level["name"] for level in get_level_hierarchy()]

def get_level_by_name(name: str) -> dict:
    """Get level by name."""
    for level in get_level_hierarchy():
        if level["name"].lower() == name.lower():
            return level
    return None

def get_level_by_id(level_id: str) -> dict:
    """Get level by ID."""
    for level in get_level_hierarchy():
        if level["id"] == level_id:
            return level
    return None

def get_user_level_index(user_category: str) -> int:
    """Get the index (order) of user's level in the hierarchy. Higher = more access."""
    level = get_level_by_name(user_category)
    if level:
        return level.get("order", 0)
    
    # Unknown category - default to highest if it's a manager/admin role
    lower_cat = user_category.lower() if user_category else ""
    if any(x in lower_cat for x in ["manager", "director", "admin", "superadmin"]):
        hierarchy = get_level_hierarchy()
        return hierarchy[-1]["order"] if hierarchy else 0
    return 0  # Default to lowest level

def get_accessible_levels(user_category: str) -> list:
    """Get list of level names this user can access (their level and all below)."""
    user_order = get_user_level_index(user_category)
    hierarchy = get_level_hierarchy()
    return [level["name"] for level in hierarchy if level.get("order", 0) <= user_order]

def get_accessible_buckets(user_category: str) -> list:
    """Get list of buckets this user can access based on their level."""
    level = get_level_by_name(user_category)
    if level:
        buckets = level.get("accessible_buckets", [])
        if not buckets:  # Empty means full access
            return []
        return buckets
    return []

def filter_courses_by_level(courses: list, user_category: str, is_admin: bool = False) -> list:
    """
    Filter courses based on user's level in the hierarchy.
    - Users can see courses for their level and all lower levels
    - Admin/Manager roles with high-level access can see everything
    - Courses without a target_level are accessible to all
    """
    # Admins and high-level managers see everything
    if is_admin:
        accessible_buckets = get_accessible_buckets(user_category)
        if not accessible_buckets:  # Empty = full access
            return courses
    
    user_level_order = get_user_level_index(user_category)
    accessible_levels = get_accessible_levels(user_category)
    
    filtered = []
    for course in courses:
        # Get course's target level (if specified)
        course_target_level = course.get("target_level") or course.get("targetLevel") or course.get("bucket")
        
        # No target level = accessible to all
        if not course_target_level:
            filtered.append(course)
            continue
        
        # Check if course's target level is in user's accessible levels
        course_target_level_str = str(course_target_level)
        
        # Check by level name
        if course_target_level_str in accessible_levels:
            filtered.append(course)
            continue
        
        # Check by bucket name mapping (bucket might match a level category)
        for level_name in accessible_levels:
            if level_name.lower() in course_target_level_str.lower():
                filtered.append(course)
                break
        else:
            # Check if bucket is in accessible buckets for this level
            accessible_buckets = get_accessible_buckets(user_category)
            if not accessible_buckets:  # Empty means full access
                filtered.append(course)
            elif course_target_level_str in accessible_buckets or any(b.lower() in course_target_level_str.lower() for b in accessible_buckets):
                filtered.append(course)
    
    return filtered

# ===========================================================================
# LEVEL MANAGEMENT API ENDPOINTS
# ===========================================================================

@app.get("/admin/levels")
async def get_levels():
    """Get all levels in the hierarchy (ordered)."""
    return {"levels": get_level_hierarchy()}

@app.post("/admin/levels")
async def create_level(data: dict):
    """Create a new level in the hierarchy (saved to database)."""
    name = data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Level name is required")
    
    # Check if level name already exists
    if get_level_by_name(name):
        raise HTTPException(status_code=400, detail=f"Level '{name}' already exists")
    
    # Get the next order number
    hierarchy = get_level_hierarchy()
    max_order = max([l.get("order", 0) for l in hierarchy], default=-1)
    
    new_level = {
        "id": f"level_{uuid.uuid4().hex[:8]}",
        "name": name,
        "order": data.get("order", max_order + 1),
        "icon": data.get("icon", "medal-outline"),
        "color": data.get("color", "#F59E0B"),
        "description": data.get("description", ""),
        "min_nodes": data.get("min_nodes", 0)
    }
    
    # Save to database
    if save_level_to_db(new_level):
        logger.info(f"New level created and saved to DB: {name} (order: {new_level['order']})")
        return {"status": "success", "level": new_level}
    else:
        raise HTTPException(status_code=500, detail="Failed to save level to database")

@app.put("/admin/levels/{level_id}")
async def update_level(level_id: str, data: dict):
    """Update an existing level (saved to database)."""
    level = get_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    
    # Check if new name conflicts with another level
    if "name" in data:
        existing = get_level_by_name(data["name"])
        if existing and existing["id"] != level_id:
            raise HTTPException(status_code=400, detail=f"Level name '{data['name']}' already exists")
    
    # Build updated level data
    updated_level = {
        "id": level_id,
        "name": data.get("name", level["name"]),
        "order": data.get("order", level["order"]),
        "icon": data.get("icon", level["icon"]),
        "color": data.get("color", level["color"]),
        "description": data.get("description", level.get("description", "")),
        "min_nodes": data.get("min_nodes", level.get("min_nodes", 0))
    }
    
    # Save to database
    if save_level_to_db(updated_level):
        logger.info(f"Level updated and saved to DB: {updated_level['name']}")
        return {"status": "success", "level": updated_level}
    else:
        raise HTTPException(status_code=500, detail="Failed to update level in database")

@app.delete("/admin/levels/{level_id}")
async def delete_level(level_id: str):
    """Delete a level from the hierarchy (from database)."""
    level = get_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    
    level_name = level["name"]
    
    # Delete from database
    if delete_level_from_db(level_id):
        logger.info(f"Level deleted from DB: {level_name}")
        return {"status": "success", "message": f"Level '{level_name}' deleted"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete level from database")

@app.post("/admin/levels/reorder")
async def reorder_levels(data: dict):
    """
    Reorder levels via drag-and-drop (saved to database).
    Expects: {"level_order": ["level_id_1", "level_id_2", ...]}
    """
    level_order = data.get("level_order", [])
    if not level_order:
        raise HTTPException(status_code=400, detail="level_order array is required")
    
    # Validate all level IDs exist
    for level_id in level_order:
        if not get_level_by_id(level_id):
            raise HTTPException(status_code=400, detail=f"Level ID '{level_id}' not found")
    
    # Update order in database
    if update_level_orders_in_db(level_order):
        logger.info(f"Levels reordered and saved to DB: {len(level_order)} levels")
        return {"status": "success", "levels": get_level_hierarchy()}
    else:
        raise HTTPException(status_code=500, detail="Failed to reorder levels in database")

# ===========================================================================
# LEVEL COURSE ASSIGNMENT API ENDPOINTS
# ===========================================================================

@app.get("/admin/levels/{level_id}/courses")
async def get_level_courses(level_id: str):
    """Get courses assigned to a specific level."""
    level = get_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    
    course_ids = level.get("courses", [])
    
    # Get full course details for each ID
    courses = []
    for course_id in course_ids:
        for c in content_store:
            if c.get("id") == course_id:
                courses.append(c)
                break
    
    return {"level": level["name"], "courses": courses}

@app.post("/admin/levels/{level_id}/courses")
async def assign_course_to_level(level_id: str, data: dict):
    """Assign a course to a level."""
    level = get_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    
    course_id = data.get("course_id")
    if not course_id:
        raise HTTPException(status_code=400, detail="course_id is required")
    
    # Initialize courses list if not exists
    if "courses" not in level:
        level["courses"] = []
    
    # Add course if not already assigned
    if course_id not in level["courses"]:
        level["courses"].append(course_id)
        
        # Save to database (will update AccessRule)
        if save_level_to_db(level):
            logger.info(f"Course {course_id} assigned to level {level['name']} and saved to DB")
        else:
             raise HTTPException(status_code=500, detail="Failed to save assignment to database")
    
    return {"status": "success", "level": level}

@app.delete("/admin/levels/{level_id}/courses/{course_id}")
async def remove_course_from_level(level_id: str, course_id: str):
    """Remove a course from a level (saved to database)."""
    level = get_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    
    if "courses" in level and course_id in level["courses"]:
        level["courses"].remove(course_id)
        
        # Save to database (will update AccessRule)
        if save_level_to_db(level):
            logger.info(f"Course {course_id} removed from level {level['name']} and saved to DB")
        else:
            raise HTTPException(status_code=500, detail="Failed to save change to database")
    
    return {"status": "success", "level": level}

@app.post("/admin/levels/{level_id}/courses/reorder")
async def reorder_level_courses(level_id: str, data: dict):
    """
    Reorder courses within a level via drag-and-drop (saved to database).
    Expects: {"course_order": ["course_id_1", "course_id_2", ...]}
    """
    level = get_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    
    course_order = data.get("course_order", [])
    if not course_order:
        raise HTTPException(status_code=400, detail="course_order array is required")
        
    # Validation happens in helper if needed, but here we just update the list
    level["courses"] = course_order
    
    # Save to database (will update AccessRule)
    if save_level_to_db(level):
        logger.info(f"Level {level['name']} courses reordered: {len(course_order)} courses")
        return {"status": "success", "level": level}
    else:
        raise HTTPException(status_code=500, detail="Failed to save reorder to database")
    
    # Update course order
    level["courses"] = course_order
    
    logger.info(f"Courses reordered in level {level['name']}: {len(course_order)} courses")
    return {"status": "success", "level": level}


# --- AUDIT LOG ENDPOINTS ---

@app.get("/audit-logs")
async def get_audit_logs(action_type: Optional[str] = None, db: Session = Depends(get_db)):
    # Try database first
    try:
        db_logs = db_ops.get_audit_logs(db, action=action_type, limit=100)
        logs_list = [db_ops.model_to_dict(log) for log in db_logs]

        # Collect unique action types
        unique_types = list(set([log["action"] for log in logs_list]))

        if action_type:
            return {"logs": logs_list, "action_types": unique_types}

        return {"logs": logs_list, "action_types": unique_types}
    except Exception as e:
        logger.error(f"Error fetching audit logs from DB: {e}")

    # Fallback to in-memory
    unique_types = list(set([log["action"] for log in audit_logs]))

    if action_type:
        filtered = [log for log in audit_logs if log["action"] == action_type]
        return {"logs": filtered, "action_types": unique_types}

    return {"logs": audit_logs, "action_types": unique_types}

# ==========================================
# MEETINGS/VIDEO CALL ENDPOINTS
# ==========================================

@app.get("/meetings")
async def get_meetings():
    """Get all upcoming and ongoing meetings"""
    # Sort by scheduled_at, upcoming first
    return sorted(meetings_store, key=lambda x: x.get('scheduled_at', ''), reverse=False)

@app.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    """Get a specific meeting by ID"""
    for meeting in meetings_store:
        if meeting.get("id") == meeting_id:
            return meeting
    raise HTTPException(status_code=404, detail="Meeting not found")

@app.post("/meetings")
async def create_meeting(
    title: str = Form(...),
    description: str = Form(""),
    scheduled_at: str = Form(...),  # ISO format datetime string
    duration_minutes: int = Form(30),
    host_name: str = Form(...),
    host_email: str = Form(...),
    invited_users: str = Form("[]"),  # JSON array of user emails OR "all" for everyone
    db: Session = Depends(get_db)
):
    """Create a new virtual meeting and notify invited users"""
    try:
        meeting_id = str(uuid.uuid4())
        room_id = f"bw-meeting-{meeting_id[:8]}"  # Short room ID for joining

        # Parse invited users list
        try:
            invited_users_list = json.loads(invited_users) if invited_users and invited_users != "all" else []
        except:
            invited_users_list = []

        invite_all = len(invited_users_list) == 0  # If no specific users, invite all

        # Create meeting in DATABASE
        meeting_data = {
            "id": meeting_id,
            "title": title,
            "description": description,
            "scheduled_at": datetime.fromisoformat(scheduled_at) if scheduled_at else datetime.now(),
            "duration_minutes": duration_minutes,
            "host_name": host_name,
            "host_email": host_email,
            "room_id": room_id,
            "status": "scheduled",
            "participants": []
        }

        try:
            db_meeting = db_ops.create_meeting(db, meeting_data)
        except Exception as db_error:
            logger.error(f"Database meeting error: {db_error}")
            db.rollback()
            # Continue with in-memory tracking

        # Also store in memory for backward compatibility
        new_meeting = {
            **meeting_data,
            "scheduled_at": scheduled_at,
            "created_at": datetime.now().isoformat(),
            "invited_users": invited_users_list,
            "invite_all": invite_all
        }

        meetings_store.insert(0, new_meeting)
        logger.info(f"Meeting Created: {title} scheduled for {scheduled_at} by {host_name} (invite_all={invite_all}, invited={len(invited_users_list)} users)")

        # Broadcast meeting notification to all connected clients
        await manager.broadcast({
            "type": "MEETING_SCHEDULED",
            "data": new_meeting
        })

        # Create notification entry
        meeting_notif = {
            "id": str(uuid.uuid4()),
            "title": f"📅 Meeting: {title}",
            "message": f"{host_name} scheduled a meeting for {scheduled_at[:16].replace('T', ' at ')}. Tap to join when it starts.",
            "type": "meeting",
            "meeting_id": meeting_id,
            "created_at": datetime.now().isoformat(),
            "read_by": [],
            "invited_users": invited_users_list,
            "invite_all": invite_all
        }
        notification_store.append(meeting_notif)

        # Broadcast notification (frontend will filter based on invited_users)
        await manager.broadcast({
            "type": "NOTIFICATION",
            "data": meeting_notif
        })

        return {"status": "success", "meeting": new_meeting}

    except Exception as e:
        logger.error(f"Error creating meeting: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create meeting: {str(e)}")

@app.post("/meetings/{meeting_id}/join")
async def join_meeting(
    meeting_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...)
):
    """Mark a user as joined a meeting"""
    for meeting in meetings_store:
        if meeting.get("id") == meeting_id:
            # Check if already joined
            for p in meeting.get("participants", []):
                if p.get("user_email") == user_email:
                    return {"status": "success", "message": "Already joined", "meeting": meeting}
            
            # Add participant
            meeting["participants"].append({
                "user_email": user_email,
                "user_name": user_name,
                "joined_at": datetime.now().isoformat()
            })
            
            # Update status to ongoing if first participant
            if meeting["status"] == "scheduled":
                meeting["status"] = "ongoing"
            
            logger.info(f"User {user_name} joined meeting: {meeting['title']}")
            
            # Broadcast participant joined
            await manager.broadcast({
                "type": "MEETING_PARTICIPANT_JOINED",
                "data": {
                    "meeting_id": meeting_id,
                    "participant": {"user_email": user_email, "user_name": user_name}
                }
            })
            
            return {"status": "success", "meeting": meeting}
    
    raise HTTPException(status_code=404, detail="Meeting not found")

@app.post("/meetings/{meeting_id}/leave")
async def leave_meeting(
    meeting_id: str,
    user_email: str = Form(...)
):
    """Mark a user as left a meeting"""
    for meeting in meetings_store:
        if meeting.get("id") == meeting_id:
            meeting["participants"] = [
                p for p in meeting.get("participants", [])
                if p.get("user_email") != user_email
            ]
            
            # If no participants left and host also left, end meeting
            if len(meeting["participants"]) == 0:
                meeting["status"] = "ended"
            
            logger.info(f"User {user_email} left meeting: {meeting['title']}")
            return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Meeting not found")

@app.put("/meetings/{meeting_id}/end")
async def end_meeting(meeting_id: str):
    """End a meeting (host only)"""
    for meeting in meetings_store:
        if meeting.get("id") == meeting_id:
            meeting["status"] = "ended"
            logger.info(f"Meeting ended: {meeting['title']}")
            
            await manager.broadcast({
                "type": "MEETING_ENDED",
                "data": {"meeting_id": meeting_id, "title": meeting["title"]}
            })
            
            return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Meeting not found")

@app.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str):
    """Cancel/delete a meeting"""
    global meetings_store
    initial_len = len(meetings_store)
    meetings_store = [m for m in meetings_store if m.get("id") != meeting_id]
    
    if len(meetings_store) < initial_len:
        logger.info(f"Meeting Deleted: {meeting_id}")
        return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Meeting not found")


@app.get("/crm/tickets")
async def get_crm_tickets(db: Session = Depends(get_db)):
    """Get all CRM tickets (for admin/manager)"""
    try:
        db_tickets = db_ops.get_all_crm_tickets(db)
        tickets_list = [db_ops.model_to_dict(t) for t in db_tickets]
        # Also include in-memory for backward compatibility
        return tickets_list if tickets_list else crm_tickets
    except Exception as e:
        logger.error(f"Error fetching CRM tickets from DB: {e}")
        return crm_tickets

@app.get("/crm/tickets/available")
async def get_available_tickets(category_id: str = None, db: Session = Depends(get_db)):
    """Get unassigned tickets, optionally filtered by category"""
    try:
        db_tickets = db_ops.get_all_crm_tickets(db, status="open")
        available = [db_ops.model_to_dict(t) for t in db_tickets if t.assigned_to is None]
        if category_id:
            available = [t for t in available if t.get("category_id") == category_id]
        return available if available else [t for t in crm_tickets if t.get("status") == "open" and t.get("assigned_to") is None and (not category_id or t.get("category_id") == category_id)]
    except Exception as e:
        logger.error(f"Error fetching available tickets from DB: {e}")
        available = [t for t in crm_tickets if t.get("status") == "open" and t.get("assigned_to") is None]
        if category_id:
            available = [t for t in available if t.get("category_id") == category_id]
        return available

@app.get("/crm/tickets/{ticket_id}")
async def get_ticket_by_id(ticket_id: str, db: Session = Depends(get_db)):
    """Get a specific ticket by ID"""
    try:
        db_ticket = db_ops.get_crm_ticket_by_id(db, ticket_id)
        if db_ticket:
            return db_ops.model_to_dict(db_ticket)
    except Exception as e:
        logger.error(f"Error fetching ticket from DB: {e}")

    # Fallback to in-memory
    for ticket in crm_tickets:
        if ticket.get("id") == ticket_id:
            return ticket
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.post("/crm/tickets")
async def create_crm_ticket(
    type: str = Form(...),  # Query, Request, Complaint
    category_id: str = Form(...),
    customer_name: str = Form(...),
    customer_email: str = Form(""),
    customer_phone: str = Form(""),
    subject: str = Form(...),
    description: str = Form(...),
    priority: str = Form("medium"),  # low, medium, high, critical
    db: Session = Depends(get_db)
):
    """Manager creates a new CRM ticket"""
    new_ticket = {
        "id": f"crm-{str(uuid.uuid4())[:8]}",
        "type": type,
        "category_id": category_id,
        "customer_name": customer_name,
        "customer_email": customer_email,
        "customer_phone": customer_phone,
        "subject": subject,
        "description": description,
        "priority": priority,
        "status": "open",
        "created_at": datetime.now(),
        "assigned_to": None
    }

    # Save to database
    try:
        db_ticket = db_ops.create_crm_ticket(db, new_ticket)
        new_ticket["created_at"] = new_ticket["created_at"].isoformat()
        logger.info(f"CRM Ticket Created in DB: {new_ticket['id']} - {subject}")
    except Exception as e:
        logger.error(f"Error creating CRM ticket in DB: {e}")
        db.rollback()
        new_ticket["created_at"] = new_ticket["created_at"].isoformat()

    # Also keep in memory for backward compatibility
    crm_tickets.append(new_ticket)
    logger.info(f"CRM Ticket Created: {new_ticket['id']} - {subject}")
    return {"status": "success", "ticket": new_ticket}

@app.post("/crm/assign-task")
async def assign_crm_task(
    user_email: str = Form(...),
    user_name: str = Form(...),
    category_id: str = Form(...),  # Course category they completed
    db: Session = Depends(get_db)
):
    """Assign an available CRM ticket to user after course completion

    Smart matching based on course type:
    - Safety & Hygiene (3) or Customer Service (4) → Complaint tickets
    - Other courses (1, 2, 5) → Query or Request tickets
    """
    # Get allowed ticket types for this course category
    allowed_types = COURSE_TO_TICKET_TYPE.get(category_id, ["Query", "Request"])

    # Try to find from database first
    try:
        db_tickets = db_ops.get_all_crm_tickets(db, status="open")
        available_tickets_db = [
            db_ops.model_to_dict(t) for t in db_tickets
            if t.type in allowed_types and t.assigned_to is None
        ]
        if not available_tickets_db:
            # Fallback: Try any open ticket
            available_tickets_db = [
                db_ops.model_to_dict(t) for t in db_tickets
                if t.assigned_to is None
            ]
        available_tickets = available_tickets_db if available_tickets_db else []
    except Exception as e:
        logger.error(f"Error fetching tickets from DB: {e}")
        available_tickets = []

    # Fallback to in-memory if no DB tickets
    if not available_tickets:
        available_tickets = [
            t for t in crm_tickets
            if t.get("type") in allowed_types
            and t.get("status") == "open"
            and t.get("assigned_to") is None
        ]
        if not available_tickets:
            available_tickets = [t for t in crm_tickets if t.get("status") == "open" and t.get("assigned_to") is None]

    if not available_tickets:
        return {"status": "no_tickets", "message": "No tickets available for assignment"}

    # Pick the first available (could be randomized)
    ticket = available_tickets[0]

    # Create assignment
    assignment = {
        "id": f"task-{str(uuid.uuid4())[:8]}",
        "ticket_id": ticket["id"],
        "user_email": user_email,
        "user_name": user_name,
        "course_category_id": category_id,
        "assigned_at": datetime.now(),
        "status": "assigned",
        "resolution": None,
        "completed_at": None,
        "xp_earned": 0
    }

    # Save to database
    try:
        db_assignment = db_ops.create_crm_task_assignment(db, assignment)
        assignment["assigned_at"] = assignment["assigned_at"].isoformat()

        # Update ticket in database
        db_ops.update_crm_ticket(db, ticket["id"], {
            "assigned_to": user_email,
            "status": "in_progress"
        })
        logger.info(f"CRM Task Assigned in DB: {assignment['id']} to {user_email}")
    except Exception as e:
        logger.error(f"Error creating assignment in DB: {e}")
        db.rollback()
        assignment["assigned_at"] = assignment["assigned_at"].isoformat()

    # Also keep in memory for backward compatibility
    crm_task_assignments.append(assignment)

    # Mark ticket as assigned in memory
    ticket["assigned_to"] = user_email
    ticket["status"] = "in_progress"

    logger.info(f"CRM Task Assigned: {assignment['id']} to {user_email}")
    
    # Broadcast notification to user
    notification = {
        "id": str(uuid.uuid4()),
        "type": "crm_task",
        "title": "🎯 Live Assessment Assigned!",
        "description": f"Complete this real customer ticket: {ticket['subject']}",
        "timestamp": datetime.now().isoformat(),
        "read": False,
        "task_id": assignment["id"],
        "ticket": ticket
    }
    notification_store.append(notification)
    
    await manager.broadcast({
        "type": "CRM_TASK_ASSIGNED",
        "data": {
            "assignment": assignment,
            "ticket": ticket,
            "notification": notification
        }
    })
    
    return {"status": "success", "assignment": assignment, "ticket": ticket}

@app.get("/crm/my-tasks")
async def get_my_crm_tasks(user_email: str, db: Session = Depends(get_db)):
    """Get all CRM tasks assigned to a user"""
    my_tasks = []

    # Try database first
    try:
        db_tasks = db_ops.get_user_crm_tasks(db, user_email)
        for assignment in db_tasks:
            assignment_dict = db_ops.model_to_dict(assignment)
            # Attach ticket details
            ticket_db = db_ops.get_crm_ticket_by_id(db, assignment.ticket_id) if assignment.ticket_id else None
            assignment_dict["ticket"] = db_ops.model_to_dict(ticket_db) if ticket_db else None
            my_tasks.append(assignment_dict)
    except Exception as e:
        logger.error(f"Error fetching user tasks from DB: {e}")

    # Fallback to in-memory if no DB tasks
    if not my_tasks:
        for assignment in crm_task_assignments:
            if assignment.get("user_email") == user_email:
                # Attach ticket details
                ticket = next((t for t in crm_tickets if t.get("id") == assignment.get("ticket_id")), None)
                my_tasks.append({
                    **assignment,
                    "ticket": ticket
                })

    return my_tasks

@app.post("/crm/tasks/{task_id}/complete")
async def complete_crm_task(
    task_id: str,
    resolution: str = Form(...),
    db: Session = Depends(get_db)
):
    """Complete a CRM task with resolution - awards 50 XP"""
    XP_REWARD = 50

    # Try database first
    try:
        db_task = db_ops.get_crm_task_by_id(db, task_id)
        if db_task:
            # Update task
            db_ops.update_crm_task(db, task_id, {
                "status": "completed",
                "resolution": resolution,
                "completed_at": datetime.now(),
                "xp_earned": XP_REWARD
            })

            # Update ticket status
            if db_task.ticket_id:
                db_ops.update_crm_ticket(db, db_task.ticket_id, {"status": "resolved"})

            assignment = db_ops.model_to_dict(db_task)
            assignment["status"] = "completed"
            assignment["resolution"] = resolution
            assignment["completed_at"] = datetime.now().isoformat()
            assignment["xp_earned"] = XP_REWARD

            logger.info(f"CRM Task Completed in DB: {task_id} - Awarded {XP_REWARD} XP")

            # Update in-memory as well
            for mem_assignment in crm_task_assignments:
                if mem_assignment.get("id") == task_id:
                    mem_assignment["status"] = "completed"
                    mem_assignment["resolution"] = resolution
                    mem_assignment["completed_at"] = assignment["completed_at"]
                    mem_assignment["xp_earned"] = XP_REWARD
                    break

            # Broadcast completion
            await manager.broadcast({
                "type": "CRM_TASK_COMPLETED",
                "data": {
                    "task_id": task_id,
                    "user_email": assignment.get("user_email"),
                    "xp_earned": XP_REWARD
                }
            })

            return {
                "status": "success",
                "message": f"Task completed! You earned {XP_REWARD} XP",
                "xp_earned": XP_REWARD,
                "assignment": assignment
            }
    except Exception as e:
        logger.error(f"Error completing task in DB: {e}")
        db.rollback()

    # Fallback to in-memory
    for assignment in crm_task_assignments:
        if assignment.get("id") == task_id:
            assignment["status"] = "completed"
            assignment["resolution"] = resolution
            assignment["completed_at"] = datetime.now().isoformat()
            assignment["xp_earned"] = XP_REWARD

            # Update ticket status
            for ticket in crm_tickets:
                if ticket.get("id") == assignment.get("ticket_id"):
                    ticket["status"] = "resolved"
                    break

            logger.info(f"CRM Task Completed: {task_id} - Awarded {XP_REWARD} XP")

            # Broadcast completion
            await manager.broadcast({
                "type": "CRM_TASK_COMPLETED",
                "data": {
                    "task_id": task_id,
                    "user_email": assignment.get("user_email"),
                    "xp_earned": XP_REWARD
                }
            })

            return {
                "status": "success",
                "message": f"Task completed! You earned {XP_REWARD} XP",
                "xp_earned": XP_REWARD,
                "assignment": assignment
            }

    raise HTTPException(status_code=404, detail="Task not found")

@app.delete("/crm/tickets/{ticket_id}")
async def delete_crm_ticket(ticket_id: str, db: Session = Depends(get_db)):
    """Delete a CRM ticket (admin only)"""
    global crm_tickets

    # Delete from database
    try:
        db_deleted = db_ops.delete_crm_ticket(db, ticket_id)
        if db_deleted:
            logger.info(f"CRM Ticket Deleted from DB: {ticket_id}")
    except Exception as e:
        logger.error(f"Error deleting CRM ticket from DB: {e}")
        db.rollback()

    # Also delete from in-memory
    initial_len = len(crm_tickets)
    crm_tickets = [t for t in crm_tickets if t.get("id") != ticket_id]

    if len(crm_tickets) < initial_len:
        logger.info(f"CRM Ticket Deleted: {ticket_id}")
        return {"status": "success"}

    raise HTTPException(status_code=404, detail="Ticket not found")

# --- KNOWLEDGE BASE ENDPOINTS ---

@app.get("/resources/categories")
async def get_resource_categories():
    return resource_categories

@app.post("/resources/category")
async def create_category(name: str = Form(...), icon: str = Form(...), color1: str = Form(...), color2: str = Form(...)):
    new_cat = {
        "id": str(uuid.uuid4()),
        "name": name,
        "icon": icon,
        "color": [color1, color2],
        "bg": "#F3F4F6" # Default bg
    }
    resource_categories.append(new_cat)
    return {"status": "success", "category": new_cat}

@app.get("/resources")
async def get_resources(db: Session = Depends(get_db)):
    # Try database first
    try:
        db_resources = db_ops.get_all_resources(db)
        resources_list = [db_ops.model_to_dict(r) for r in db_resources]
        return resources_list if resources_list else resource_store
    except Exception as e:
        logger.error(f"Error fetching resources from DB: {e}")
        return resource_store

# --- COURSE BUCKETS ENDPOINTS ---

@app.get("/course-buckets")
async def get_course_buckets(db: Session = Depends(get_db)):
    """Get all course buckets for organizing courses"""
    # Try database first
    try:
        db_buckets = db_ops.get_all_course_buckets(db)
        if db_buckets:
            buckets = [db_ops.model_to_dict(b) for b in db_buckets]
            # Convert datetime objects to strings
            for b in buckets:
                if b.get("created_at") and hasattr(b["created_at"], "isoformat"):
                    b["created_at"] = b["created_at"].isoformat()
            # Merge with in-memory (for backward compatibility)
            existing_ids = {b["id"] for b in buckets}
            for b in course_buckets:
                if b.get("id") not in existing_ids:
                    buckets.append(b)
            return buckets
    except Exception as e:
        logger.error(f"Error fetching course buckets from DB: {e}")
    return course_buckets

@app.post("/course-buckets")
async def create_course_bucket(
    name: str = Form(...),
    description: str = Form(""),
    color: str = Form("#6366F1"),
    icon: str = Form("folder"),
    db: Session = Depends(get_db)
):
    """Create a new course bucket"""
    new_id = str(uuid.uuid4())
    new_bucket = {
        "id": new_id,
        "name": name,
        "description": description,
        "color": color,
        "icon": icon
    }

    # Save to database
    try:
        db_ops.create_course_bucket(db, new_bucket)
        logger.info(f"Course Bucket saved to DB: {new_id}")
    except Exception as e:
        logger.error(f"Error saving course bucket to DB: {e}")

    # Also keep in memory for backward compatibility
    course_buckets.append(new_bucket)
    logger.info(f"Course Bucket Created: {name}")
    return {"status": "success", "bucket": new_bucket}

@app.put("/course-buckets/{bucket_id}")
async def update_course_bucket(
    bucket_id: str,
    name: str = Form(None),
    description: str = Form(None),
    color: str = Form(None),
    icon: str = Form(None),
    db: Session = Depends(get_db)
):
    """Update an existing course bucket"""
    updates = {}
    if name is not None: updates["name"] = name
    if description is not None: updates["description"] = description
    if color is not None: updates["color"] = color
    if icon is not None: updates["icon"] = icon

    # Update in database
    db_bucket = db_ops.update_course_bucket(db, bucket_id, updates)

    # Also update in-memory
    for bucket in course_buckets:
        if bucket.get("id") == bucket_id:
            if name is not None: bucket["name"] = name
            if description is not None: bucket["description"] = description
            if color is not None: bucket["color"] = color
            if icon is not None: bucket["icon"] = icon
            logger.info(f"Course Bucket Updated: {bucket_id}")
            return {"status": "success", "bucket": bucket}

    if db_bucket:
        logger.info(f"Course Bucket Updated in DB: {bucket_id}")
        return {"status": "success", "bucket": db_ops.model_to_dict(db_bucket)}

    raise HTTPException(status_code=404, detail="Bucket not found")

@app.delete("/course-buckets/{bucket_id}")
async def delete_course_bucket(bucket_id: str, db: Session = Depends(get_db)):
    """Delete a course bucket"""
    global course_buckets

    # Delete from database
    db_deleted = db_ops.delete_course_bucket(db, bucket_id)

    # Also delete from in-memory
    initial_len = len(course_buckets)
    course_buckets = [b for b in course_buckets if b.get("id") != bucket_id]

    if db_deleted or len(course_buckets) < initial_len:
        logger.info(f"Course Bucket Deleted: {bucket_id}")
        return {"status": "success"}

    raise HTTPException(status_code=404, detail="Bucket not found")

# ==========================================
# HIERARCHY & ACCESS CONTROL ENDPOINTS
# ==========================================

@app.get("/admin/hierarchy")
async def get_hierarchy():
    """Get the organizational hierarchy structure"""
    return sorted(hierarchy_store, key=lambda x: x.get("order", 999))

@app.post("/admin/hierarchy")
async def update_hierarchy(roles: str = Form(...)):
    """Update the entire hierarchy structure (JSON array of roles)"""
    global hierarchy_store
    try:
        new_hierarchy = json.loads(roles)
        # Validate and assign order
        for i, role in enumerate(new_hierarchy):
            if "id" not in role:
                role["id"] = str(uuid.uuid4())
            role["order"] = i + 1
        hierarchy_store = new_hierarchy
        logger.info(f"Hierarchy updated with {len(new_hierarchy)} roles")
        return {"status": "success", "hierarchy": hierarchy_store}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")

@app.post("/admin/hierarchy/role")
async def add_hierarchy_role(
    role: str = Form(...),
    name: str = Form(...),
    icon: str = Form("account"),
    color: str = Form("#6B7280"),
    order: int = Form(None)
):
    """Add a new role to the hierarchy"""
    new_role = {
        "id": str(uuid.uuid4()),
        "role": role,
        "name": name,
        "icon": icon,
        "color": color,
        "order": order if order else len(hierarchy_store) + 1
    }
    hierarchy_store.append(new_role)
    hierarchy_store.sort(key=lambda x: x.get("order", 999))
    logger.info(f"Hierarchy role added: {role}")
    return {"status": "success", "role": new_role}

@app.delete("/admin/hierarchy/role/{role_id}")
async def delete_hierarchy_role(role_id: str):
    """Delete a role from the hierarchy"""
    global hierarchy_store
    initial_len = len(hierarchy_store)
    hierarchy_store = [r for r in hierarchy_store if r.get("id") != role_id]
    
    if len(hierarchy_store) < initial_len:
        # Re-order remaining roles
        for i, role in enumerate(hierarchy_store):
            role["order"] = i + 1
        logger.info(f"Hierarchy role deleted: {role_id}")
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Role not found")

@app.get("/admin/level-config")
async def get_level_config():
    """Get level requirements configuration"""
    return level_config_store

@app.post("/admin/level-config")
async def update_level_config(config: str = Form(...)):
    """Update level configuration (JSON object)"""
    global level_config_store
    try:
        new_config = json.loads(config)
        level_config_store = new_config
        logger.info("Level configuration updated")
        return {"status": "success", "config": level_config_store}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")

@app.post("/admin/level-config/{level_name}")
async def update_single_level_config(
    level_name: str,
    min_nodes: int = Form(...),
    description: str = Form(None),
    next_level: str = Form(None)
):
    """Update a single level's configuration"""
    if level_name not in level_config_store:
        level_config_store[level_name] = {
            "min_nodes": min_nodes,
            "description": description or f"Level: {level_name}",
            "icon": "medal-outline",
            "color": "#6B7280",
            "next_level": next_level
        }
    else:
        level_config_store[level_name]["min_nodes"] = min_nodes
        if description:
            level_config_store[level_name]["description"] = description
        if next_level:
            level_config_store[level_name]["next_level"] = next_level
    
    logger.info(f"Level config updated for {level_name}: min_nodes={min_nodes}")
    return {"status": "success", "level": level_name, "config": level_config_store[level_name]}

@app.get("/admin/access-rules")
async def get_access_rules(db: Session = Depends(get_db)):
    """
    Get access control rules for all roles.
    Includes validation to remove deleted course IDs.
    """
    global access_control_store
    
    try:
        # 1. Get all valid content IDs from DB
        valid_content_ids = {c.id for c in db.query(DBContent.id).all()}
        
        # 2. Get all access rules from DB
        db_rules = db.query(AccessRule).all()
        start_count = 0
        end_count = 0
        dirty = False
        
        cleaned_rules = {}
        
        for rule in db_rules:
            current_courses = rule.accessible_courses or []
            start_count += len(current_courses)
            
            # Filter out deleted courses
            valid_courses = [cid for cid in current_courses if cid in valid_content_ids]
            end_count += len(valid_courses)
            
            # If changes detected, update DB record
            if len(valid_courses) < len(current_courses):
                rule.accessible_courses = valid_courses
                dirty = True
            
            # Build clean dictionary for response
            cleaned_rules[rule.level_name] = {
                "accessible_courses": valid_courses,
                "accessible_buckets": rule.accessible_buckets or [],
                "max_courses_visible": rule.max_courses_visible or -1
            }
            
        if dirty:
            db.commit()
            logger.info(f"Cleaned up access rules: Removed {start_count - end_count} invalid course references")
            
            # Update in-memory store
            access_control_store = cleaned_rules
            
        # If DB was empty or incomplete, merge with in-memory (but this shouldn't happen usually)
        if not cleaned_rules:
             return access_control_store

        return cleaned_rules
        
    except Exception as e:
        logger.error(f"Error cleaning access rules: {e}")
        # Fallback to in-memory store if DB fails
        return access_control_store

@app.post("/admin/access-rules")
async def update_access_rules(rules: str = Form(...)):
    """Update all access control rules (JSON object) - persisted to database"""
    global access_control_store
    try:
        new_rules = json.loads(rules)
        
        # Save each rule to database
        for level_name, rule_data in new_rules.items():
            accessible_courses = rule_data.get("accessible_courses", [])
            accessible_buckets = rule_data.get("accessible_buckets", [])
            max_courses_visible = rule_data.get("max_courses_visible", -1)
            
            save_access_rule_to_db(level_name, accessible_courses, accessible_buckets, max_courses_visible)
        
        # Update in-memory store
        access_control_store = new_rules
        logger.info("Access control rules updated and saved to database")
        return {"status": "success", "rules": access_control_store}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")

@app.post("/admin/access-rules/{role_name}")
async def update_role_access(
    role_name: str,
    accessible_courses: str = Form("[]"),  # JSON array of course IDs
    accessible_buckets: str = Form("[]"),  # JSON array of bucket IDs
    max_courses_visible: int = Form(-1)
):
    """Update access rules for a specific role - persisted to database"""
    try:
        courses = json.loads(accessible_courses)
        buckets = json.loads(accessible_buckets)
        
        # Save to database (this also updates in-memory store)
        success = save_access_rule_to_db(role_name, courses, buckets, max_courses_visible)
        
        if success:
            logger.info(f"Access rules updated and saved to database for {role_name}")
            return {"status": "success", "role": role_name, "rules": access_control_store[role_name]}
        else:
            raise HTTPException(status_code=500, detail="Failed to save access rule to database")
            
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")

@app.get("/content")
async def get_all_content_api(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Get Content with Strict Access Control.
    - If Authorization header present: Filters based on User Role.
    - If No Header: Returns ALL (for Admin Panel/Legacy).
    """
    try:
        # 1. Fetch all content first
        db_content = db_ops.get_all_content(db)
        
        # 2. Check Authentication & Apply Filtering
        if authorization:
            try:
                token = authorization.split(" ")[1]
                payload = verify_token(token)
                if payload:
                    email = payload.get("sub")
                    user = db_ops.get_user_by_email(db, email)
                    
                    # If user exists and is NOT an Admin/Manager, apply filters
                    # "Store Manager", "CEO", "Super Admin" bypass filters
                    if user and user.role not in ["Store Manager", "CEO", "Super Admin", "Admin", "Shift Manager"]:
                        # Strict Filtering for basic roles (Waffler, Silver, Gold)
                        rules = db_ops.get_access_rule_by_level(db, user.role)
                        
                        if rules:
                            allowed_courses = rules.accessible_courses or []
                            allowed_buckets = rules.accessible_buckets or []
                            
                            # Log for debug
                            # logger.info(f"Filtering content for {user.role}: Allowed Courses={len(allowed_courses)}, Buckets={len(allowed_buckets)}")
                            
                            filtered_content = []
                            for c in db_content:
                                # Strict check: ID or Bucket must match
                                if c.id in allowed_courses or c.bucket in allowed_buckets:
                                    filtered_content.append(c)
                            
                            db_content = filtered_content
                        else:
                            # No rules defined for this role -> Show NOTHING (Strict)
                            db_content = []
            except Exception as e:
                logger.warning(f"Auth check failed in /content: {e}")
                # If token invalid, proceed as unauthenticated (or could block, but keeping legacy safe)

        content_list = []
        for item in db_content:
            content_list.append({
                "id": item.id,
                "title": item.title,
                "description": item.description or "",
                "bucket": item.bucket,
                "videoUrl": item.video_url or item.file_url or "",
                "file_url": item.video_url or item.file_url or "",
                "audio_url": getattr(item, 'audio_url', None),
                "thumbnail_url": item.thumbnail,
                "learning_path_type": item.learning_path_type or "career_progression",
                "isPathNode": item.is_path_node or False,
                "timestamp": item.timestamp.isoformat() if item.timestamp else datetime.now().isoformat(),
                "duration": "30s",
                "authorRole": "Store Manager",
                "resource_type": "Store Manager",
                "transcript": item.transcript or "",
                "quiz": item.quiz,
                "bucket_id": item.bucket
            })
            
        return content_list
        
    except Exception as e:
        logger.error(f"Error fetching all content: {e}")
        return content_store

@app.get("/admin/access-rules")
async def get_all_access_rules(db: Session = Depends(get_db)):
    """
    Get ALL access rules for all levels from database.
    Returns: { "Waffler": { accessible_courses: [...], ... }, "Silver Waffler": {...}, ... }
    """
    try:
        # First, try to get from database
        from models import AccessRule
        db_rules = db.query(AccessRule).all()
        
        result = {}
        for rule in db_rules:
            result[rule.level_name] = {
                "accessible_courses": rule.accessible_courses or [],
                "accessible_buckets": rule.accessible_buckets or [],
                "max_courses_visible": rule.max_courses_visible or -1
            }
        
        # Merge with in-memory store (for any levels not in DB yet)
        for level_name, rules in access_control_store.items():
            if level_name not in result:
                result[level_name] = rules
        
        logger.info(f"Returning {len(result)} access rules")
        return result
        
    except Exception as e:
        logger.error(f"Error fetching all access rules: {e}")
        # Fallback to in-memory store
        return access_control_store

@app.post("/admin/access-rules/{level_name}")
async def save_level_access_rules(
    level_name: str,
    accessible_courses: str = Form("[]"),
    accessible_buckets: str = Form("[]"),
    max_courses_visible: int = Form(-1),
    db: Session = Depends(get_db)
):
    """
    Save access rules for a specific level to database.
    Called by Admin Panel when saving curriculum assignments.
    """
    global access_control_store
    try:
        courses = json.loads(accessible_courses)
        buckets = json.loads(accessible_buckets) if accessible_buckets else []
        
        # Save to database using db_ops
        rule = db_ops.create_or_update_access_rule(
            db, 
            level_name,
            courses,
            buckets,
            max_courses_visible
        )
        
        # Also update in-memory store for immediate effect
        access_control_store[level_name] = {
            "accessible_courses": courses,
            "accessible_buckets": buckets,
            "max_courses_visible": max_courses_visible
        }
        
        logger.info(f"Access rules saved for {level_name}: {len(courses)} courses, {len(buckets)} buckets")
        
        return {
            "status": "success",
            "level": level_name,
            "courses_count": len(courses),
            "buckets_count": len(buckets)
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error saving access rules: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON format for courses/buckets")
    except Exception as e:
        logger.error(f"Error saving access rules for {level_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save access rules: {str(e)}")

@app.get("/admin/access-rules/{role_name}/courses")
async def get_accessible_courses_for_role(role_name: str):
    """Get list of accessible courses for a specific role"""
    rules = access_control_store.get(role_name)
    
    if not rules:
        # Role has full access
        return {"role": role_name, "full_access": True, "courses": content_store}
    
    accessible_courses = []
    accessible_buckets = rules.get("accessible_buckets", [])
    specific_courses = rules.get("accessible_courses", [])
    max_visible = rules.get("max_courses_visible", -1)
    
    # Get courses from accessible buckets
    for item in content_store:
        if item.get("isPathNode", False):
            bucket_id = item.get("bucket")
            course_id = item.get("id")
            
            # Check if specifically allowed OR in an accessible bucket
            if course_id in specific_courses or bucket_id in accessible_buckets:
                accessible_courses.append(item)
    
    # Apply max visible limit if set
    if max_visible > 0:
        accessible_courses = accessible_courses[:max_visible]
    
    return {"role": role_name, "full_access": False, "courses": accessible_courses}

@app.get("/learning-paths/content/{path_type}")
async def get_learning_path_content_endpoint(
    path_type: str,
    user_email: str = "user",
    db: Session = Depends(get_db)
):
    """
    Get courses for a learning path type (self_learning or career_progression).
    Returns all courses with completion status for the given user.
    """
    try:
        from sqlalchemy import or_
        from models import Content as DBContent
        
        # Get user's role
        user = db_ops.get_user_by_email(db, user_email)
        user_role = user.role if user else "Waffler"
        
        # Fetch courses based on path type - PROPER SEPARATION
        if path_type == "self_learning":
            # Self-learning ONLY shows self_learning courses
            courses = db.query(DBContent).filter(
                DBContent.learning_path_type == "self_learning"
            ).order_by(DBContent.timestamp).all()
        else:
            # Career progression - shows career_progression courses OR unspecified (NULL/empty)
            # Excludes self_learning courses
            courses = db.query(DBContent).filter(
                or_(
                    DBContent.learning_path_type == "career_progression",
                    DBContent.learning_path_type == None,
                    DBContent.learning_path_type == ""
                )
            ).order_by(DBContent.timestamp).all()
        
        # Get user's completed course IDs
        user_completed_ids = set()
        try:
            user_completed_ids = db_ops.get_user_completed_course_ids(db, user_email)
            node_ids = db_ops.get_user_completed_node_ids(db, user_email)
            user_completed_ids = user_completed_ids.union(node_ids)
        except:
            pass
        
        # Build response with status
        response_courses = []
        found_active = False
        
        for i, course in enumerate(courses):
            is_completed = course.id in user_completed_ids
            
            # Sequential unlocking for self_learning
            if path_type == "self_learning":
                if is_completed:
                    status = "completed"
                elif not found_active:
                    status = "active"
                    found_active = True
                else:
                    status = "locked"
            else:
                # Career progression - status determined by frontend
                status = "completed" if is_completed else "active"
            
            response_courses.append({
                "id": course.id,
                "title": course.title,
                "description": course.description or "",
                "bucket": course.bucket,
                "videoUrl": course.video_url or course.file_url or "",
                "thumbnail_url": course.thumbnail,
                "learning_path_type": course.learning_path_type or "career_progression",
                "timestamp": course.timestamp.isoformat() if course.timestamp else None,
                "status": status,
                "xp": 50,
                "transcript": course.transcript or "",
                "quiz": course.quiz
            })
        
        return {
            "is_locked": False,
            "courses": response_courses,
            "total": len(response_courses)
        }
        
    except Exception as e:
        logger.error(f"Error getting learning path content: {e}")
        return {"is_locked": False, "courses": [], "total": 0}

@app.get("/user/level-progress/{user_email}")
async def get_user_level_progress(user_email: str, db: Session = Depends(get_db)):
    """Get user's current level and progress to next level - OPTIMIZED with DB queries"""
    return db_ops.get_user_level_progress(db, user_email)

@app.post("/user/check-level-up/{user_email}")
async def check_and_apply_level_up(user_email: str, db: Session = Depends(get_db)):
    """Check if user qualifies for level up and apply it - OPTIMIZED with DB queries"""
    progress = db_ops.get_user_level_progress(db, user_email)

    # Check if user can progress (all required courses completed)
    nodes_completed = progress.get("nodes_completed_in_level", 0)
    nodes_required = progress.get("nodes_required_in_level", 0)
    can_progress = progress.get("next_level") is not None and nodes_required > 0 and nodes_completed >= nodes_required

    if can_progress:
        new_level = progress.get("next_level")
        old_level = progress.get("current_level")

        # Update user's role in database
        user = db_ops.get_user_by_email(db, user_email)
        if user:
            user.role = new_level
            db.commit()
            logger.info(f"User {user_email} leveled up from {old_level} to {new_level}")

            # Broadcast level-up event
            await manager.broadcast({
                "type": "LEVEL_UP",
                "data": {
                    "user_email": user_email,
                    "old_level": old_level,
                    "new_level": new_level,
                    "completed_nodes": progress.get("completed_nodes")
                }
            })

            return {
                "status": "success",
                "leveled_up": True,
                "old_level": old_level,
                "new_level": new_level
            }

    return {"status": "success", "leveled_up": False, "current_level": progress.get("current_level")}

# --- PROCTORED ASSESSMENT ENDPOINTS ---


@app.get("/proctored-assessments")
async def get_proctored_assessments(db: Session = Depends(get_db)):
    """Get all active proctored assessments"""
    # Get from database
    db_assessments = db_ops.get_all_assessments(db, active_only=True)
    assessments = []

    for assessment in db_assessments:
        assessments.append({
            "id": assessment.id,
            "title": assessment.title,
            "description": assessment.description,
            "questions": assessment.questions,
            "time_limit_minutes": assessment.time_limit_minutes,
            "passing_score": assessment.passing_score,
            "created_at": assessment.created_at.isoformat() if assessment.created_at else datetime.now().isoformat(),
            "created_by": assessment.created_by,
            "active": assessment.active,
            "is_active": assessment.active,
            "total_questions": assessment.total_questions or len(assessment.questions or [])
        })

    # Merge with in-memory assessments
    existing_ids = {a["id"] for a in assessments}
    for a in proctored_assessments:
        if a.get("id") not in existing_ids and a.get("is_active", True):
            assessments.append(a)

    return assessments

@app.get("/proctored-assessments/all")
async def get_all_proctored_assessments(db: Session = Depends(get_db)):
    """Get all proctored assessments (admin)"""
    # Get from database
    db_assessments = db_ops.get_all_assessments(db, active_only=False)
    assessments = []

    for assessment in db_assessments:
        assessments.append({
            "id": assessment.id,
            "title": assessment.title,
            "description": assessment.description,
            "questions": assessment.questions,
            "time_limit_minutes": assessment.time_limit_minutes,
            "passing_score": assessment.passing_score,
            "created_at": assessment.created_at.isoformat() if assessment.created_at else datetime.now().isoformat(),
            "created_by": assessment.created_by,
            "active": assessment.active,
            "is_active": assessment.active,
            "total_questions": assessment.total_questions or len(assessment.questions or [])
        })

    # Merge with in-memory assessments
    existing_ids = {a["id"] for a in assessments}
    for a in proctored_assessments:
        if a.get("id") not in existing_ids:
            assessments.append(a)

    return assessments

@app.get("/proctored-assessments/{assessment_id}")
async def get_proctored_assessment(assessment_id: str, db: Session = Depends(get_db)):
    """Get a specific proctored assessment"""
    # Try database first
    db_assessment = db_ops.get_assessment_by_id(db, assessment_id)
    if db_assessment:
        return {
            "id": db_assessment.id,
            "title": db_assessment.title,
            "description": db_assessment.description,
            "questions": db_assessment.questions,
            "time_limit_minutes": db_assessment.time_limit_minutes,
            "passing_score": db_assessment.passing_score,
            "created_at": db_assessment.created_at.isoformat() if db_assessment.created_at else datetime.now().isoformat(),
            "created_by": db_assessment.created_by,
            "active": db_assessment.active,
            "is_active": db_assessment.active,
            "total_questions": db_assessment.total_questions or len(db_assessment.questions or [])
        }

    # Fallback to in-memory store
    for assessment in proctored_assessments:
        if assessment.get("id") == assessment_id:
            return assessment

    raise HTTPException(status_code=404, detail="Assessment not found")

# REMOVED: Duplicate endpoint - now handled by unified endpoint at line 4522
# @app.post("/proctored-assessments")
# async def create_proctored_assessment(...):

@app.post("/proctored-assessments/bulk-upload")
async def bulk_upload_assessment_questions(
    title: str = Form(...),
    description: str = Form(""),
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    created_by: str = Form("Admin"),
    file: UploadFile = File(...)
):
    """Create assessment with questions from Excel/CSV file"""
    import pandas as pd
    import io
    
    try:
        # Read file content
        content = await file.read()
        
        # Determine file type and parse
        if file.filename.endswith('.xlsx') or file.filename.endswith('.xls'):
            df = pd.read_excel(io.BytesIO(content))
        elif file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only Excel (.xlsx, .xls) or CSV files supported")
        
        # Expected columns: Question, Option1, Option2, Option3, Option4, CorrectOption (1-4)
        required_cols = ['Question', 'Option1', 'Option2', 'Option3', 'Option4', 'CorrectOption']
        for col in required_cols:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
        
        # Parse questions
        questions_list = []
        for idx, row in df.iterrows():
            question = {
                "question": str(row['Question']),
                "options": [
                    str(row['Option1']),
                    str(row['Option2']),
                    str(row['Option3']),
                    str(row['Option4'])
                ],
                "correctIndex": int(row['CorrectOption']) - 1  # Convert 1-4 to 0-3
            }
            questions_list.append(question)
        
        if len(questions_list) == 0:
            raise HTTPException(status_code=400, detail="No valid questions found in file")
        
        # Create assessment
        new_assessment = {
            "id": str(uuid.uuid4()),
            "title": title,
            "description": description,
            "questions": questions_list,
            "time_limit_minutes": time_limit_minutes,
            "passing_score": passing_score,
            "created_at": datetime.now().isoformat(),
            "created_by": created_by,
            "is_active": True,
            "total_questions": len(questions_list)
        }
        proctored_assessments.insert(0, new_assessment)
        logger.info(f"Proctored Assessment Bulk Created: {title} with {len(questions_list)} questions from file")
        
        return {"status": "success", "assessment": new_assessment, "questions_count": len(questions_list)}
    
    except Exception as e:
        logger.error(f"Bulk upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/proctored-assessments/ai-generate")
async def ai_generate_assessment_questions(
    title: str = Form(...),
    description: str = Form(""),
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    num_questions: int = Form(10),
    topic: str = Form(""),
    content: str = Form(""),
    created_by: str = Form("Admin")
):
    """Generate proctored assessment questions using AI from topic or provided content"""
    try:
        prompt = f"""Generate exactly {num_questions} multiple-choice quiz questions {"about " + topic if topic else "based on the following content"}. 
        
{"Content: " + content[:4000] if content else "Topic: " + topic}

IMPORTANT: Return ONLY a valid JSON array with this exact structure:
[
    {{
        "question": "Clear, specific question text?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 0
    }}
]

Requirements:
- Each question should test understanding, not just recall
- Options should be plausible but only one correct
- correctIndex is 0-3 indicating the correct option
- Generate exactly {num_questions} questions
- Return ONLY the JSON array, no markdown or extra text"""

        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an expert assessment creator. Return only valid JSON arrays."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=4000
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Clean response - extract JSON array
        import re
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            response_text = json_match.group()
        
        import json
        questions_list = json.loads(response_text)
        
        if not isinstance(questions_list, list) or len(questions_list) == 0:
            raise Exception("Invalid AI response format")
        
        # Validate each question
        for q in questions_list:
            if "correctIndex" not in q:
                q["correctIndex"] = 0
            q["correctIndex"] = max(0, min(3, int(q["correctIndex"])))
        
        # Create assessment
        new_assessment = {
            "id": str(uuid.uuid4()),
            "title": title,
            "description": description,
            "questions": questions_list[:num_questions],
            "time_limit_minutes": time_limit_minutes,
            "passing_score": passing_score,
            "created_at": datetime.now().isoformat(),
            "created_by": created_by,
            "is_active": True,
            "total_questions": len(questions_list[:num_questions]),
            "ai_generated": True
        }
        proctored_assessments.insert(0, new_assessment)
        logger.info(f"AI Generated Assessment: {title} with {len(questions_list)} questions")
        
        return {"status": "success", "assessment": new_assessment, "questions_count": len(questions_list[:num_questions])}
        
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate questions: {str(e)}")

@app.put("/proctored-assessments/{assessment_id}/toggle")
async def toggle_assessment_active(assessment_id: str, db: Session = Depends(get_db)):
    """Toggle assessment active/inactive status"""
    # Try database first
    db_assessment = db_ops.get_assessment_by_id(db, assessment_id)
    if db_assessment:
        new_active = not db_assessment.active
        db_ops.update_assessment(db, assessment_id, {"active": new_active})
        # Also update in-memory
        for assessment in proctored_assessments:
            if assessment.get("id") == assessment_id:
                assessment["is_active"] = new_active
                assessment["active"] = new_active
        return {"status": "success", "is_active": new_active}

    # Fallback to in-memory
    for assessment in proctored_assessments:
        if assessment.get("id") == assessment_id:
            assessment["is_active"] = not assessment.get("is_active", True)
            return {"status": "success", "is_active": assessment["is_active"]}
    raise HTTPException(status_code=404, detail="Assessment not found")

@app.delete("/proctored-assessments/{assessment_id}")
async def delete_proctored_assessment(assessment_id: str, db: Session = Depends(get_db)):
    """Delete a proctored assessment"""
    global proctored_assessments

    # Delete from database
    db_deleted = db_ops.delete_assessment(db, assessment_id)

    # Also delete from in-memory
    initial_len = len(proctored_assessments)
    proctored_assessments = [a for a in proctored_assessments if a.get("id") != assessment_id]

    if db_deleted or len(proctored_assessments) < initial_len:
        logger.info(f"Proctored Assessment Deleted: {assessment_id}")
        return {"status": "success"}

    raise HTTPException(status_code=404, detail="Assessment not found")

@app.post("/proctored-assessments/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...),
    answers: str = Form(...),  # JSON string of answers array [0, 2, 1, 3, ...]
    time_taken_seconds: int = Form(...),
    violations: int = Form(0),
    breach_log: str = Form("[]"),  # JSON string of breach log array
    critical_breaches: int = Form(0),
    warning_breaches: int = Form(0),
    db: Session = Depends(get_db)
):
    """Submit a proctored assessment attempt with detailed breach tracking"""
    import json

    try:
        # Find assessment from database
        db_assessment = db_ops.get_assessment_by_id(db, assessment_id)
        assessment = None

        if db_assessment:
            assessment = {
                "id": db_assessment.id,
                "title": db_assessment.title,
                "questions": db_assessment.questions or [],
                "passing_score": db_assessment.passing_score,
                "time_limit_minutes": db_assessment.time_limit_minutes
            }
        else:
            # Fallback to in-memory store
            for a in proctored_assessments:
                if a.get("id") == assessment_id:
                    assessment = a
                    break

        if not assessment:
            raise HTTPException(status_code=404, detail="Assessment not found")

        try:
            answers_list = json.loads(answers)
        except:
            raise HTTPException(status_code=400, detail="Invalid answers format")

        # Parse breach log
        try:
            breach_log_list = json.loads(breach_log)
        except:
            breach_log_list = []

        # Calculate score
        correct_count = 0
        total = len(assessment["questions"])

        for i, ans in enumerate(answers_list):
            if i < total and ans == assessment["questions"][i].get("correctIndex"):
                correct_count += 1

        score_percent = (correct_count / total * 100) if total > 0 else 0
        passed = score_percent >= assessment.get("passing_score", 70)

        # Determine integrity status based on breaches
        integrity_status = "clean"
        if critical_breaches > 0:
            integrity_status = "flagged"
        elif warning_breaches > 2:
            integrity_status = "suspicious"
        elif violations > 0:
            integrity_status = "minor_issues"

        # Create submission record for DATABASE
        submission_data = {
            "id": str(uuid.uuid4()),
            "assessment_id": assessment_id,
            "assessment_title": assessment.get("title"),
            "user_email": user_email,
            "user_name": user_name,
            "answers": answers_list,
            "correct_count": correct_count,
            "total_questions": total,
            "score_percent": round(score_percent, 1),
            "passed": passed,
            "time_taken_seconds": time_taken_seconds,
            "time_limit_seconds": assessment.get("time_limit_minutes", 30) * 60,
            "violations": violations,
            "breach_log": breach_log_list,
            "critical_breaches": critical_breaches,
            "warning_breaches": warning_breaches,
            "integrity_status": integrity_status
        }

        try:
            db_submission = db_ops.create_assessment_submission(db, submission_data)
        except Exception as db_error:
            logger.error(f"Database assessment submission error: {db_error}")
            db.rollback()
            # Continue with in-memory tracking

        # Also store in memory for backward compatibility
        submission = {
            **submission_data,
            "score": round(score_percent, 1),  # Alias for compatibility
            "submitted_at": datetime.now().isoformat()
        }

        assessment_submissions.insert(0, submission)
        logger.info(f"Assessment Submitted: {user_name} scored {score_percent}% on {assessment.get('title')} (Breaches: {violations}, Critical: {critical_breaches})")

        return {
            "status": "success",
            "submission": submission,
            "result": {
                "score": round(score_percent, 1),
                "correct": correct_count,
                "total": total,
                "passed": passed,
                "passing_score": assessment.get("passing_score", 70),
                "integrity_status": integrity_status
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Assessment submission error: {e}")
        raise HTTPException(status_code=500, detail=f"Submission failed: {str(e)}")

@app.get("/proctored-assessments/submissions/all")
async def get_all_submissions():
    """Get all assessment submissions (admin)"""
    return assessment_submissions

@app.get("/proctored-assessments/{assessment_id}/submissions")
async def get_assessment_submissions(assessment_id: str):
    """Get submissions for a specific assessment"""
    return [s for s in assessment_submissions if s.get("assessment_id") == assessment_id]

@app.get("/proctored-assessments/submissions/user/{user_email}")
async def get_user_submissions(user_email: str):
    """Get all submissions by a specific user"""
    return [s for s in assessment_submissions if s.get("user_email") == user_email]

# --- AI PROCESSING HELPER ---
async def process_video_content(file_path: str, filename: str):
    """
    Handles video trimming, audio extraction, Whisper transcription, and Groq Quiz generation.
    Returns dictionary with transcript and quiz_data.
    """
    print(f"--- [DEBUG] Starting process_video_content for {filename} ---")
    transcript_text = "Transcription Unavailable"
    quiz_data = []
    
    try:
        from moviepy.editor import VideoFileClip
        import shutil
        
        # 1. TRIM VIDEO (Max 30s)
        print(f"--- [DEBUG] Loading video clip... {file_path}")
        # Define blocking trim function
        def trim_video_task():
            clip = VideoFileClip(file_path)
            print(f"--- [DEBUG] Clip duration: {clip.duration}")
            if clip.duration > 30:
                logger.info(f"Video is too long ({clip.duration}s). Trimming to 30s...")
                trimmed_path = f"{os.path.dirname(file_path)}/trimmed_{filename}"
                trimmed_clip = clip.subclip(0, 30)
                trimmed_clip.write_videofile(trimmed_path, codec="libx264", audio_codec="aac", logger=None)
                clip.close()
                trimmed_clip.close()
                return trimmed_path
            else:
                 clip.close()
                 return None

        loop = asyncio.get_event_loop()
        trimmed_path = await loop.run_in_executor(None, trim_video_task)

        if trimmed_path:

            
                # Replace original with trimmed
                os.remove(file_path)
                os.rename(trimmed_path, file_path)
                logger.info("Video trimmed successfully.")

            
        # 2. TRANSCRIBE (Using Groq Whisper API via ai_services)
        logger.info("Starting AI Processing...")
        # Use simple path construction to avoid path issues
        audio_path = f"{os.path.dirname(file_path)}/{filename}_audio.mp3"
        print(f"--- [DEBUG] Extracting audio to {audio_path}")

        
        # Get event loop for async operations (needed for quiz generation)
        loop = asyncio.get_event_loop()
        
        # Extract audio first
        def check_and_extract_audio():
            v = VideoFileClip(file_path)
            has_audio = False
            if v.audio:
                v.audio.write_audiofile(audio_path, logger=None)
                has_audio = True
            v.close()
            return has_audio

        has_audio = await loop.run_in_executor(None, check_and_extract_audio)
        
        if has_audio:
            logger.info("Transcribing with Groq Whisper API...")
            print("--- [DEBUG] Running Groq Whisper Transcription...")
            try:
                # Use ai_services for Groq Whisper transcription
                result = await loop.run_in_executor(None, lambda: ai_services.transcribe_audio(audio_path))
                if result and "text" in result:
                    transcript_text = result["text"]
                    logger.info(f"Transcript Generated: {transcript_text[:50]}...")
                    print(f"--- [DEBUG] Transcript: {transcript_text[:50]}...")
                else:
                    logger.warning("Transcription returned empty result")
                    transcript_text = f"Training video content for: {filename}. Transcription unavailable."
            except Exception as transcribe_error:
                logger.warning(f"Groq transcription failed: {transcribe_error}")
                transcript_text = f"Training video content for: {filename}. Transcription failed - please review video manually."

            # Cleanup audio file
            if os.path.exists(audio_path):
                try:
                    os.remove(audio_path)
                except:
                    pass
        else:
            logger.warning("Video has no audio track. Skipping transcription.")
            print("--- [DEBUG] No audio track found.")
            return {"transcript": transcript_text, "quiz": quiz_data} # Exit early if no audio

        # 3. GENERATE QUIZ (Groq)
        print("--- [DEBUG] Generating Quiz with Groq...")
        from groq import Groq
        groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) 
        
        prompt = f"""
        Based on this training video transcript, generate 3 multiple-choice quiz questions.
        Format purely as a JSON array of objects with keys: 'question', 'options' (array of 4 strings), 'correctIndex' (0-3).
        
        Transcript: "{transcript_text}"
        """
        
        completion = await loop.run_in_executor(None, lambda: groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.5
        ))
        
        # Parse JSON
        try:
            content = completion.choices[0].message.content
            print(f"--- [DEBUG] Groq Raw Response: {content}")
            raw_json = json.loads(content)
            if "questions" in raw_json:
                quiz_data = raw_json["questions"]
            elif isinstance(raw_json, list):
                quiz_data = raw_json
            else:
                # Try finding value that is a list
                for val in raw_json.values():
                    if isinstance(val, list):
                        quiz_data = val
                        break
                        
            logger.info(f"Quiz Generated: {len(quiz_data)} questions")
        except Exception as json_err:
            logger.error(f"Quiz JSON Parse Error: {json_err}")
            print(f"--- [DEBUG] Quiz JSON Error: {json_err}")
            
    except Exception as e:
        import traceback
        logger.error(f"AI Processing Error: {e}")
        logger.error(traceback.format_exc())
         
        # FALLBACK: If transcription failed, try to providing a usable placeholder so UI doesn't break
        if transcript_text == "Transcription Unavailable":
             transcript_text = f"Transcription failed for {filename}. Please contact support. Error: {str(e)}"
             
             # Attempt to generate dummy quiz so flow doesn't break
             quiz_data = [
                 {"question": "What is covered in this video?", "options": ["Topic A", "Topic B", "Topic C", "Topic D"], "correctIndex": 0}
             ]

    return {"transcript": transcript_text, "quiz": quiz_data}


# --- BACKGROUND PROCESSING ---
async def process_path_node_background(file_path: str, filename: str, content_id: str, res_type: str):
    logger.info(f"Starting background processing for {filename} (Content ID: {content_id})")
    transcript = None
    quiz = None
    
    try:
        # AI Processing for Videos
        if res_type == "Video":
            print(f"--- [DEBUG] BACKGORUND: Processing video {filename}...")
            ai_result = await process_video_content(file_path, filename)
            transcript = ai_result["transcript"]
            quiz = ai_result["quiz"]
            print(f"--- [DEBUG] BACKGROUND AI Result: Transcript Len={len(transcript) if transcript else 0}")
            
            # *** UPDATE DATABASE WITH TRANSCRIPT AND QUIZ ***
            try:
                db = SessionLocal()
                db_ops.update_content(db, content_id, {
                    "transcript": transcript,
                    "quiz": quiz
                })
                db.close()
                logger.info(f"Content updated in DB with transcript/quiz: {content_id}")
            except Exception as db_err:
                logger.error(f"Error updating content in DB: {db_err}")
            
            # Update Content Store (in-memory)
            found = False
            for item in content_store:
                if item["id"] == content_id:
                    item["transcript"] = transcript
                    item["quiz"] = quiz
                    # If quiz generated, ensure it's saved
                    found = True
                    
                    # Notify frontend of update
                    await manager.broadcast({
                        "type": "CONTENT_UPDATE",
                        "data": item
                    })
                    print(f"--- [DEBUG] Broadcasted update for {content_id}")
                    
                    # Add to RAG system
                    if transcript:
                        add_course_to_rag(content_id, transcript)
                    break
            
            if not found:
                print(f"--- [DEBUG] Content ID {content_id} not found in store!")
                
    except Exception as e:
        logger.error(f"Background Process Error: {e}")
        import traceback
        traceback.print_exc()

@app.post("/resources/upload")
async def upload_resource(
    background_tasks: BackgroundTasks,  # Injected dependency
    title: str = Form(...),
    category: str = Form(...),
    description: str = Form(...),
    isPathNode: str = Form("false"),  # Changed to str to handle frontend sending "true"/"false" strings
    bucket: str = Form(None),  # Optional bucket/category for the course
    learning_path_type: str = Form("career_progression"),  # NEW: "self_learning" or "career_progression"
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Convert isPathNode string to boolean (frontend sends "true" or "false")
    # Handle various truthy values just in case
    is_path_node_bool = str(isPathNode).lower() in ("true", "1", "yes", "on")
    
    # Validate learning_path_type
    if learning_path_type not in ["self_learning", "career_progression"]:
        learning_path_type = "career_progression"
    
    print(f"--- [DEBUG] Upload Request: Title={title}, IsPathNode={isPathNode} -> {is_path_node_bool}, LearningPathType={learning_path_type}, File={file.filename} ---")
    # Save file
    file_id = str(uuid.uuid4())
    # Decode URL-encoded filename to prevent 404 errors (e.g., %20 -> space)
    original_filename = unquote(file.filename)
    filename = f"{file_id}_{original_filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # Use chunked copying to avoid loading large files entirely into memory
    with open(file_path, "wb") as buffer:
        while content := await file.read(1024 * 1024):  # Read 1MB chunks
            buffer.write(content)
    
    # Default to local URL
    file_url = f"{BASE_URL}/uploads/{filename}"
    
    # Determine type
    content_type = file.content_type
    res_type = "File"
    if "video" in content_type: res_type = "Video"
    elif "pdf" in content_type: res_type = "PDF"
    elif "image" in content_type: res_type = "Image"
    elif "sheet" in content_type or "excel" in content_type: res_type = "Excel"
    
    # Try to upload to CDN if enabled (for videos especially)
    if cdn_service.CDN_ENABLED:
        logger.info(f"CDN enabled, uploading {res_type} to Cloudflare R2...")
        cdn_content_type = cdn_service.get_content_type(original_filename)
        cdn_url = cdn_service.upload_to_cdn(file_path, f"content/{filename}", cdn_content_type)
        if cdn_url:
            file_url = cdn_url
            logger.info(f"CDN upload successful: {cdn_url}")
            # Optionally remove local file after CDN upload for videos to save space
            # (uncomment if you want to save disk space)
            # if res_type == "Video":
            #     os.remove(file_path)
        else:
            logger.warning("CDN upload failed, using local storage as fallback")
    else:
        logger.info("CDN not configured, using local storage")
    
    # Create Resource Object
    new_resource = {
        "id": file_id,
        "title": title,
        "category": category,
        "description": description,
        "url": file_url,
        "type": res_type,
        "timestamp": datetime.now().isoformat(),
        "size": "Unknown"
    }

    # Save to database
    try:
        db_resource = {
            "id": file_id,
            "title": title,
            "category": category,
            "description": description,
            "url": file_url,
            "resource_type": res_type,
            "created_at": datetime.now(),
            "file_size": None,
            "thumbnail": None
        }
        db_ops.create_resource(db, db_resource)
        logger.info(f"Resource saved to DB: {title}")
    except Exception as e:
        logger.error(f"Error saving resource to DB: {e}")
        db.rollback()

    # Also keep in memory for backward compatibility
    resource_store.append(new_resource)
    
    # [LOGIC] Optional: Add to Learning Path
    if is_path_node_bool:
        print("--- [DEBUG] Adding to Path immediately (Processing in background)...")
        
        # Create ContentItem for Path immediately (so it shows up in UI)
        path_item = {
            "id": file_id,
            "title": title,
            "description": description,
            "videoUrl": file_url,
            "authorRole": "Store Manager",
            "timestamp": datetime.now().isoformat(),
            "isPathNode": True,
            "skippable": False,
            "xp": 50,
            "transcript": "Processing...", # Placeholder
            "quiz": None,
            "bucket": bucket,
            "learning_path_type": learning_path_type,
            "status": "processing" # Optional flag for UI
        }
        
        # *** SAVE CONTENT TO DATABASE ***
        try:
            db_content = {
                "id": file_id,
                "title": title,
                "description": description,
                "video_url": file_url,
                "bucket": bucket,
                "resource_type": res_type,
                "is_path_node": True,
                "learning_path_type": learning_path_type,
                "transcript": "Processing...",
                "quiz": None,
                "timestamp": datetime.now(),
                "created_at": datetime.now()
            }
            db_ops.create_content(db, db_content)
            logger.info(f"Content saved to DB: {title} (ID: {file_id})")
        except Exception as e:
            logger.error(f"Error saving content to DB: {e}")
            db.rollback()
        
        # Add to store based on learning path type:
        # - Self Learning: Append to END (new courses become last node in path)
        # - Career Progression: Insert at TOP (for admin curriculum ordering)
        if learning_path_type == "self_learning":
            content_store.append(path_item)  # Append to end for sequential path
            print(f"--- [DEBUG] Self Learning: Appended to END of path")
        else:
            content_store.insert(0, path_item)  # Insert at top for career progression
            print(f"--- [DEBUG] Career Progression: Inserted at TOP")
        
        # Trigger Background Processing for Video
        if res_type == "Video":
            background_tasks.add_task(process_path_node_background, file_path, filename, file_id, res_type)
        
        # Broadcast immediately (shows as 'Processing...')
        await manager.broadcast({
            "type": "NEW_CONTENT", 
            "data": path_item
        })

    else:
        print("--- [DEBUG] isPathNode is FALSE - Not adding to path")
    
    # [AUDIT] Log upload
    log_action("UPLOAD_CONTENT", title, f"Uploaded {res_type} to {'Self Learning' if is_path_node_bool and learning_path_type == 'self_learning' else 'Library'}")
    
    return {"status": "success", "resource": new_resource}

class NotificationRequest(BaseModel):
    title: str
    message: str
    type: str # 'ordinary' or 'crucial'
    mediaUrl: Optional[str] = None  # Optional image URL for the notification

# --- WEBSOCKET MANAGER ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        logger.info(f"Broadcasting message to {len(self.active_connections)} clients: {message['type']}")
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting: {e}")

manager = ConnectionManager()

@app.get("/meetings")
async def get_meetings():
    """Get all upcoming and ongoing meetings"""
    # Sort by scheduled_at, upcoming first
    return sorted(meetings_store, key=lambda x: x.get('scheduled_at', ''), reverse=False)

@app.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    """Get a specific meeting by ID"""
    for meeting in meetings_store:
        if meeting.get("id") == meeting_id:
            return meeting
    raise HTTPException(status_code=404, detail="Meeting not found")

@app.post("/meetings")
async def create_meeting(
    title: str = Form(...),
    description: str = Form(""),
    scheduled_at: str = Form(...),  # ISO format datetime string
    duration_minutes: int = Form(30),
    host_name: str = Form(...),
    host_email: str = Form(...)
):
    """Create a new virtual meeting and notify all users"""
    meeting_id = str(uuid.uuid4())
    room_id = f"bw-meeting-{meeting_id[:8]}"  # Short room ID for joining
    
    new_meeting = {
        "id": meeting_id,
        "title": title,
        "description": description,
        "scheduled_at": scheduled_at,
        "duration_minutes": duration_minutes,
        "host_name": host_name,
        "host_email": host_email,
        "room_id": room_id,
        "status": "scheduled",  # scheduled, ongoing, ended
        "created_at": datetime.now().isoformat(),
        "participants": []  # List of {user_email, user_name, joined_at}
    }
    
    # [AUDIT] Log meeting creation
    log_action("CREATE_MEETING", title, f"Scheduled for {scheduled_at} by {host_name}")
    
    meetings_store.insert(0, new_meeting)
    logger.info(f"Meeting Created: {title} scheduled for {scheduled_at} by {host_name}")
    
    # Broadcast meeting notification to all connected clients
    await manager.broadcast({
        "type": "MEETING_SCHEDULED",
        "data": new_meeting
    })
    
    # Also create a notification entry
    meeting_notif = {
        "id": str(uuid.uuid4()),
        "title": f"📅 Meeting: {title}",
        "message": f"{host_name} scheduled a meeting for {scheduled_at[:16].replace('T', ' at ')}. Tap to join when it starts.",
        "type": "meeting",
        "meeting_id": meeting_id,
        "created_at": datetime.now().isoformat(),
        "read_by": []
    }
    notification_store.append(meeting_notif)
    
    await manager.broadcast({
        "type": "NOTIFICATION",
        "data": meeting_notif
    })
    
    return {"status": "success", "meeting": new_meeting}

@app.post("/meetings/{meeting_id}/join")
async def join_meeting(
    meeting_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...)
):
    """Mark a user as joined a meeting"""
    for meeting in meetings_store:
        if meeting.get("id") == meeting_id:
            # Check if already joined
            for p in meeting.get("participants", []):
                if p.get("user_email") == user_email:
                    return {"status": "success", "message": "Already joined", "meeting": meeting}
            
            # Add participant
            meeting["participants"].append({
                "user_email": user_email,
                "user_name": user_name,
                "joined_at": datetime.now().isoformat()
            })
            
            # Update status to ongoing if first participant
            if meeting["status"] == "scheduled":
                meeting["status"] = "ongoing"
            
            logger.info(f"User {user_name} joined meeting: {meeting['title']}")
            
            # Broadcast participant joined
            await manager.broadcast({
                "type": "MEETING_PARTICIPANT_JOINED",
                "data": {
                    "meeting_id": meeting_id,
                    "participant": {"user_email": user_email, "user_name": user_name}
                }
            })
            
            return {"status": "success", "meeting": meeting}
    
    raise HTTPException(status_code=404, detail="Meeting not found")

@app.post("/meetings/{meeting_id}/leave")
async def leave_meeting(
    meeting_id: str,
    user_email: str = Form(...)
):
    """Mark a user as left a meeting"""
    for meeting in meetings_store:
        if meeting.get("id") == meeting_id:
            meeting["participants"] = [
                p for p in meeting.get("participants", [])
                if p.get("user_email") != user_email
            ]
            
            # If no participants left and host also left, end meeting
            if len(meeting["participants"]) == 0:
                meeting["status"] = "ended"
            
            logger.info(f"User {user_email} left meeting: {meeting['title']}")
            return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Meeting not found")

@app.put("/meetings/{meeting_id}/end")
async def end_meeting(meeting_id: str):
    """End a meeting (host only)"""
    for meeting in meetings_store:
        if meeting.get("id") == meeting_id:
            meeting["status"] = "ended"
            logger.info(f"Meeting ended: {meeting['title']}")
            
            await manager.broadcast({
                "type": "MEETING_ENDED",
                "data": {"meeting_id": meeting_id, "title": meeting["title"]}
            })
            
            return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Meeting not found")

@app.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str):
    """Cancel/delete a meeting"""
    global meetings_store
    initial_len = len(meetings_store)
    meetings_store = [m for m in meetings_store if m.get("id") != meeting_id]
    
    if len(meetings_store) < initial_len:
        logger.info(f"Meeting Deleted: {meeting_id}")
        return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Meeting not found")


# --- LEARNING PATH ENDPOINTS ---
# NOTE: Main implementation is at /learning-paths/content/{path_type} below (line ~3033)
# This section intentionally left empty to avoid duplicate routes.


# --- ENDPOINTS ---

@app.get("/")
async def root():
    return {"status": "ok", "message": "BW LMS Backend Running", "version": "2.0.0"}


@app.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring and load balancers.
    Checks database connectivity and AI services.
    """
    db_status = check_database_health()
    ai_status = ai_services.check_ai_services_health()

    overall_status = "healthy" if db_status["status"] == "healthy" else "unhealthy"

    return {
        "status": overall_status,
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0",
        "services": {
            "database": db_status,
            "ai": ai_status
        }
    }


@app.post("/auth/refresh")
async def refresh_token(data: dict):
    """
    Refresh access token using refresh token.
    """
    refresh_token_str = data.get("refresh_token")

    if not refresh_token_str:
        raise HTTPException(status_code=400, detail="Refresh token required")

    payload = verify_token(refresh_token_str, token_type="refresh")

    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    email = payload.get("email")

    # Get user data to generate new access token
    db = SessionLocal()
    try:
        user_db = db_ops.get_user_by_email(db, email)
        if not user_db:
            raise HTTPException(status_code=401, detail="User not found")

        user_data = {
            "email": user_db.email,
            "name": user_db.name,
            "role": user_db.role or "User",
            "category": user_db.category or "Employee",
            "privileges": user_db.privileges or [],
            "is_superadmin": user_db.is_superadmin or False,
            "has_admin_access": user_db.has_admin_access or False,
            "store": user_db.store or "Unassigned"
        }

        token_data = generate_user_token_data(user_data)
        new_access_token = create_access_token(token_data)

        return {
            "access_token": new_access_token,
            "token_type": "bearer"
        }
    finally:
        db.close()


@app.get("/auth/me")
async def get_current_user_info(current_user: dict = Depends(require_auth)):
    """
    Get current authenticated user's information.
    Requires valid JWT token.
    """
    return {
        "status": "success",
        "user": current_user
    }

@app.get("/content")
async def get_content(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """
    Returns uploaded content filtered by user's level.
    - Authenticated users see courses up to their level
    - Unauthenticated users see all courses (for backward compatibility)
    """
    # Get user info from token
    user_category = None
    is_authenticated = False
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_category = payload.get("category") or payload.get("role", "Waffler")
            is_authenticated = True
        except:
            pass
    
    # Get content from database
    db_content = db_ops.get_all_content(db)
    content_list = []

    for content in db_content:
        content_list.append({
            "id": content.id,
            "title": content.title,
            "description": content.description,
            "videoUrl": content.video_url,
            "authorRole": content.resource_type or "Manager",
            "timestamp": content.created_at.isoformat() if content.created_at else content.timestamp.isoformat(),
            "isPathNode": content.is_path_node or False,
            "skippable": False,
            "xp": 50,
            "transcript": content.transcript,
            "quiz": content.quiz,
            "bucket": content.bucket,
            "bucket_id": content.bucket_id,
            "learning_path_type": content.learning_path_type,
            "target_level": content.bucket  # Use bucket as target level for now
        })

    # Merge with in-memory content (for backward compatibility)
    existing_ids = {c["id"] for c in content_list}
    for item in content_store:
        if item.get("id") not in existing_ids:
            # Add target_level from bucket if not present
            item_copy = item.copy()
            if "target_level" not in item_copy:
                item_copy["target_level"] = item_copy.get("bucket")
            content_list.append(item_copy)

    # Apply level-based filtering if user is authenticated
    if is_authenticated and user_category:
        content_list = filter_courses_by_level(content_list, user_category)
        logger.info(f"Content filtered for level '{user_category}': {len(content_list)} courses")

    return content_list

@app.post("/upload")
async def upload_content(
    title: str = Form(...),
    description: str = Form(...),
    authorRole: str = Form(...),
    timestamp: str = Form(...),
    isPathNode: bool = Form(False),
    bucket: str = Form(None),  # NEW: Optional bucket/category for the course
    learning_path_type: str = Form("career_progression"),  # NEW: 'self_learning' or 'career_progression'
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Receives new content (Files + Metadata) from Managers.
    Uploads video to Cloudflare R2 CDN, stores metadata in database.
    """
    try:
        item_id = str(uuid.uuid4())

        # 1. Save content temporarily to disk for AI processing
        file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'mp4'
        unique_filename = f"content_{item_id}.{file_ext}"
        file_location = f"{UPLOAD_DIR}/{unique_filename}"

        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # --- AI PROCESSING (Transcribe & Quiz) ---
        ai_result = await process_video_content(file_location, unique_filename)
        transcript_text = ai_result["transcript"]
        quiz_data = ai_result["quiz"]

        # 2. Upload to Cloudflare R2 CDN
        video_url = None
        cdn_object_key = f"courses/{unique_filename}"

        if cdn_service.CDN_ENABLED:
            content_type = cdn_service.get_content_type(unique_filename)
            cdn_url = cdn_service.upload_to_cdn(file_location, cdn_object_key, content_type)
            if cdn_url:
                video_url = cdn_url
                logger.info(f"Content uploaded to CDN: {cdn_url}")
                # Delete local file after successful CDN upload
                try:
                    os.remove(file_location)
                    logger.info(f"Deleted local file after CDN upload: {file_location}")
                except:
                    pass
            else:
                logger.warning("CDN upload failed, falling back to local storage")
                video_url = f"{BASE_URL}/uploads/{unique_filename}"
        else:
            # CDN not enabled, use local storage
            video_url = f"{BASE_URL}/uploads/{unique_filename}"
            logger.info(f"CDN disabled, using local storage: {video_url}")

        logger.info(f"New Content Uploaded: {title} by {authorRole} (File: {unique_filename}, Bucket: {bucket}, PathType: {learning_path_type})")

        # 3. Store ONLY Metadata in Database (video is on CDN)
        content_data = {
            "id": item_id,
            "title": title,
            "description": description,
            "bucket": bucket,
            "bucket_id": bucket,
            "resource_type": authorRole,
            "video_url": video_url,
            "file_url": video_url,
            "duration": "30s",
            "is_path_node": isPathNode,
            "learning_path_type": learning_path_type,
            "transcript": transcript_text,
            "quiz": quiz_data,
            "extra_data": {"timestamp": timestamp, "cdn_object_key": cdn_object_key}
        }

        db_content = db_ops.create_content(db, content_data)
        logger.info(f"Content metadata saved to database: {item_id}")

        # 4. Also store in memory for backward compatibility
        item_data = {
            "id": item_id,
            "title": title,
            "description": description,
            "videoUrl": video_url,
            "authorRole": authorRole,
            "timestamp": timestamp,
            "isPathNode": isPathNode,
            "skippable": False,
            "xp": 50,
            "transcript": transcript_text,
            "quiz": quiz_data,
            "bucket": bucket,
            "bucket_id": bucket,
            "learning_path_type": learning_path_type
        }

        content_store.insert(0, item_data)  # Add to top

        # 5. Real-time Broadcast
        await manager.broadcast({
            "type": "NEW_CONTENT",
            "data": item_data
        })

        # Add to RAG index if transcript available
        if transcript_text and transcript_text != "Transcription Unavailable":
            add_course_to_rag(item_id, transcript_text)

        return {
            "status": "success",
            "message": "Content uploaded to CDN and metadata saved to database",
            "url": video_url,
            "cdn_enabled": cdn_service.CDN_ENABLED,
            "content_id": item_id
        }

    except Exception as e:
        logger.error(f"Error uploading content: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload content: {str(e)}")

from fastapi import HTTPException

@app.put("/content/{item_id}")
async def update_content(item_id: str, request: UpdateContentRequest, db: Session = Depends(get_db)):
    try:
        updates = {}
        if request.title is not None:
            updates["title"] = request.title
        if request.description is not None:
            updates["description"] = request.description
        if request.quiz is not None:
            updates["quiz"] = request.quiz

        # Update in database
        db_content = db_ops.update_content(db, item_id, updates)
        if not db_content:
            # Try in-memory store
            for item in content_store:
                if item.get("id") == item_id:
                    if request.title is not None: item["title"] = request.title
                    if request.description is not None: item["description"] = request.description
                    if request.skippable is not None: item["skippable"] = request.skippable
                    if request.quiz is not None: item["quiz"] = request.quiz

                    logger.info(f"Content Updated (memory): {item_id}")
                    return {"status": "success", "data": item}

            raise HTTPException(status_code=404, detail="Content not found")

        # Also update in-memory store
        for item in content_store:
            if item.get("id") == item_id:
                if request.title is not None: item["title"] = request.title
                if request.description is not None: item["description"] = request.description
                if request.skippable is not None: item["skippable"] = request.skippable
                if request.quiz is not None: item["quiz"] = request.quiz
                break

        logger.info(f"Content Updated: {item_id}")
        return {"status": "success", "data": {
            "id": db_content.id,
            "title": db_content.title,
            "description": db_content.description,
            "quiz": db_content.quiz
        }}

    except Exception as e:
        logger.error(f"Error updating content: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update content: {str(e)}")

@app.delete("/content/{item_id}")
async def delete_content(item_id: str, db: Session = Depends(get_db)):
    """
    Delete a course/content completely from everywhere:
    - PostgreSQL (Content table)
    - PostgreSQL (Resource table)
    - Cloudflare R2 CDN
    - Local uploads folder
    - In-memory stores
    """
    global content_store, resource_store

    try:
        deleted_something = False
        video_url = None
        cdn_object_key = None

        # 1. First check DATABASE for video URL (most reliable source)
        try:
            db_content = db_ops.get_content_by_id(db, item_id)
            if db_content:
                video_url = db_content.video_url or db_content.file_url
                # Check extra_data for cdn_object_key
                if db_content.extra_data and isinstance(db_content.extra_data, dict):
                    cdn_object_key = db_content.extra_data.get("cdn_object_key")
                logger.info(f"Found content in DB with URL: {video_url}")
        except Exception as e:
            logger.error(f"Error finding content in DB: {e}")

        # Also check in-memory stores if not found in DB
        if not video_url:
            for item in content_store:
                if item.get("id") == item_id:
                    video_url = item.get("videoUrl") or item.get("video_url", "")
                    break

        # Also check resource_store
        if not video_url:
            for item in resource_store:
                if item.get("id") == item_id:
                    video_url = item.get("url", "")
                    break

        # Also check Resource table in database
        if not video_url:
            try:
                db_resource = db_ops.get_resource_by_id(db, item_id)
                if db_resource:
                    video_url = db_resource.url
                    logger.info(f"Found resource in DB with URL: {video_url}")
            except Exception as e:
                logger.error(f"Error finding resource in DB: {e}")

        # 2. Delete from PostgreSQL - Content table
        try:
            deleted_db = db_ops.delete_content(db, item_id)
            if deleted_db:
                deleted_something = True
                logger.info(f"Deleted from Content table: {item_id}")
        except Exception as e:
            logger.error(f"Error deleting from Content table: {e}")
        
        # 3. Delete from PostgreSQL - Resource table
        try:
            deleted_resource = db_ops.delete_resource(db, item_id)
            if deleted_resource:
                deleted_something = True
                logger.info(f"Deleted from Resource table: {item_id}")
        except Exception as e:
            logger.error(f"Error deleting from Resource table: {e}")
        
        # 4. Delete from CDN (Cloudflare R2) if URL is a CDN URL
        if cdn_service.CDN_ENABLED:
            try:
                # Use stored cdn_object_key if available, otherwise extract from URL
                object_key = cdn_object_key
                if not object_key and video_url and cdn_service.R2_PUBLIC_URL:
                    if cdn_service.R2_PUBLIC_URL in video_url:
                        object_key = video_url.replace(cdn_service.R2_PUBLIC_URL, "").lstrip("/")

                if object_key:
                    cdn_service.delete_from_cdn(object_key)
                    logger.info(f"Deleted from CDN: {object_key}")
            except Exception as e:
                logger.error(f"Error deleting from CDN: {e}")
        
        # 5. Delete local file if exists
        if video_url:
            try:
                # Extract filename from URL
                if "/uploads/" in video_url:
                    filename = video_url.split("/uploads/")[-1]
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    if os.path.exists(file_path):
                        os.remove(file_path)
                        logger.info(f"Deleted local file: {file_path}")
            except Exception as e:
                logger.error(f"Error deleting local file: {e}")
        
        # 6. Delete from in-memory content_store
        initial_content_len = len(content_store)
        content_store = [item for item in content_store if item.get("id") != item_id]
        if len(content_store) < initial_content_len:
            deleted_something = True
        
        # 7. Delete from in-memory resource_store
        initial_resource_len = len(resource_store)
        resource_store = [item for item in resource_store if item.get("id") != item_id]
        if len(resource_store) < initial_resource_len:
            deleted_something = True
        
        # 8. Delete from RAG vector store
        try:
            rag_removed = rag_service.clear_rag_for_course(item_id)
            if rag_removed > 0:
                logger.info(f"Removed {rag_removed} RAG chunks for: {item_id}")
        except Exception as e:
            logger.error(f"Error clearing RAG: {e}")
        
        if deleted_something:
            logger.info(f"Content completely deleted: {item_id}")
            
            # Broadcast deletion to connected clients
            await manager.broadcast({
                "type": "CONTENT_DELETED",
                "data": {"id": item_id}
            })
            
            # Log the action
            log_action("DELETE_CONTENT", item_id, "Course/content deleted from all locations")
            
            return {"status": "success", "message": "Content deleted from all locations"}

        raise HTTPException(status_code=404, detail="Content not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting content: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete content: {str(e)}")

# --- NEWS FEED ENDPOINTS ---

@app.get("/news")
async def get_news(db: Session = Depends(get_db)):
    """Get all news articles, sorted by date (newest first)"""
    # Get news from database
    db_news = db_ops.get_all_news(db, limit=100)
    news_list = []

    for news in db_news:
        news_list.append({
            "id": news.id,
            "title": news.title,
            "content": news.content,
            "author": news.author,
            "image": news.image,
            "date": news.date or "Just now",
            "created_at": news.created_at.isoformat() if news.created_at else datetime.now().isoformat()
        })

    # Merge with in-memory news (for backward compatibility)
    existing_ids = {n["id"] for n in news_list}
    for item in news_feed:
        if item.get("id") not in existing_ids:
            news_list.append(item)

    return sorted(news_list, key=lambda x: x.get('created_at', ''), reverse=True)

@app.post("/news")
async def create_news(
    title: str = Form(...),
    content: str = Form(...),
    author: str = Form(...),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """Create a new news article and broadcast to all users. Images uploaded to CDN."""
    try:
        news_id = str(uuid.uuid4())

        # Handle image upload - upload to CDN
        image_url = None
        if image:
            file_extension = image.filename.split('.')[-1]
            file_name = f"news_{news_id}.{file_extension}"
            file_path = os.path.join(UPLOAD_DIR, file_name)
            with open(file_path, "wb") as f:
                f.write(await image.read())

            # Upload to Cloudflare R2 CDN
            if cdn_service.CDN_ENABLED:
                cdn_object_key = f"news/{file_name}"
                content_type = cdn_service.get_content_type(file_name)
                cdn_url = cdn_service.upload_to_cdn(file_path, cdn_object_key, content_type)
                if cdn_url:
                    image_url = cdn_url
                    logger.info(f"News image uploaded to CDN: {cdn_url}")
                    # Delete local file after successful CDN upload
                    try:
                        os.remove(file_path)
                    except:
                        pass
                else:
                    image_url = f"{BASE_URL}/uploads/{file_name}"
                    logger.warning("CDN upload failed for news image, using local storage")
            else:
                image_url = f"{BASE_URL}/uploads/{file_name}"

        # Create news in database
        news_data = {
            "id": news_id,
            "title": title,
            "content": content,
            "author": author,
            "image": image_url or "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=800",
            "date": "Just now"
        }

        db_news = db_ops.create_news_post(db, news_data)

        # Also store in memory for backward compatibility
        news_item = {
            **news_data,
            "created_at": datetime.now().isoformat()
        }

        news_feed.append(news_item)
        logger.info(f"News Created: {title}")

        # [AUDIT] Log news
        log_action("CREATE_CAMPAIGN", title, "Posted news/announcement to all users")

        # Broadcast to all connected clients
        await manager.broadcast({
            "type": "NEWS_POSTED",
            "data": news_item
        })

        return {"status": "success", "data": news_item}

    except Exception as e:
        logger.error(f"Error creating news: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create news: {str(e)}")

@app.delete("/news/{news_id}")
async def delete_news(news_id: str, db: Session = Depends(get_db)):
    """Delete a news article - from DATABASE and CDN"""
    global news_feed
    try:
        # Get image URL before deletion for CDN cleanup
        image_url = None
        try:
            db_news = db_ops.get_news_post_by_id(db, news_id)
            if db_news:
                image_url = db_news.image
        except:
            pass

        # Also check in-memory
        if not image_url:
            for n in news_feed:
                if n.get("id") == news_id:
                    image_url = n.get("image")
                    break

        # Delete from CDN if image is stored there
        if image_url and cdn_service.CDN_ENABLED and cdn_service.R2_PUBLIC_URL:
            try:
                if cdn_service.R2_PUBLIC_URL in image_url:
                    object_key = image_url.replace(cdn_service.R2_PUBLIC_URL, "").lstrip("/")
                    cdn_service.delete_from_cdn(object_key)
                    logger.info(f"Deleted news image from CDN: {object_key}")
            except Exception as e:
                logger.error(f"Error deleting news image from CDN: {e}")

        # Delete from database
        db_ops.delete_news_post(db, news_id)

        # Also delete from in-memory
        news_feed = [n for n in news_feed if n.get("id") != news_id]

        logger.info(f"News Deleted: {news_id}")
        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error deleting news: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete news: {str(e)}")

# --- LIVE QUIZZES ENDPOINTS ---

@app.get("/live-quizzes")
async def get_live_quizzes(db: Session = Depends(get_db)):
    """Get all live topic quizzes - from DATABASE"""
    # Get from database
    db_quizzes = db_ops.get_all_live_quizzes(db, active_only=True)
    result = []
    for quiz in db_quizzes:
        result.append({
            "id": quiz.id,
            "title": quiz.title,
            "difficulty": quiz.difficulty,
            "time": quiz.time_limit,
            "questions": quiz.questions or [],
            "image": quiz.image,
            "created_at": quiz.created_at.isoformat() if quiz.created_at else None
        })

    # Merge with in-memory for backward compatibility
    existing_ids = {q["id"] for q in result}
    for quiz in live_quizzes:
        if quiz.get("id") not in existing_ids:
            result.append(quiz)

    return result

@app.post("/live-quizzes")
async def create_live_quiz(
    title: str = Form(...),
    difficulty: str = Form(...),
    time: str = Form(...),
    questions: str = Form(...),  # JSON string of questions array
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """Create a new topic quiz and broadcast to all users - SAVES TO DATABASE"""
    try:
        quiz_id = str(uuid.uuid4())

        # Parse questions JSON
        try:
            questions_list = json.loads(questions)
        except:
            raise HTTPException(status_code=400, detail="Invalid questions format")

        # Handle image upload - upload to CDN
        image_url = None
        if image:
            file_extension = image.filename.split('.')[-1]
            file_name = f"quiz_{quiz_id}.{file_extension}"
            file_path = os.path.join(UPLOAD_DIR, file_name)
            with open(file_path, "wb") as f:
                f.write(await image.read())

            # Upload to Cloudflare R2 CDN
            if cdn_service.CDN_ENABLED:
                cdn_object_key = f"quizzes/{file_name}"
                content_type = cdn_service.get_content_type(file_name)
                cdn_url = cdn_service.upload_to_cdn(file_path, cdn_object_key, content_type)
                if cdn_url:
                    image_url = cdn_url
                    logger.info(f"Quiz image uploaded to CDN: {cdn_url}")
                    # Delete local file after successful CDN upload
                    try:
                        os.remove(file_path)
                    except:
                        pass
                else:
                    image_url = f"{BASE_URL}/uploads/{file_name}"
                    logger.warning("CDN upload failed for quiz image, using local storage")
            else:
                image_url = f"{BASE_URL}/uploads/{file_name}"

        # Save to database
        quiz_data = {
            "id": quiz_id,
            "title": title,
            "difficulty": difficulty,
            "time_limit": time,
            "questions": questions_list,
            "image": image_url or "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800"
        }
        db_ops.create_live_quiz(db, quiz_data)

        quiz_item = {
            "id": quiz_id,
            "title": title,
            "difficulty": difficulty,
            "time": time,
            "questions": questions_list,
            "image": image_url or "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800",
            "created_at": datetime.now().isoformat()
        }

        # Also store in-memory for backward compatibility
        live_quizzes.append(quiz_item)
        logger.info(f"Live Quiz Created in DB: {title}")

        # [AUDIT] Log quiz assignment
        log_action("ASSIGN_QUIZ", title, f"Assigned quiz ({difficulty}, {time})")

        # Broadcast to all connected clients
        await manager.broadcast({
            "type": "QUIZ_POSTED",
            "data": quiz_item
        })

        return {"status": "success", "data": quiz_item}

    except Exception as e:
        logger.error(f"Error creating live quiz: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create quiz: {str(e)}")

@app.delete("/live-quizzes/{quiz_id}")
async def delete_live_quiz_endpoint(quiz_id: str, db: Session = Depends(get_db)):
    """Delete a live quiz - from DATABASE and CDN"""
    global live_quizzes

    # Get image URL before deletion for CDN cleanup
    image_url = None
    try:
        db_quiz = db_ops.get_live_quiz_by_id(db, quiz_id)
        if db_quiz:
            image_url = db_quiz.image
    except:
        pass

    # Also check in-memory
    if not image_url:
        for q in live_quizzes:
            if q.get("id") == quiz_id:
                image_url = q.get("image")
                break

    # Delete from CDN if image is stored there
    if image_url and cdn_service.CDN_ENABLED and cdn_service.R2_PUBLIC_URL:
        try:
            if cdn_service.R2_PUBLIC_URL in image_url:
                object_key = image_url.replace(cdn_service.R2_PUBLIC_URL, "").lstrip("/")
                cdn_service.delete_from_cdn(object_key)
                logger.info(f"Deleted quiz image from CDN: {object_key}")
        except Exception as e:
            logger.error(f"Error deleting quiz image from CDN: {e}")

    # Delete from database
    db_ops.delete_live_quiz(db, quiz_id)

    # Also delete from in-memory
    initial_len = len(live_quizzes)
    live_quizzes = [q for q in live_quizzes if q.get("id") != quiz_id]

    logger.info(f"Live Quiz Deleted: {quiz_id}")
    return {"status": "success"}

@app.post("/quiz/submit")
async def submit_quiz(
    quiz_id: str = Form(...),
    user_name: str = Form(...),
    answers: str = Form(...)  # JSON array of answer indices
):
    """
    Submit a live quiz and calculate the score.
    Returns: { score, total, percentage }
    """
    # Find the quiz
    quiz = None
    for q in live_quizzes:
        if q.get("id") == quiz_id:
            quiz = q
            break
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Parse answers
    try:
        answers_list = json.loads(answers)
    except:
        raise HTTPException(status_code=400, detail="Invalid answers format")
    
    questions = quiz.get("questions", [])
    total = len(questions)
    correct_count = 0
    
    # Calculate score
    for i, question in enumerate(questions):
        if i >= len(answers_list):
            continue
        
        user_answer_idx = answers_list[i]
        options = question.get("options", [])
        
        # Check if the selected option is correct
        if user_answer_idx < len(options):
            selected_option = options[user_answer_idx]
            
            # 1. Check object format { text, correct: true }
            if isinstance(selected_option, dict) and selected_option.get("correct"):
                correct_count += 1
            else:
                # 2. Check index based format (handle various key names)
                correct_idx = question.get("correct_answer")
                if correct_idx is None:
                    correct_idx = question.get("correctIndex")
                if correct_idx is None:
                    correct_idx = question.get("correct")  # Frontend uses 'correct'
                if correct_idx is None:
                    correct_idx = question.get("answer")  # Legacy support
                
                # Compare as integers if possible
                try:
                    if correct_idx is not None and int(correct_idx) == int(user_answer_idx):
                        correct_count += 1
                except (ValueError, TypeError):
                    pass
    
    # Calculate percentage
    percentage = round((correct_count / total * 100)) if total > 0 else 0
    
    logger.info(f"Quiz submitted by {user_name}: {correct_count}/{total} ({percentage}%)")
    
    return {
        "score": correct_count,
        "total": total,
        "percentage": percentage
    }

# --- AI QUIZ GENERATION ENDPOINT ---

@app.post("/generate-quiz-from-content")
async def generate_quiz_from_content(
    title: str = Form(...),
    difficulty: str = Form("Medium"),
    num_questions: int = Form(5),
    preview_only: str = Form("false"),  # NEW: If 'true', returns questions without saving/broadcasting
    file: UploadFile = File(...)
):
    """
    Generate a quiz from any uploaded content (video, PDF, image, or text file).
    Uses Whisper for audio, PyMuPDF for PDF, and Groq for quiz generation.
    """
    quiz_id = str(uuid.uuid4())
    extracted_text = ""
    
    import time
    start_time = time.time()
    print(f"\n{'='*50}")
    print(f"🚀 AI QUIZ GENERATION STARTED")
    print(f"{'='*50}")
    
    # Save uploaded file
    file_extension = file.filename.split('.')[-1].lower()
    temp_filename = f"temp_{quiz_id}.{file_extension}"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    upload_time = time.time()
    print(f"📁 File uploaded: {time.time() - start_time:.2f}s")
    
    content_type = file.content_type or ""
    logger.info(f"AI Quiz Gen: Processing {file.filename} ({content_type})")
    
    try:
        # 1. EXTRACT TEXT BASED ON FILE TYPE
        
        # VIDEO/AUDIO: Use Whisper transcription
        if any(x in content_type for x in ["video", "audio"]) or file_extension in ["mp4", "mp3", "wav", "m4a", "webm"]:
            logger.info("Extracting audio and transcribing with Whisper...")
            
            # Extract audio if video (crop to first 15 seconds for speed)
            if "video" in content_type or file_extension in ["mp4", "webm"]:
                crop_start = time.time()
                from moviepy.editor import VideoFileClip
                video = VideoFileClip(temp_path)
                # Crop to first 15 seconds for fast processing
                duration = min(video.duration, 15)
                cropped_video = video.subclip(0, duration)
                audio_path = temp_path.replace(f".{file_extension}", ".mp3")
                cropped_video.audio.write_audiofile(audio_path, verbose=False, logger=None)
                cropped_video.close()
                video.close()
                print(f"🎬 Video cropped ({duration}s): {time.time() - crop_start:.2f}s")
            else:
                audio_path = temp_path
            
            # Transcribe with Whisper (optimized for speed)
            whisper_start = time.time()
            print(f"🎤 Starting Whisper transcription...")
            try:
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None, 
                    lambda: whisper_model.transcribe(
                        audio_path, 
                        language="en",  # English-only for speed
                        fp16=False,     # CPU optimization
                        condition_on_previous_text=False  # Faster, prevents loops
                    )
                )
                extracted_text = result.get("text", "")
            except Exception as e:
                logger.warning(f"Whisper transcription failed: {e}")
                logger.info("Attempting fallback transcription with minimal settings...")
                try:
                    # Fallback with defaults
                    loop = asyncio.get_event_loop()
                    result = await loop.run_in_executor(
                        None, 
                        lambda: whisper_model.transcribe(audio_path, fp16=False)
                    )
                    extracted_text = result.get("text", "")
                except Exception as e2:
                    logger.error(f"Fallback transcription also failed: {e2}")
                    extracted_text = "Audio content could not be transcribed. Please assess based on the video title."
            
            print(f"🎤 Whisper transcription done: {time.time() - whisper_start:.2f}s ({len(extracted_text)} chars)")
            
        # PDF: Use PyMuPDF (fitz)
        elif "pdf" in content_type or file_extension == "pdf":
            logger.info("Extracting text from PDF...")
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(temp_path)
                for page in doc:
                    extracted_text += page.get_text()
                doc.close()
                logger.info(f"PDF extraction: {len(extracted_text)} chars")
            except ImportError:
                logger.warning("PyMuPDF not installed, trying pdfplumber...")
                try:
                    import pdfplumber
                    with pdfplumber.open(temp_path) as pdf:
                        for page in pdf.pages:
                            extracted_text += (page.extract_text() or "")
                except ImportError:
                    raise HTTPException(status_code=500, detail="PDF extraction libraries not available")
                    
        # IMAGE: Use Tesseract OCR or AI Vision fallback
        elif "image" in content_type or file_extension in ["jpg", "jpeg", "png", "bmp", "gif", "webp", "tiff"]:
            logger.info("Extracting text from image with OCR...")
            try:
                import pytesseract
                from PIL import Image
                import platform
                
                # Configure Tesseract path for Windows
                if platform.system() == "Windows":
                    tesseract_paths = [
                        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                        os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
                    ]
                    for path in tesseract_paths:
                        if os.path.exists(path):
                            pytesseract.pytesseract.tesseract_cmd = path
                            logger.info(f"Found Tesseract at: {path}")
                            break
                    else:
                        logger.warning("Tesseract not found in common paths, trying system PATH")
                
                img = Image.open(temp_path)
                # Convert to RGB if necessary (for RGBA images)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                extracted_text = pytesseract.image_to_string(img)
                logger.info(f"OCR extraction: {len(extracted_text)} chars")
                
                # If OCR extraction yielded very little text, try AI-based description
                if len(extracted_text.strip()) < 50:
                    logger.info("OCR text too short, using AI to analyze image content...")
                    # Use the image filename and basic context for generation
                    extracted_text = f"Image file: {file.filename}. The image appears to contain educational or training content. Generate questions based on typical topics that would be covered in a training document with this name."
                    
            except ImportError as e:
                logger.warning(f"OCR import error: {e}. Falling back to AI-based generation.")
                # Fallback: Use AI to generate based on image filename context
                extracted_text = f"Image file: {file.filename}. Generate educational questions based on the topic suggested by this filename."
            except Exception as e:
                logger.warning(f"OCR processing error: {e}. Falling back to AI-based generation.")
                extracted_text = f"Image file: {file.filename}. Generate educational questions based on the topic suggested by this filename."
        
        # WORD DOCUMENT: Use python-docx
        elif "word" in content_type or "document" in content_type or file_extension in ["docx", "doc"]:
            logger.info("Extracting text from Word document...")
            try:
                from docx import Document
                doc = Document(temp_path)
                paragraphs = []
                for para in doc.paragraphs:
                    if para.text.strip():
                        paragraphs.append(para.text)
                # Also extract text from tables
                for table in doc.tables:
                    for row in table.rows:
                        row_text = ' | '.join(cell.text.strip() for cell in row.cells if cell.text.strip())
                        if row_text:
                            paragraphs.append(row_text)
                extracted_text = '\n'.join(paragraphs)
                logger.info(f"Word document extraction: {len(extracted_text)} chars")
            except ImportError:
                logger.error("python-docx not installed")
                raise HTTPException(status_code=500, detail="Word document processing library (python-docx) not installed. Please install it with: pip install python-docx")
            except Exception as e:
                logger.error(f"Word document processing error: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to process Word document: {str(e)}")
        
        # EXCEL SPREADSHEET: Use openpyxl
        elif "spreadsheet" in content_type or "excel" in content_type or file_extension in ["xlsx", "xls"]:
            logger.info("Extracting text from Excel spreadsheet...")
            try:
                from openpyxl import load_workbook
                wb = load_workbook(temp_path, data_only=True)
                all_text = []
                for sheet_name in wb.sheetnames:
                    sheet = wb[sheet_name]
                    all_text.append(f"Sheet: {sheet_name}")
                    for row in sheet.iter_rows():
                        row_values = [str(cell.value) for cell in row if cell.value is not None]
                        if row_values:
                            all_text.append(' | '.join(row_values))
                extracted_text = '\n'.join(all_text)
                logger.info(f"Excel extraction: {len(extracted_text)} chars")
            except ImportError:
                logger.error("openpyxl not installed")
                raise HTTPException(status_code=500, detail="Excel processing library (openpyxl) not installed. Please install it with: pip install openpyxl")
            except Exception as e:
                logger.error(f"Excel processing error: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to process Excel file: {str(e)}")
                
        # TEXT FILE: Read directly
        elif file_extension in ["txt", "md", "csv"]:
            logger.info("Reading text file...")
            with open(temp_path, "r", encoding="utf-8", errors="ignore") as f:
                extracted_text = f.read()
            logger.info(f"Text file: {len(extracted_text)} chars")
            
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")
        
        # Check if we got any text
        if not extracted_text or len(extracted_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="Could not extract enough text from the file")
        
        # 2. GENERATE QUIZ WITH GROQ
        logger.info("Generating quiz with Groq...")
        from groq import Groq
        groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])
        
        prompt = f"""Based on the following content, generate exactly {num_questions} multiple choice quiz questions.
Difficulty level: {difficulty}

CONTENT:
{extracted_text[:8000]}

Generate a JSON array with this exact structure:
[
  {{
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0
  }}
]

IMPORTANT:
- Generate exactly {num_questions} questions
- Each question must have exactly 4 options as strings in the 'options' array
- Include "correctIndex" field with the 0-based index of the correct answer (0, 1, 2, or 3)
- Make questions appropriate for the difficulty level
- Return ONLY the JSON array, no other text"""

        groq_start = time.time()
        print(f"🤖 Starting Groq AI quiz generation...")
        loop = asyncio.get_event_loop()
        completion = await loop.run_in_executor(None, lambda: groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3, # Lower temperature for stable JSON
            max_tokens=2000
        ))
        
        response_content = completion.choices[0].message.content.strip()
        print(f"🤖 Groq AI done: {time.time() - groq_start:.2f}s")
        print(f"✅ TOTAL TIME: {time.time() - start_time:.2f}s")
        print(f"{'='*50}\n")
        
        # Parse JSON from response with robust handling
        import re
        import json
        try:
            questions_list = []
            # Try to find JSON array
            json_match = re.search(r'\[[\s\S]*\]', response_content)
            if json_match:
                json_str = json_match.group()
                # Remove Markdown code blocks if present inside the match (rare but possible)
                json_str = json_str.replace("```json", "").replace("```", "")
                
                try:
                    questions_list = json.loads(json_str)
                except json.JSONDecodeError:
                    # Attempt to fix trailing commas
                    json_str = re.sub(r',\s*([\]}])', r'\1', json_str)
                    questions_list = json.loads(json_str) 
            else:
                 # Fallback: Check for JSON Object
                 json_obj_match = re.search(r'\{[\s\S]*\}', response_content)
                 if json_obj_match:
                     data = json.loads(json_obj_match.group())
                     questions_list = data.get("questions", [])
                     if not questions_list and "question" in data:
                         questions_list = [data]
                 else:
                     raise ValueError("No JSON structure found")
            
            if not questions_list:
                raise ValueError("Parsed JSON is empty or invalid")
                
        except Exception as e:
            logger.error(f"JSON Parse Error: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate valid quiz format. Please try again.")
        
        # 3. CREATE QUIZ OBJECT
        quiz_item = {
            "id": quiz_id,
            "title": title,
            "difficulty": difficulty,
            "time": f"{num_questions * 2} mins",
            "questions": questions_list,
            "source": "ai_generated",
            "extracted_text_preview": extracted_text[:200] + "...",
            "image": "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800",
            "created_at": datetime.now().isoformat()
        }
        
        # If preview_only, return without saving or broadcasting
        is_preview = preview_only.lower() == 'true'
        if is_preview:
            logger.info(f"AI Quiz Preview: {title} ({len(questions_list)} questions)")
            return {"status": "success", "data": quiz_item, "preview": True}
        
        live_quizzes.append(quiz_item)
        logger.info(f"AI Quiz Created: {title} ({len(questions_list)} questions)")
        
        # Broadcast to all connected clients
        await manager.broadcast({
            "type": "QUIZ_POSTED",
            "data": quiz_item
        })
        
        return {"status": "success", "data": quiz_item}
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"AI Quiz Generation Error: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")
    finally:
        # Cleanup temp files
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            audio_path = temp_path.replace(f".{file_extension}", ".mp3")
            if os.path.exists(audio_path):
                os.remove(audio_path)
        except:
            pass

@app.post("/notifications/send") # Renamed/Updated to match ManagerDashboard call which was trying /notifications/send but server had /notify? No, ManagerDashboard calls /notifications/send in one place and /notify in another. Let's standardize to /notify, but ManagerDashboard uses /notifications/send. I will use /notify and update ManagerDashboard to match OR assume ManagerDashboard was wrong.
# Actually, I'll stick to replacing the existing /notify and ensure ManagerDashboard uses it.
# Wait, let's check ManagerDashboard again. It calls: fetched `${API_URL}/notifications/send` in handleSendNotification.
# But server.py had `@app.post("/notify")`. This means the current code in ManagerDashboard MIGHT BE BROKEN or I missed where /notifications/send is defined.
# I will define this as `@app.post("/notifications/send")` to match ManagerDashboard's expectation and support uploads.

async def send_notification(
    title: str = Form(...),
    message: str = Form(...),
    type: str = Form("info"),
    file: Optional[UploadFile] = File(None)
):
    """
    Broadcasts a system-wide notification AND stores it.
    Supports optional media attachment (Image/Video).
    """
    import uuid
    from datetime import datetime
    
    # 1. Handle Media Upload
    media_url = None
    media_type = None
    
    if file:
        file_id = str(uuid.uuid4())
        ext = file.filename.split('.')[-1]
        filename = f"notif_{file_id}.{ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        media_url = f"{BASE_URL}/uploads/{filename}"
        if "video" in file.content_type:
            media_type = "video"
        elif "image" in file.content_type:
            media_type = "image"
        else:
            media_type = "file"

    # 2. Create Notification Object
    notif_id = str(uuid.uuid4())
    notification_data = {
        "id": notif_id,
        "title": title,
        "message": message,
        "type": type,
        "mediaUrl": media_url,
        "mediaType": media_type,
        "created_at": datetime.now().isoformat(),
        "read_by": [] 
    }
    
    # 3. Store in Memory
    notification_store.insert(0, notification_data)
    
    # 4. Broadcast
    logger.info(f"Broadcasting Notification: {title}")
    await manager.broadcast({
        "type": "NOTIFICATION",
        "data": notification_data
    })
    return {"status": "success", "id": notif_id}

@app.get("/notifications")
async def get_notifications():
    """Returns all stored notifications."""
    return notification_store

@app.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str):
    """Marks a notification as read (simulated)."""
    # In a real app we'd need user_id. For now just ack.
    for notif in notification_store:
        if notif["id"] == notif_id:
            return {"status": "success"}
    return {"status": "error", "message": "Not found"}

@app.get("/path/nodes")
async def get_path_nodes(user_email: str = "user", db: Session = Depends(get_db)):
    """
    Returns ordered learning path nodes with user-specific status (completed, active, locked).
    IMPORTANT: This endpoint only returns CAREER PROGRESSION nodes.
    Self-Learning nodes are served via /learning-paths/content/self_learning
    
    Now fetches from DATABASE for fresh data on newly uploaded courses.
    """
    # Get user info for access control (check DB first, then in-memory)
    db_user = db_ops.get_user_by_email(db, user_email)
    if db_user:
        user_role = db_user.role or "Waffler"
    else:
        user = users_store.get(user_email, {})
        user_role = user.get("role", "Waffler")
    
    # Fetch CAREER PROGRESSION nodes from DATABASE (ensures fresh data)
    raw_nodes = []
    try:
        from sqlalchemy import or_
        # Fetch CAREER PROGRESSION content only (excludes self_learning)
        db_content = db.query(DBContent).filter(
            or_(
                DBContent.learning_path_type == "career_progression",
                DBContent.learning_path_type == None,
                DBContent.learning_path_type == ""
            )
        ).order_by(DBContent.timestamp).all()
        
        for item in db_content:
            raw_nodes.append({
                "id": item.id,
                "title": item.title,
                "description": item.description or "",
                "videoUrl": item.video_url or item.file_url or "",
                "authorRole": "Store Manager",
                "timestamp": item.timestamp.isoformat() if item.timestamp else datetime.now().isoformat(),
                "isPathNode": item.is_path_node or False,
                "skippable": False,
                "xp": 50,
                "transcript": item.transcript or "",
                "quiz": item.quiz,
                "bucket": item.bucket,
                "learning_path_type": item.learning_path_type or "career_progression",
            })
    except Exception as e:
        logger.error(f"Error fetching path nodes from DB: {e}")
        # Fallback to in-memory content_store
        raw_nodes = [
            item for item in content_store 
            if item.get("isPathNode", False) and item.get("learning_path_type", "career_progression") != "self_learning"
        ]
    
    # Sort by timestamp (oldest first = linear order)
    raw_nodes.sort(key=lambda x: x.get("timestamp", ""))
    
    # Apply access control filtering - check DATABASE for rules first
    access_rules = None
    try:
        db_access_rule = db_ops.get_access_rule_by_level(db, user_role)
        if db_access_rule:
            access_rules = {
                "accessible_buckets": db_access_rule.accessible_buckets or [],
                "accessible_courses": db_access_rule.accessible_courses or [],
                "max_courses_visible": db_access_rule.max_courses_visible or -1
            }
    except Exception as e:
        logger.error(f"Error fetching access rules from DB: {e}")
    
    # Fallback to in-memory store
    if not access_rules:
        access_rules = access_control_store.get(user_role)
    
    if access_rules:
        # User has restricted access based on curriculum hierarchy
        accessible_buckets = access_rules.get("accessible_buckets", [])
        accessible_courses = access_rules.get("accessible_courses", [])
        max_visible = access_rules.get("max_courses_visible", -1)
        
        filtered_nodes = []
        for node in raw_nodes:
            bucket_id = node.get("bucket")
            course_id = node.get("id")
            
            # Access rules:
            # 1. Course is explicitly in accessible_courses list
            # 2. Course's bucket is in accessible_buckets list
            if course_id in accessible_courses or bucket_id in accessible_buckets:
                filtered_nodes.append(node)
        
        # Apply max visible limit if set (only if we have filtered content)
        if max_visible > 0 and len(filtered_nodes) > 0:
            filtered_nodes = filtered_nodes[:max_visible]
        
        # FALLBACK: If access control results in NO content, show all (avoid empty state)
        if len(filtered_nodes) == 0 and len(raw_nodes) > 0:
            logger.warning(f"Access control for {user_role} resulted in empty content. Showing all content as fallback.")
            raw_nodes = raw_nodes  # Keep all
        else:
            raw_nodes = filtered_nodes
    # else: user has full access (not in access_control_store means all access)
    
    # Get user's completed course IDs from DATABASE
    user_completed_ids = set()
    try:
        user_completed_ids = db_ops.get_user_completed_course_ids(db, user_email)
        completed_node_ids = db_ops.get_user_completed_node_ids(db, user_email)
        user_completed_ids = user_completed_ids.union(completed_node_ids)
    except Exception as e:
        logger.error(f"Error fetching completions from DB: {e}")
        # Fallback to in-memory
        user_completed_ids = {c["course_id"] for c in course_completions if c["user_email"] == user_email}
    
    # [FIX] Also check user_node_progress for completions (from robust learning path)
    if user_email in user_node_progress:
        for nid, progress_data in user_node_progress[user_email].items():
            if progress_data.get("completed", False):
                user_completed_ids.add(nid)
    
    response_nodes = []
    found_active = False
    
    for node in raw_nodes:
        # Create a copy to avoid mutating the global store
        node_resp = node.copy()
        node_id = node_resp.get("id")
        
        if node_id in user_completed_ids:
            node_resp["status"] = "completed"
        elif not found_active:
            # First non-completed node is active
            node_resp["status"] = "active"
            found_active = True
        else:
            # Subsequent nodes are locked
            node_resp["status"] = "locked"
            
        response_nodes.append(node_resp)
        
    return response_nodes

# ==========================================
# DUAL LEARNING PATHS ENDPOINTS
# ==========================================

@app.get("/learning-paths/self-learning-status/{user_email}")
async def get_self_learning_status(user_email: str, db: Session = Depends(get_db)):
    """Get user's self-learning completion status - OPTIMIZED with DB queries"""
    return db_ops.get_self_learning_status(db, user_email)

@app.post("/learning-paths/complete-self-learning/{user_email}")
async def complete_self_learning(user_email: str, db: Session = Depends(get_db)):
    """Mark user's self-learning as completed (called when all self-learning courses are done)"""
    # Update in database
    user = db_ops.get_user_by_email(db, user_email)
    if user:
        user.self_learning_completed = True
        db.commit()
        logger.info(f"User {user_email} completed self-learning path")

        # Broadcast event
        await manager.broadcast({
            "type": "SELF_LEARNING_COMPLETED",
            "data": {"user_email": user_email}
        })

        return {"status": "success", "message": "Self-learning completed, career progression unlocked!"}

    return {"status": "error", "message": "User not found"}

@app.get("/learning-paths/content/{path_type}")
async def get_learning_path_content_endpoint(path_type: str, user_email: str = "user", db: Session = Depends(get_db)):
    """
    Get courses for a specific learning path type - OPTIMIZED with DB queries.
    path_type: 'self_learning' or 'career_progression'
    """
    # Validate path type
    if path_type not in ["self_learning", "career_progression"]:
        raise HTTPException(status_code=400, detail="Invalid path type. Use 'self_learning' or 'career_progression'")

    return db_ops.get_learning_path_content(db, path_type, user_email)

# --- HYGIENE CHECK ENDPOINTS ---

@app.post("/hygiene/analyze")
async def analyze_hygiene(
    section: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Analyzes an image of a restaurant section using Groq Vision.
    Returns a cleanliness score (0-100) and improvement tips.
    """
    import base64
    
    logger.info(f"Analyzing Hygiene for section: {section}")
    
    # 1. Read file and encode to base64
    contents = await file.read()
    base64_image = base64.b64encode(contents).decode('utf-8')
    
    # 2. Call Groq Vision Model
    try:
        from groq import Groq
        print("sefrg")
        # Fixed Key (Same as before)
        groq_client = Groq(api_key=os.environ["GROQ_API_KEY"]) 
        
        prompt = f"""
        Analyze this image of a restaurant {section}. 
        Evaluate its cleanliness and organization.
        
        Return a strictly valid JSON object with:
        - "score": integer (0 to 100, where 100 is spotless)
        - "tips": list of strings (specific actionable advice if score < 100, otherwise positive reinforcement)
        
        Do not include any explanation, just the JSON.
        """
        
        completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}", 
                            },
                        },
                    ],
                }
            ],
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1024
        )
        
        response_content = completion.choices[0].message.content
        logger.info(f"Groq Vision Response: {response_content}")
        
        import re
        try:
            # Attempt to find JSON object structure in the response
            json_match = re.search(r"\{.*\}", response_content, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group(0))
            else:
                result = json.loads(response_content) # Fallback
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails completely
            logger.error("Failed to parse JSON from Groq response")
            result = {"score": 0, "tips": ["AI Analysis failed to format response. Please try again."]}

        return {
            "status": "success",
            "section": section,
            "score": result.get("score", 0),
            "tips": result.get("tips", [])
        }
        
    except Exception as e:
        logger.error(f"Hygiene Analysis Error: {e}")
        return {
            "status": "error", 
            "message": str(e),
            "score": 0,
            "tips": ["Could not analyze image. Please try again."]
        }


# --- QUIZ ENDPOINTS ---
class QuizCreateRequest(BaseModel):
    title: str
    description: str
    questions: list
    created_by: str

@app.post("/quiz/create")
async def create_quiz(payload: QuizCreateRequest, db: Session = Depends(get_db)):
    """
    Create a new quiz and broadcast to all users.
    """
    try:
        quiz_id = str(uuid.uuid4())
        quiz_data = {
            "id": quiz_id,
            "title": payload.title,
            "description": payload.description,
            "questions": payload.questions,
            "created_by": payload.created_by,
            "difficulty": "medium",
            "time_limit": "15 mins",
            "source": "manual"
        }

        # Create in database
        db_quiz = db_ops.create_quiz(db, quiz_data)

        # Also store in memory for backward compatibility
        memory_quiz = {
            **quiz_data,
            "created_at": datetime.now().isoformat()
        }
        quiz_store.append(memory_quiz)

        logger.info(f"Quiz Created: {quiz_data['title']} by {quiz_data['created_by']}")

        # Broadcast quiz assignment notification
        await manager.broadcast({
            "type": "QUIZ_ASSIGNED",
            "data": {
                "quiz_id": quiz_id,
                "title": payload.title,
                "description": payload.description,
                "question_count": len(payload.questions)
            }
        })

        return {"status": "success", "quiz_id": quiz_id}

    except Exception as e:
        logger.error(f"Error creating quiz: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create quiz: {str(e)}")

@app.get("/quiz/list")
async def list_quizzes(db: Session = Depends(get_db)):
    """
    Get all created quizzes (without answers).
    """
    quizzes = []

    # Get quizzes from database
    db_quizzes = db_ops.get_all_quizzes(db)
    for quiz in db_quizzes:
        quiz_copy = {
            "id": quiz.id,
            "title": quiz.title,
            "description": quiz.description,
            "created_at": quiz.created_at.isoformat() if quiz.created_at else datetime.now().isoformat(),
            "created_by": quiz.created_by,
            "difficulty": quiz.difficulty,
            "time_limit": quiz.time_limit,
            "questions": [
                {
                    "question": q.get("question", ""),
                    "options": q.get("options", [])
                } for q in (quiz.questions or [])
            ]
        }
        quizzes.append(quiz_copy)

    # Merge with in-memory quizzes (for backward compatibility)
    existing_ids = {q["id"] for q in quizzes}
    for quiz in quiz_store:
        if quiz.get("id") not in existing_ids:
            # Remove correct answers from response
            quiz_copy = quiz.copy()
            quiz_copy["questions"] = [
                {
                    "question": q["question"],
                    "options": q["options"]
                } for q in quiz["questions"]
            ]
            quizzes.append(quiz_copy)

    return quizzes

class GenerateQuizRequest(BaseModel):
    transcript: str

@app.post("/ai/generate_quiz")
async def generate_quiz_ondemand(request: GenerateQuizRequest):
    logger.info("Generating Quiz on-demand...")
    from groq import Groq
    groq_client = Groq(api_key=os.environ["GROQ_API_KEY"]) 
    
    prompt = f"""
    Based on this training video transcript, generate 3 multiple-choice quiz questions.
    Format purely as a JSON array of objects with keys: 'question', 'options' (array of 4 strings), 'correctIndex' (0-3).
    
    Transcript: "{request.transcript}"
    """
    
    try:
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.5
        )
        
        content = completion.choices[0].message.content
        import json
        import re
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            json_response = json.loads(match.group(0))
        else:
            json_response = json.loads(content)
            
        if "questions" in json_response:
             return {"questions": json_response["questions"]}
        else:
             return json_response
             
    except Exception as e:
        logger.error(f"Quiz Gen Error: {e}")
        # Return fallback quiz for testing
        return { "questions": [
            { "question": "What is the primary topic?", "options": ["Topic A", "Topic B", "Topic C", "Topic D"], "correctIndex": 0 },
            { "question": "Why is this important?", "options": ["Reason 1", "Reason 2", "Reason 3", "Reason 4"], "correctIndex": 1 },
            { "question": "How do you proceed?", "options": ["Step 1", "Step 2", "Step 3", "Step 4"], "correctIndex": 0 },
        ]}


@app.get("/quiz/{quiz_id}")
async def get_quiz(quiz_id: str, db: Session = Depends(get_db)):
    """
    Get specific quiz details (for taking quiz).
    """
    # Try database first
    db_quiz = db_ops.get_quiz_by_id(db, quiz_id)
    if db_quiz:
        return {
            "id": db_quiz.id,
            "title": db_quiz.title,
            "description": db_quiz.description,
            "questions": [
                {
                    "question": q.get("question", ""),
                    "options": q.get("options", [])
                } for q in (db_quiz.questions or [])
            ]
        }

    # Fallback to in-memory store
    for quiz in quiz_store:
        if quiz["id"] == quiz_id:
            # Return without correct answers
            return {
                "id": quiz["id"],
                "title": quiz["title"],
                "description": quiz["description"],
                "questions": [
                    {
                        "question": q["question"],
                        "options": q["options"]
                    } for q in quiz["questions"]
                ]
            }
    return {"error": "Quiz not found"}

@app.post("/quiz/submit")
async def submit_quiz(submission: QuizSubmission, db: Session = Depends(get_db)):
    """
    Submit quiz answers and calculate score.
    """
    try:
        # Find quiz from database
        db_quiz = db_ops.get_quiz_by_id(db, submission.quiz_id)
        quiz = None
        if db_quiz:
            quiz = {
                "id": db_quiz.id,
                "title": db_quiz.title,
                "questions": db_quiz.questions or []
            }
        else:
            # Fallback to in-memory store
            for q in quiz_store:
                if q["id"] == submission.quiz_id:
                    quiz = q
                    break

        if not quiz:
            return {"error": "Quiz not found"}

        # Calculate score
        score = 0
        for i, answer in enumerate(submission.answers):
            if i < len(quiz["questions"]):
                if answer == quiz["questions"][i]["correctIndex"]:
                    score += 1

        # Save submission to database
        submission_data = {
            "id": str(uuid.uuid4()),
            "quiz_id": submission.quiz_id,
            "user_name": submission.user_name,
            "user_email": None,
            "answers": submission.answers,
            "score": float(score)
        }

        try:
            db_submission = db_ops.create_quiz_submission(db, submission_data)
        except Exception as db_error:
            logger.error(f"Database quiz submission error: {db_error}")
            db.rollback()
            # Continue with in-memory tracking

        # Also store in memory for backward compatibility
        memory_submission = {
            **submission_data,
            "total": len(quiz["questions"]),
            "submitted_at": datetime.now().isoformat()
        }
        quiz_submissions.append(memory_submission)

        logger.info(f"Quiz Submitted: {submission.user_name} scored {score}/{len(quiz['questions'])}")

        return {
            "status": "success",
            "score": score,
            "total": len(quiz["questions"]),
            "percentage": round((score / len(quiz["questions"])) * 100, 2)
        }

    except Exception as e:
        logger.error(f"Error submitting quiz: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to submit quiz: {str(e)}")

@app.get("/quiz/{quiz_id}/results")
async def get_quiz_results(quiz_id: str):
    """
    Get all submissions for a specific quiz (for managers).
    """
    # Find quiz
    quiz = None
    for q in quiz_store:
        if q["id"] == quiz_id:
            quiz = q
            break
    
    if not quiz:
        return {"error": "Quiz not found"}
    
    
    # Get submissions for this quiz
    submissions = [s for s in quiz_submissions if s["quiz_id"] == quiz_id]
    
    # Calculate statistics
    total_submissions = len(submissions)
    avg_score = sum(s["score"] for s in submissions) / total_submissions if total_submissions > 0 else 0
    
    return {
        "quiz_title": quiz["title"],
        "quiz_description": quiz["description"],
        "total_submissions": total_submissions,
        "average_score": round(avg_score, 2),
        "total_questions": len(quiz["questions"]),
        "submissions": submissions
    }

class StartRequest(BaseModel):
    scenario_id: str

class RoleplayRequest(BaseModel):
    user_text: str
    history: List[dict] = []

# --- STORAGE ---
simulation_history = []  # Store past simulation sessions

# --- HELPER: Process Roleplay Logic ---
async def process_roleplay_logic(user_text: str, history: List[dict]):
    import requests
    import base64
    from groq import Groq
    import json
    import uuid
    from datetime import datetime
    
    # 1. TEXT GENERATION (GROQ)
    try:
        groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])
        
        system_prompt = """
        You are an angry Indian customer at 'The Belgian Waffle Co.'.
        The user is the store manager or support agent trying to resolve your complaint.

        CONTEXT:
        - You ordered a 'Triple Chocolate Waffle' 45 minutes ago via Swiggy/Zomato.
        - The delivery arrived VERY LATE, and the waffle was COLD and SOGGY.
        - You are extremely frustrated, hungry, and considering leaving a bad review.
        - You speak naturally in Hinglish (Hindi + English mix).
        
        TASK:
        1. Analyze the User's response for: EMPATHY, POLITENESS, PROBLEM-SOLVING, and PROFESSIONALISM.
        2. Generate a Score (0-100) based on their overall performance.
        3. Generate an EMPATHY score (0-100) specifically measuring how well they acknowledged your feelings.
        4. Track RESOLUTION PROGRESS (0-100): How close is the user to resolving your complaint?
           - 0-20: No resolution attempted
           - 21-50: Acknowledged issue, but no concrete solution
           - 51-80: Offered partial solution (apology, small compensation)
           - 81-100: Full resolution (refund, replacement, sincere apology with compensation)
        5. Provide a short, constructive TIP on how they could improve (max 15 words).
        6. Continue the roleplay as the customer. Be realistic - if they resolve well, calm down. If rude, get angrier!
        
        OUTPUT FORMAT (JSON ONLY):
        {
            "customer_response": "Arre bhai, kya mazaak hai ye? Itna wait kiya maine!",
            "mood_score": 20,
            "user_score": 75,
            "empathy_score": 60,
            "resolution_progress": 30,
            "improvement_tip": "Offer a concrete solution like refund or replacement."
        }
        """
        
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history[-5:]: # Context
            # Filter only text content for simplicity in prompt context
             messages.append({"role": "user" if msg.get('sender', 'ai') == 'user' else "assistant", "content": msg.get('text', '')})
             
        messages.append({"role": "user", "content": user_text})

        logger.info("Sending request to Groq...")
        
        completion = groq_client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=300,
            response_format={"type": "json_object"}
        )

        response_content = completion.choices[0].message.content
        logger.info(f"Groq Response: {response_content}")
        
        result_json = json.loads(response_content)
        
        # 2. GENERATE AUDIO (ElevenLabs)
        if "customer_response" in result_json:
            audio_b64 = generate_elevenlabs_audio(result_json["customer_response"])
            result_json["audio_base64"] = audio_b64
            
        return result_json

    except Exception as e:
        logger.error(f"Roleplay Logic Error: {e}")
        return {
            "customer_response": "Check internet connection...",
            "mood_score": 0,
            "user_score": 0,
            "improvement_tip": "Error"
        }

# --- VOICE CHAT ENDPOINT ---
@app.post("/ai/voice_query")
async def voice_query(file: UploadFile = File(...)):
    """
    Receives audio blob, Transcribes (Whisper) -> Answers (Groq).
    """
    try:
        # 1. SAVE TEMP AUDIO
        unique_id = str(uuid.uuid4())
        audio_path = f"{UPLOAD_DIR}/voice_query_{unique_id}.m4a" # Assuming m4a from client
        with open(audio_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. TRANSCRIBE (Whisper)
        logger.info(f"Transcribing voice query: {audio_path}")
        # Added prompt for Hinglish context
        result = whisper_model.transcribe(audio_path, initial_prompt="Hindi code-switching, restaurant operations context.") 
        transcript = result["text"]
        logger.info(f"User Query: {transcript}")
        
        # Clean up
        if os.path.exists(audio_path):
            os.remove(audio_path)
            
        # 3. GENERATE ANSWER (Groq)
        if not transcript.strip():
             return {"user_text": "", "ai_response": "I couldn't hear you. Please try again."}

        from groq import Groq
        groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])
        
        system_prompt = """
        You are the 'Belgian Waffle Co. AI Assistant'. 
        Your goal is to help Store Managers with RECIPES, SOPs, and OPERATIONS.
        Keep answers CONCISE (max 2 sentences) and helpful. 
        If asked about waffles, mention 'Crispy & Golden'.
        """
        
        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": transcript}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=150
        )
        
        ai_response = completion.choices[0].message.content
        
        return {
            "status": "success",
            "user_text": transcript,
            "ai_response": ai_response
        }

    except Exception as e:
        logger.error(f"Voice Query Error: {e}")
        return {"status": "error", "message": str(e)}
        
        # Enforce JSON mode
        completion = groq_client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        ai_data_raw = completion.choices[0].message.content
        logger.info(f"AI Response Raw: {ai_data_raw}")
        
        ai_data = json.loads(ai_data_raw)
        
        ai_response_text = ai_data.get("customer_response", "Sorry, I didn't get that.")
        mood_score = ai_data.get("mood_score", 50)
        user_score = ai_data.get("user_score", 50)
        tip = ai_data.get("improvement_tip", "Keep listening.")

    except Exception as e:
        logger.error(f"Groq Detailed Error: {e}")
        return {"error": f"AI Text Gen Failed: {str(e)}"}

    # 2. AUDIO GENERATION (ELEVENLABS)
    # Use the global ELEVENLABS_API_KEY from environment
    FEEDBACK_VOICE_ID = "Y6nOpHQlW4lnf9GRRc8f"  # Different voice for feedback
    URL = f"https://api.elevenlabs.io/v1/text-to-speech/{FEEDBACK_VOICE_ID}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "text": ai_response_text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.35,
            "similarity_boost": 0.75,
            "style": 0.85,
            "use_speaker_boost": True
        }
    }

    # logger.info(f"Sending Audio to ElevenLabs...") # Reduce log noise
    audio_base64 = None
    try:
        voice_response = requests.post(URL, json=data, headers=headers)
        if voice_response.status_code == 200:
            audio_base64 = base64.b64encode(voice_response.content).decode('utf-8')
        else:
            logger.error(f"ElevenLabs Error: {voice_response.text}")
    except Exception as e:
        logger.error(f"Voice Gen Exception: {e}")

    # 3. SAVE TO HISTORY
    timestamp = datetime.now().isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "user_text": user_text,
        "ai_response": ai_response_text,
        "score": user_score,
        "tip": tip,
        "timestamp": timestamp
    }
    simulation_history.append(record)

    return {
        "text": ai_response_text,
        "audio_base64": audio_base64,
        "mood": mood_score,
        "user_score": user_score,
        "tip": tip
    }

@app.post("/ai/roleplay/start")
async def start_roleplay_endpoint(request: StartRequest):
    logger.info(f"--- START SIMULATION ({request.scenario_id}) ---")
    
    scenarios = {
        "late_order": {"prompt": "Start by complaining loudly in Hinglish about your late waffle order.", "mood": 20},
        "wrong_item": {"prompt": "Start by saying you received a plain waffle instead of chocolate. Be annoyed.", "mood": 30},
        "default": {"prompt": "Start by complaining about cold waffles delivered late.", "mood": 20}
    }
    
    scenario = scenarios.get(request.scenario_id, scenarios["default"])
    
    # Generate Opening Line
    result = await process_roleplay_logic(scenario["prompt"], []) # user_text is actually the instruction here
    result["mood"] = scenario["mood"] # Force initial mood
    return result

@app.post("/ai/roleplay")
async def roleplay_endpoint(request: RoleplayRequest):
    logger.info(f"--- TEXT RQ ---")
    return await process_roleplay_logic(request.user_text, request.history)

@app.post("/ai/roleplay/voice")
async def roleplay_voice_endpoint(file: UploadFile = File(...), history: str = Form("[]")):
    logger.info(f"--- VOICE RQ ---")
    
        # 1. SAVE TEMP FILE
    temp_filename = f"temp_{uuid.uuid4()}.m4a"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(temp_filename)
        logger.info(f"Received Audio File: {temp_filename}, Size: {file_size} bytes")

        # 2. TRANSCRIBE (Using Groq Whisper API)
        try:
            result = ai_services.transcribe_audio(temp_filename, language="en")
            user_text = result.get("text", "").strip() if result else ""
            logger.info(f"Transcribed: {user_text[:80]}...")
        except Exception as transcribe_err:
            logger.error(f"Transcription error: {transcribe_err}")
            user_text = ""
        
        # Cleanup
        os.remove(temp_filename)

        if not user_text:
            return {"error": "Could not understand audio"}

        # 3. PROCESS
        history_list = json.loads(history)
        ai_result = await process_roleplay_logic(user_text, history_list)
        ai_result["user_transcription"] = user_text
        return ai_result

    except Exception as e:
        logger.error(f"Voice Processing Error: {e}")
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return {"error": f"Voice Processing Failed: {str(e)}"}

@app.get("/ai/simulation/history")
async def get_simulation_history():
    return simulation_history[::-1] # Newest first


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    logger.info(f"Client connected. Active connections: {len(manager.active_connections)}")
    try:
        while True:
            # Keep connection alive, maybe listen for client pings
            data = await websocket.receive_text()
            # We don't expect much input from clients in this simple version
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"Client disconnected. Active connections: {len(manager.active_connections)}")
    except Exception as e:
        logger.error(f"WS Error: {e}")
        manager.disconnect(websocket)

@app.post("/notifications/send")
async def send_notification_endpoint(
    title: str = Form(...),
    message: str = Form(...),
    type: str = Form("ordinary"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """Send a notification to all users. Supports optional image/video upload to CDN."""
    try:
        notification_id = str(uuid.uuid4())

        # Handle file upload if present - upload to CDN
        media_url = None
        if file and file.filename:
            file_extension = file.filename.split('.')[-1].lower()
            file_name = f"notif_{notification_id}.{file_extension}"
            file_path = os.path.join(UPLOAD_DIR, file_name)

            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)

            # Upload to Cloudflare R2 CDN
            if cdn_service.CDN_ENABLED:
                cdn_object_key = f"notifications/{file_name}"
                content_type = cdn_service.get_content_type(file_name)
                cdn_url = cdn_service.upload_to_cdn(file_path, cdn_object_key, content_type)
                if cdn_url:
                    media_url = cdn_url
                    logger.info(f"Notification media uploaded to CDN: {cdn_url}")
                    # Delete local file after successful CDN upload
                    try:
                        os.remove(file_path)
                    except:
                        pass
                else:
                    media_url = f"{BASE_URL}/uploads/{file_name}"
                    logger.warning("CDN upload failed for notification, using local storage")
            else:
                media_url = f"{BASE_URL}/uploads/{file_name}"
                logger.info(f"Notification media uploaded locally: {media_url}")

        # Create notification in DATABASE
        notification_data = {
            "id": notification_id,
            "title": title,
            "message": message,
            "notification_type": type,
            "is_crucial": type == 'crucial',
            "priority": "high" if type == 'crucial' else "normal",
            "read_by": [],
            "target_users": []
        }

        try:
            db_notif = db_ops.create_notification(db, notification_data)
        except Exception as db_error:
            logger.error(f"Database notification error: {db_error}")
            db.rollback()
            # Continue with in-memory tracking

        # Also store in memory for backward compatibility
        new_notif = {
            "id": notification_id,
            "title": title,
            "message": message,
            "type": type,
            "mediaUrl": media_url,
            "created_at": datetime.now().isoformat(),
            "read_by": []
        }
        notification_store.insert(0, new_notif)

        # For crucial notifications, also store in crucial_notification_store for blocking modal
        if type == 'crucial':
            crucial_notification_store["current"] = new_notif

        logger.info(f"Broadcasting Notification: {title}")

        # Broadcast to all users
        await manager.broadcast({
            "type": "CRUCIAL_NOTIFICATION" if type == 'crucial' else "NOTIFICATION",
            "data": new_notif
        })

        return {"status": "success", "id": notification_id}

    except Exception as e:
        logger.error(f"Error sending notification: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send notification: {str(e)}")

@app.get("/notifications")
async def get_notifications(user_id: Optional[str] = "user", db: Session = Depends(get_db)):
    # Get notifications from database
    db_notifications = db_ops.get_all_notifications(db, limit=100)
    results = []

    for n in db_notifications:
        results.append({
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.notification_type or "ordinary",
            "created_at": n.created_at.isoformat() if n.created_at else datetime.now().isoformat(),
            "read_by": n.read_by or [],
            "isRead": user_id in (n.read_by or []),
            "mediaUrl": None
        })

    # Merge with in-memory notifications
    existing_ids = {r["id"] for r in results}
    for n in notification_store:
        if n.get("id") not in existing_ids:
            n_copy = n.copy()
            n_copy["isRead"] = user_id in n["read_by"]
            results.append(n_copy)

    return results

@app.get("/notifications/crucial")
async def get_crucial_notifications(user_id: str = "user"):
    """Returns the first unread crucial notification for this user (for blocking modal)"""
    # FIRST check crucial_notification_store (from /notifications/send)
    if crucial_notification_store.get("current"):
        current = crucial_notification_store["current"]
        if user_id not in current.get("read_by", []):
            # Return formatted response with all fields including read status
            return {
                "id": current["id"],
                "title": current["title"],
                "message": current["message"],
                "type": current["type"],
                "read": False,
                "created_at": current.get("created_at"),
                "mediaUrl": current.get("mediaUrl")  # Image URL
            }
    
    # THEN check legacy notification_store
    for n in notification_store:
        if n.get("type") == "crucial" and user_id not in n.get("read_by", []):
            return {
                "id": n["id"],
                "title": n["title"],
                "message": n["message"],
                "type": n["type"],
                "read": False,
                "created_at": n.get("created_at"),
                "mediaUrl": n.get("mediaUrl") or n.get("image")  # Include image URL
            }
    # No unread crucial notifications
    return {"id": None, "read": True}

@app.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user_id: str = "user", db: Session = Depends(get_db)):
    try:
        # Mark as read in database
        db_ops.mark_notification_read(db, notif_id, user_id)

        # Check crucial_notification_store first
        if crucial_notification_store.get("current"):
            current = crucial_notification_store["current"]
            if current.get("id") == notif_id:
                if user_id not in current.get("read_by", []):
                    current["read_by"].append(user_id)
                # Clear the current crucial notification since it's been acknowledged
                crucial_notification_store["current"] = None
                return {"status": "success"}

        # Check regular notification_store
        for n in notification_store:
            if n["id"] == notif_id:
                if user_id not in n["read_by"]:
                    n["read_by"].append(user_id)
                return {"status": "success"}

        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error marking notification as read: {e}")
        raise HTTPException(status_code=404, detail="Notification not found")


# ==========================================
# EMPLOYEE ACTIVITY LOGGING
# ==========================================

employee_activity_log = []  # Stores all user actions

def log_user_activity(user_email: str, action: str, details: str = "", metadata: dict = None):
    """
    Log a user action for reporting.
    """
    try:
        user_name = users_store.get(user_email, {}).get('name', user_email)
        
        log_entry = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "user_name": user_name,
            "action": action, # e.g., "LOGIN", "COURSE_START", "COURSE_COMPLETE", "QUIZ", "ATTENDANCE"
            "details": details,
            "metadata": metadata or {},
            "timestamp": datetime.now().isoformat(),
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        
        employee_activity_log.append(log_entry)
        logger.info(f"ACTIVITY LOG [{user_email}]: {action} - {details}")
        return log_entry
    except Exception as e:
        logger.error(f"Failed to log activity: {e}")
        return None

@app.get("/analytics/activity-log/{user_email}")
async def get_user_activity_log(user_email: str):
    """Get chronological activity history for a specific user"""
    logs = [log for log in employee_activity_log if log["user_email"] == user_email]
    return sorted(logs, key=lambda x: x["timestamp"], reverse=True)

@app.get("/analytics/detailed-report/{user_email}")
async def get_user_detailed_report(user_email: str):
    """Get aggregated data for detailed employee report"""
    # 1. Profile
    user = users_store.get(user_email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # 2. Activity Log
    logs = [log for log in employee_activity_log if log["user_email"] == user_email]
    logs.sort(key=lambda x: x["timestamp"], reverse=True)
    
    # 3. Completions
    completions = [c for c in course_completions if c["user_email"] == user_email]
    
    # 4. Quizzes
    quizzes = [s for s in quiz_submissions if s.get("user_name") == user.get("name")]
    
    # 5. Attendance
    attendance = [r for r in attendance_records if r['user_id'] == user_email]
    
    return {
        "user_profile": {
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "store": user["store"],
            "joined": user.get("created_at")
        },
        "stats": {
            "total_logins": len([l for l in logs if l["action"] == "LOGIN"]),
            "courses_completed": len(completions),
            "quizzes_taken": len(quizzes),
            "days_present": len(set([a.get("punch_in", "").split("T")[0] for a in attendance])),
            "last_active": logs[0]["timestamp"] if logs else None
        },
        "recent_activity": logs[:50], # Recent 50 actions
        "performance_metrics": {
            "avg_quiz_score": sum([q.get("score", 0) for q in quizzes]) / max(len(quizzes), 1),
            "total_xp": user_learning_profiles.get(user_email, {}).get("total_xp", 0)
        }
    }

# ==========================================
# LOCATION TRACKING APIs
# ==========================================

@app.post("/location/update")
async def update_location(data: dict, db: Session = Depends(get_db)):
    """
    Employee sends GPS coordinates.
    Stores in location_store with active=True.
    """
    user_id = data.get('user_id')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    timestamp = data.get('timestamp')

    # Get user name from users_store
    user_name = users_store.get(user_id, {}).get('name', user_id)

    location_data = {
        "user_id": user_id,
        "name": user_name,
        "latitude": latitude,
        "longitude": longitude,
        "timestamp": timestamp,
        "active": True
    }

    # Save to database
    try:
        db_ops.update_location(db, user_id, {
            "name": user_name,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": datetime.now(),
            "active": True
        })
    except Exception as e:
        logger.error(f"Error saving location to DB: {e}")

    # Also keep in memory for backward compatibility
    location_store[user_id] = location_data

    logger.info(f"Location updated for {user_name}: ({latitude}, {longitude})")
    return {"status": "success"}


@app.post("/location/stop")
async def stop_location(data: dict, db: Session = Depends(get_db)):
    """
    Employee stops sharing location.
    Sets active=False.
    """
    user_id = data.get('user_id')

    # Update in database
    try:
        db_ops.update_location(db, user_id, {"active": False})
    except Exception as e:
        logger.error(f"Error updating location in DB: {e}")

    # Also update in-memory
    if user_id in location_store:
        location_store[user_id]["active"] = False
        logger.info(f"Location tracking stopped for {user_id}")
    return {"status": "stopped"}


@app.get("/location/all")
async def get_all_locations(db: Session = Depends(get_db)):
    """
    Returns all employee locations for Admin/Manager.
    """
    # Try database first
    try:
        db_locations = db_ops.get_all_locations(db, active_only=False)
        if db_locations:
            locations = []
            for loc in db_locations:
                loc_dict = db_ops.model_to_dict(loc)
                if loc_dict.get("timestamp") and hasattr(loc_dict["timestamp"], "isoformat"):
                    loc_dict["timestamp"] = loc_dict["timestamp"].isoformat()
                locations.append(loc_dict)
            # Merge with in-memory
            existing_ids = {loc.get("user_email") or loc.get("user_id") for loc in locations}
            for user_id, loc in location_store.items():
                if user_id not in existing_ids:
                    locations.append(loc)
            return locations
    except Exception as e:
        logger.error(f"Error fetching locations from DB: {e}")
    return list(location_store.values())


@app.post("/users/login")
@limiter.limit("5/minute")
async def login_user(request: Request, data: dict, db: Session = Depends(get_db)):
    """
    Authenticates a user and returns their profile with JWT token.
    Rate limited to 5 attempts per minute.
    """
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return {"status": "error", "message": "Email and password are required"}

    # Sanitize email input
    email = sanitize_string(email, max_length=255).lower().strip()

    user_data = None
    password_valid = False

    # Try database first
    user_db = db_ops.get_user_by_email(db, email)
    if user_db:
        # Check password - support both hashed and legacy plaintext
        if is_password_hashed(user_db.password):
            password_valid = verify_password(password, user_db.password)
        else:
            # Legacy plaintext comparison (for migration period)
            password_valid = user_db.password == password

        if password_valid:
            user_data = {
                "email": user_db.email,
                "name": user_db.name,
                "role": user_db.role or "User",
                "category": user_db.category or "Employee",
                "privileges": user_db.privileges or [],
                "is_superadmin": user_db.is_superadmin or False,
                "has_admin_access": user_db.has_admin_access or False,
                "store": user_db.store or "Unassigned",
                "self_learning_completed": user_db.self_learning_completed or False
            }

    # Fallback to in-memory store for backward compatibility
    if not user_data and email in users_store:
        user = users_store[email]
        stored_password = user.get("password", "")

        # Check password - support both hashed and legacy plaintext
        if is_password_hashed(stored_password):
            password_valid = verify_password(password, stored_password)
        else:
            password_valid = stored_password == password

        if password_valid:
            user_data = {
                "email": user["email"],
                "name": user["name"],
                "role": user.get("role", "User"),
                "category": user.get("category", "Employee"),
                "privileges": user.get("privileges", []),
                "is_superadmin": user.get("is_superadmin", False),
                "has_admin_access": user.get("has_admin_access", False),
                "store": user.get("store", "Unassigned"),
                "self_learning_completed": user.get("self_learning_completed", False)
            }

    if user_data:
        # Login successful - generate JWT tokens
        log_user_activity(email, "LOGIN", "User logged in")

        token_data = generate_user_token_data(user_data)
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(email)

        return {
            "status": "success",
            "user": user_data,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }

    return {"status": "error", "message": "Invalid credentials"}


# ==========================================
# USER MANAGEMENT APIs
# ==========================================

@app.post("/users/create")
@limiter.limit("10/hour")
async def create_user(request: Request, data: dict, db: Session = Depends(get_db)):
    """
    Creates a new user account with category, privileges, and store assignment.
    Passwords are securely hashed using bcrypt.
    Rate limited to 10 creations per hour.
    """
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    role = data.get('role', 'Employee')
    category = data.get('category', 'Employee')
    privileges = data.get('privileges', [])
    store = data.get('store', 'Unassigned')

    # Validation
    if not name or not email or not password:
        return {"status": "error", "message": "Missing required fields"}

    # Sanitize inputs
    name = sanitize_string(name, max_length=255)
    email = sanitize_string(email, max_length=255).lower().strip()
    store = sanitize_string(store, max_length=255)

    # Validate email format
    if not validate_email(email):
        return {"status": "error", "message": "Invalid email format"}

    # Validate password strength
    is_valid, error_msg = validate_password_strength(password)
    if not is_valid:
        return {"status": "error", "message": error_msg}

    # Check if user exists in database
    existing_user = db_ops.get_user_by_email(db, email)
    if existing_user:
        return {"status": "error", "message": "User already exists"}

    # Check in-memory store as well (for backward compatibility)
    if email in users_store:
        return {"status": "error", "message": "User already exists"}

    # Validate privileges - ensure they are valid
    valid_privileges = [p for p in privileges if p in ALL_PRIVILEGES]

    # Determine if user has admin access based on privileges or category
    has_admin_access = len(valid_privileges) > 0 or category in ['Super Admin', 'Manager', 'Supervisor']

    # Hash the password securely
    hashed_password = hash_password(password)

    # Create user in database
    try:
        user_data = {
            "email": email,
            "name": name,
            "password": hashed_password,  # Now properly hashed
            "role": role,
            "category": category,
            "privileges": valid_privileges,
            "is_superadmin": category == 'Super Admin',
            "has_admin_access": has_admin_access,
            "store": store,
            "self_learning_completed": False
        }
        db_user = db_ops.create_user(db, user_data)

        logger.info(f"User created in DB: {name} ({email}) - Role: {role} - Store: {store}")

        # Also add to in-memory store for backward compatibility
        users_store[email] = {
            **user_data,
            "created_at": datetime.now().isoformat()
        }

        # [AUDIT] Log user creation
        log_action("CREATE_USER", name, f"Created new {role} account for {email} ({store})")

        return {"status": "success", "user_id": email, "privileges_count": len(valid_privileges)}

    except Exception as e:
        logger.error(f"Error creating user: {e}")
        db.rollback()
        return {"status": "error", "message": f"Failed to create user: {str(e)}"}


@app.post("/users/update")
async def update_user(data: dict, db: Session = Depends(get_db)):
    """
    Updates an existing user's privileges, role, and store assignment.
    """
    email = data.get('email')
    if not email:
        return {"status": "error", "message": "Email is required"}

    # Try database first
    user_db = db_ops.get_user_by_email(db, email)
    if not user_db and email not in users_store:
        return {"status": "error", "message": "User not found"}

    try:
        updates = {}

        # Build updates dictionary
        if 'role' in data:
            updates['role'] = data['role']
        if 'category' in data:
            updates['category'] = data['category']
        if 'name' in data:
            updates['name'] = data['name']
        if 'store' in data:
            updates['store'] = data['store']
        if 'privileges' in data:
            valid_privileges = [p for p in data['privileges'] if p in ALL_PRIVILEGES]
            updates['privileges'] = valid_privileges
            category = data.get('category', user_db.category if user_db else users_store[email].get('category'))
            updates['has_admin_access'] = len(valid_privileges) > 0 or category in ['Super Admin', 'Manager', 'Supervisor']

            # Update superadmin status if category changes
            if category == 'Super Admin':
                updates['is_superadmin'] = True

        # Update in database
        if user_db:
            updated_user = db_ops.update_user(db, email, updates)
            logger.info(f"User updated in DB: {email} - Updates: {updates}")

        # Update in-memory store for backward compatibility
        if email in users_store:
            user = users_store[email]
            for key, value in updates.items():
                user[key] = value

        logger.info(f"User updated: {email} - Store: {updates.get('store')} - Privileges: {updates.get('privileges')}")
        return {"status": "success", "message": "User updated successfully"}

    except Exception as e:
        logger.error(f"Error updating user: {e}")
        db.rollback()
        return {"status": "error", "message": f"Failed to update user: {str(e)}"}


@app.get("/users/list")
async def list_users(
    page: int = 1,
    limit: int = 50,
    search: str = "",
    store: str = "",
    role: str = "",
    db: Session = Depends(get_db)
):
    """
    Returns all users (without passwords) with pagination and filtering.
    Supports search by name/email, filter by store and role.
    """
    users = []

    # Get users from database
    db_users = db_ops.get_all_users(db)
    for user_db in db_users:
        users.append({
            "email": user_db.email,
            "name": user_db.name,
            "role": user_db.role or "User",
            "category": user_db.category or "Employee",
            "privileges": user_db.privileges or [],
            "is_superadmin": user_db.is_superadmin or False,
            "has_admin_access": user_db.has_admin_access or False,
            "store": user_db.store or "Unassigned",
            "created_at": user_db.created_at.isoformat() if user_db.created_at else ""
        })

    # Merge with in-memory users (for backward compatibility)
    existing_emails = {u["email"] for u in users}
    for email, user_data in users_store.items():
        if email not in existing_emails:
            users.append({
                "email": user_data["email"],
                "name": user_data["name"],
                "role": user_data.get("role", "User"),
                "category": user_data.get("category", "Employee"),
                "privileges": user_data.get("privileges", []),
                "is_superadmin": user_data.get("is_superadmin", False),
                "has_admin_access": user_data.get("has_admin_access", False),
                "store": user_data.get("store", "Unassigned"),
                "created_at": user_data.get("created_at", "")
            })

    # Apply filters
    if search:
        search_lower = search.lower()
        users = [u for u in users if search_lower in u["name"].lower() or search_lower in u["email"].lower()]

    if store and store != "All":
        users = [u for u in users if u["store"] == store]

    if role and role != "All":
        users = [u for u in users if u["role"] == role]

    # Calculate pagination
    total = len(users)
    start = (page - 1) * limit
    end = start + limit
    paginated_users = users[start:end]

    return {
        "users": paginated_users,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }


@app.get("/users/privileges")
async def get_all_privileges():
    """
    Returns list of all available privileges for user creation.
    """
    privilege_details = [
        {"id": "team_list", "name": "Team List", "description": "View and manage team members", "icon": "users"},
        {"id": "reports", "name": "Reports & Analytics", "description": "Access reports and analytics dashboard", "icon": "bar-chart-2"},
        {"id": "assign_quiz", "name": "Assign Quiz", "description": "Assign quizzes to team members", "icon": "clipboard"},
        {"id": "audits", "name": "Audits", "description": "Perform and view audits", "icon": "check-square"},
        {"id": "upload_training", "name": "Upload Training", "description": "Upload training content", "icon": "upload-cloud"},
        {"id": "bulk_upload", "name": "Bulk Upload", "description": "Bulk upload content", "icon": "layers"},
        {"id": "post_news", "name": "Post News", "description": "Post news updates", "icon": "file-text"},
        {"id": "post_quiz", "name": "Post Quiz", "description": "Create and post quizzes", "icon": "help-circle"},
        {"id": "create_user", "name": "Create User", "description": "Create new user accounts", "icon": "user-plus"},
        {"id": "live_tracking", "name": "Live Tracking", "description": "Real-time location tracking", "icon": "map-pin"},
        {"id": "proctored_assessment", "name": "Proctored Assessment", "description": "Access and take proctored assessments", "icon": "shield"},
        {"id": "proctored_create_manage", "name": "Create/Manage Assessments", "description": "Create, edit, and delete proctored assessments", "icon": "edit-3", "category": "Proctored"},
        {"id": "proctored_view_results", "name": "View Assessment Results", "description": "View proctored assessment submissions and results", "icon": "eye", "category": "Proctored"},
        {"id": "view_analytics", "name": "View Analytics", "description": "View detailed analytics", "icon": "trending-up"},
        {"id": "send_notification", "name": "Send Notification", "description": "Send notifications to users", "icon": "bell"},
        {"id": "access_control", "name": "Access Control", "description": "Manage user access controls", "icon": "lock"},
        {"id": "manage_buckets", "name": "Manage Buckets", "description": "Manage course buckets", "icon": "folder"},
        {"id": "schedule_meeting", "name": "Schedule Meeting", "description": "Schedule virtual meetings", "icon": "video"},
        {"id": "crm_tickets", "name": "CRM Tickets", "description": "Manage CRM tickets", "icon": "tag"},
        {"id": "manage_simulations", "name": "Manage Simulations", "description": "Manage interactive simulations", "icon": "play-circle"},
        {"id": "manage_learning_path", "name": "Manage Learning Path", "description": "Manage learning path content", "icon": "book-open"},
    ]
    return privilege_details


@app.get("/users/categories")
async def get_user_categories():
    """
    Returns list of all user categories.
    """
    return user_categories


@app.post("/users/categories")
async def create_user_category(data: dict):
    """
    Creates a new user category.
    """
    name = data.get('name')
    description = data.get('description', '')
    color = data.get('color', '#6B7280')
    
    if not name:
        return {"status": "error", "message": "Category name is required"}
    
    # Check if category exists
    for cat in user_categories:
        if cat['name'].lower() == name.lower():
            return {"status": "error", "message": "Category already exists"}
    
    new_category = {
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "description": description,
        "color": color
    }
    user_categories.append(new_category)
    
    logger.info(f"User category created: {name}")
    return {"status": "success", "category": new_category}


# STORES LIST - For assigning employees to stores
STORES_LIST = [
    {"id": "1", "name": "HQ", "city": "Mumbai", "region": "West"},
    {"id": "2", "name": "Mumbai Central", "city": "Mumbai", "region": "West"},
    {"id": "3", "name": "Mumbai Andheri", "city": "Mumbai", "region": "West"},
    {"id": "4", "name": "Delhi CP", "city": "Delhi", "region": "North"},
    {"id": "5", "name": "Delhi Saket", "city": "Delhi", "region": "North"},
    {"id": "6", "name": "Delhi Gurgaon", "city": "Gurgaon", "region": "North"},
    {"id": "7", "name": "Bangalore Indiranagar", "city": "Bangalore", "region": "South"},
    {"id": "8", "name": "Bangalore Koramangala", "city": "Bangalore", "region": "South"},
    {"id": "9", "name": "Chennai Anna Nagar", "city": "Chennai", "region": "South"},
    {"id": "10", "name": "Hyderabad Jubilee Hills", "city": "Hyderabad", "region": "South"},
    {"id": "11", "name": "Pune FC Road", "city": "Pune", "region": "West"},
    {"id": "12", "name": "Kolkata Park Street", "city": "Kolkata", "region": "East"},
]


@app.get("/stores")
async def get_stores():
    """
    Returns list of all stores for employee assignment.
    """
    return STORES_LIST


@app.get("/stores/summary")
async def get_stores_summary(db: Session = Depends(get_db)):
    """
    Returns stores with employee count for analytics.
    """
    store_summary = []

    # Get all users from database
    db_users = db_ops.get_all_users(db)

    for store in STORES_LIST:
        # Count from database users
        db_employee_count = sum(1 for u in db_users if u.store == store["name"])

        # Count from in-memory users (excluding duplicates)
        db_emails = {u.email for u in db_users}
        memory_employee_count = sum(1 for email, u in users_store.items()
                                    if u.get("store") == store["name"] and email not in db_emails)

        total_employee_count = db_employee_count + memory_employee_count

        store_summary.append({
            **store,
            "employee_count": total_employee_count
        })
    return store_summary


@app.post("/users/bulk-upload")
async def bulk_upload_users(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Bulk upload users from Excel/CSV file.
    Expected columns: Name, Email, Password, Role, Category, Store
    """
    try:
        import pandas as pd
        import io

        contents = await file.read()

        # Determine file type and read
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))

        # Normalize column names (case-insensitive)
        df.columns = df.columns.str.strip().str.lower()

        created_count = 0
        skipped_count = 0
        errors = []

        for idx, row in df.iterrows():
            try:
                email = str(row.get('email', '')).strip()
                name = str(row.get('name', '')).strip()
                password = str(row.get('password', 'Welcome@123')).strip()
                role = str(row.get('role', 'Employee')).strip()
                category = str(row.get('category', 'Employee')).strip()
                store = str(row.get('store', 'Unassigned')).strip()

                if not email or not name:
                    errors.append(f"Row {idx + 2}: Missing name or email")
                    skipped_count += 1
                    continue

                # Check if user exists in database
                existing_user = db_ops.get_user_by_email(db, email)
                if existing_user or email in users_store:
                    errors.append(f"Row {idx + 2}: User {email} already exists")
                    skipped_count += 1
                    continue

                # Create user in database
                user_data = {
                    "email": email,
                    "name": name,
                    "password": password,
                    "role": role,
                    "category": category,
                    "privileges": [],
                    "is_superadmin": False,
                    "has_admin_access": category in ['Super Admin', 'Manager', 'Supervisor'],
                    "store": store,
                    "self_learning_completed": False
                }

                try:
                    db_ops.create_user(db, user_data)

                    # Also add to in-memory store for backward compatibility
                    users_store[email] = {
                        **user_data,
                        "created_at": datetime.now().isoformat()
                    }

                    created_count += 1

                except Exception as create_error:
                    db.rollback()
                    errors.append(f"Row {idx + 2}: Failed to create user - {str(create_error)}")
                    skipped_count += 1

            except Exception as row_error:
                errors.append(f"Row {idx + 2}: {str(row_error)}")
                skipped_count += 1

        logger.info(f"Bulk upload completed: {created_count} created, {skipped_count} skipped")

        return {
            "status": "success",
            "created": created_count,
            "skipped": skipped_count,
            "errors": errors[:10]  # Return first 10 errors only
        }

    except Exception as e:
        logger.error(f"Bulk upload error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")


@app.get("/users/bulk-upload/template")
async def get_bulk_upload_template():
    """
    Returns the expected format for bulk user upload.
    """
    return {
        "columns": ["Name", "Email", "Password", "Role", "Category", "Store"],
        "sample_rows": [
            ["John Doe", "john.doe@company.com", "Welcome@123", "Waffler", "Employee", "Mumbai Central"],
            ["Jane Smith", "jane.smith@company.com", "Welcome@123", "Silver Waffler", "Employee", "Delhi CP"],
            ["Mike Wilson", "mike.wilson@company.com", "Welcome@123", "Store Manager", "Manager", "Bangalore Indiranagar"]
        ],
        "notes": [
            "Password is optional - defaults to 'Welcome@123' if not provided",
            "Role options: Waffler, Silver Waffler, Gold Waffler, Shift Manager, Store Manager, etc.",
            "Category options: Employee, Supervisor, Manager, Super Admin",
            "Store must match an existing store name from the stores list"
        ]
    }


@app.get("/users/{email}")
async def get_user(email: str, db: Session = Depends(get_db)):
    """
    Returns a specific user by email (without password).
    """
    # Try database first
    user_db = db_ops.get_user_by_email(db, email)
    if user_db:
        return {
            "email": user_db.email,
            "name": user_db.name,
            "role": user_db.role or "User",
            "category": user_db.category or "Employee",
            "privileges": user_db.privileges or [],
            "is_superadmin": user_db.is_superadmin or False,
            "has_admin_access": user_db.has_admin_access or False,
            "store": user_db.store or "Unassigned",
            "self_learning_completed": user_db.self_learning_completed or False
        }

    # Fallback to in-memory store
    if email in users_store:
        user_data = users_store[email]
        return {
            "email": user_data["email"],
            "name": user_data["name"],
            "role": user_data.get("role", "User"),
            "category": user_data.get("category", "Employee"),
            "privileges": user_data.get("privileges", []),
            "is_superadmin": user_data.get("is_superadmin", False),
            "has_admin_access": user_data.get("has_admin_access", False),
            "store": user_data.get("store", "Unassigned"),
            "self_learning_completed": user_data.get("self_learning_completed", False)
        }

    raise HTTPException(status_code=404, detail="User not found")


@app.put("/users/{email}/privileges")
async def update_user_privileges(email: str, data: dict):
    """
    Updates a user's privileges (Superadmin only).
    """
    if email not in users_store:
        raise HTTPException(status_code=404, detail="User not found")
    
    privileges = data.get('privileges', [])
    valid_privileges = [p for p in privileges if p in ALL_PRIVILEGES]
    
    users_store[email]["privileges"] = valid_privileges
    users_store[email]["has_admin_access"] = len(valid_privileges) > 0
    
    logger.info(f"User privileges updated: {email} - Privileges: {valid_privileges}")
    return {"status": "success", "privileges": valid_privileges}


# ==========================================
# REPORTS APIs
# ==========================================

# ==========================================
# ATTENDANCE APIs
# ==========================================

@app.post("/attendance/punch-in")
async def punch_in(data: dict, db: Session = Depends(get_db)):
    """
    Employee punches in for work.
    """
    try:
        user_id = data.get('user_id')
        timestamp = data.get('timestamp')

        # Check if already punched in (in-memory check)
        for record in attendance_records:
            if record['user_id'] == user_id and not record.get('punch_out'):
                return {"status": "error", "message": "Already punched in"}

        # Get user data
        user_data = users_store.get(user_id, {})
        user_name = user_data.get('name', user_id)
        store = user_data.get('store', 'Unknown')

        # Create attendance record in DATABASE
        attendance_data = {
            "id": str(uuid.uuid4()),
            "user_email": user_id,
            "user_name": user_name,
            "punch_in": datetime.fromisoformat(timestamp.replace('Z', '+00:00')) if timestamp else datetime.now(),
            "punch_out": None,
            "duration_minutes": None,
            "location_lat": data.get('latitude'),
            "location_lng": data.get('longitude'),
            "store": store
        }

        try:
            db_attendance = db_ops.create_attendance_record(db, attendance_data)
        except Exception as db_error:
            logger.error(f"Database attendance error: {db_error}")
            db.rollback()
            # Continue with in-memory tracking

        # Also store in memory for backward compatibility
        record = {
            "id": str(len(attendance_records) + 1),
            "user_id": user_id,
            "punch_in": timestamp,
            "punch_out": None,
            "duration_minutes": None
        }

        attendance_records.append(record)
        logger.info(f"Punch in: {user_id} at {timestamp}")
        log_user_activity(user_id, "PUNCH_IN", f"Punched in at {timestamp}")
        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error punching in: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to punch in: {str(e)}")


@app.post("/attendance/punch-out")
async def punch_out(data: dict, db: Session = Depends(get_db)):
    """
    Employee punches out from work.
    """
    try:
        user_id = data.get('user_id')
        timestamp = data.get('timestamp')

        # Find active attendance record in memory
        for record in attendance_records:
            if record['user_id'] == user_id and not record.get('punch_out'):
                record['punch_out'] = timestamp

                # Calculate duration
                punch_in_dt = datetime.fromisoformat(record['punch_in'].replace('Z', '+00:00'))
                punch_out_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                duration = (punch_out_dt - punch_in_dt).total_seconds() / 60
                record['duration_minutes'] = int(duration)

                logger.info(f"Punch out: {user_id} at {timestamp}, duration: {duration}min")
                log_user_activity(user_id, "PUNCH_OUT", f"Punched out after {int(duration)} mins")
                return {"status": "success", "duration_minutes": int(duration)}

        return {"status": "error", "message": "No active punch-in found"}

    except Exception as e:
        logger.error(f"Error punching out: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to punch out: {str(e)}")


@app.get("/attendance/history")
async def attendance_history(user_id: str = None, db: Session = Depends(get_db)):
    """
    Returns attendance history.
    """
    # Get from database
    if user_id:
        db_attendance = db_ops.get_user_attendance(db, user_id, limit=100)
        records = []
        for att in db_attendance:
            records.append({
                "id": att.id,
                "user_id": att.user_email,
                "user_email": att.user_email,
                "user_name": att.user_name,
                "punch_in": att.punch_in.isoformat() if att.punch_in else None,
                "punch_out": att.punch_out.isoformat() if att.punch_out else None,
                "duration_minutes": att.duration_minutes,
                "store": att.store
            })

        # Merge with in-memory records
        existing_ids = {r["id"] for r in records}
        for r in attendance_records:
            if r.get("user_id") == user_id and r.get("id") not in existing_ids:
                records.append(r)

        return records
    else:
        # Return all attendance records from memory
        return attendance_records


# ==========================================
# REPORTS APIs
# ==========================================

@app.get("/reports/user-activity")
async def user_activity_report():
    """
    Comprehensive user activity report.
    """
    report = []
    for user_id, user in users_store.items():
        # Get location info
        loc = location_store.get(user_id, {})
        
        # Count quiz attempts
        quiz_count = len([s for s in quiz_submissions if s.get('user_name') == user_id])
        
        # Get today's attendance
        today_records = [r for r in attendance_records 
                        if r['user_id'] == user_id 
                        and r.get('punch_in', '').startswith(datetime.now().strftime('%Y-%m-%d'))]
        
        total_hours_today = sum([(r.get('duration_minutes') or 0) for r in today_records]) / 60 if today_records else 0
        
        is_currently_working = any([not r.get('punch_out') for r in today_records])
        
        report.append({
            "user_id": user_id,
            "name": user.get('name', user_id),
            "email": user_id,
            "role": user.get('role', 'Unknown'),
            "location_sharing": loc.get('active', False),
            "last_location_update": loc.get('timestamp', 'Never'),
            "current_lat": loc.get('latitude'),
            "current_lng": loc.get('longitude'),
            "quizzes_completed": quiz_count,
            "attendance_today": {
                "is_working": is_currently_working,
                "total_hours": round(total_hours_today, 2),
                "punch_records": today_records
            }
        })
    
    return report


@app.get("/reports/quiz-performance")
async def quiz_performance_report():
    """
    Returns quiz performance statistics.
    """
    if not quiz_submissions:
        return {"message": "No quiz submissions yet"}
    
    # Aggregate by quiz
    quiz_stats = {}
    for submission in quiz_submissions:
        quiz_id = submission.get('quiz_id')
        if quiz_id not in quiz_stats:
            quiz_stats[quiz_id] = {
                "quiz_id": quiz_id,
                "attempts": 0,
                "avg_score": 0,
                "scores": []
            }
        quiz_stats[quiz_id]["attempts"] += 1
        quiz_stats[quiz_id]["scores"].append(submission.get('score', 0))
    
    # Calculate averages
    for quiz_id, stats in quiz_stats.items():
        stats["avg_score"] = sum(stats["scores"]) / len(stats["scores"])
        del stats["scores"]  # Remove raw scores from output
    
    return list(quiz_stats.values())


@app.get("/reports/location-history")
async def location_history_report():
    """
    Returns current location snapshot.
    (In production, this would query a time-series database)
    """
    return {
        "timestamp": datetime.now().isoformat(),
        "locations": list(location_store.values())
    }



# ==========================================
# PROCTORED ASSESSMENT APIs
# ==========================================

proctored_assessments = []
assessment_submissions = []

class AssessmentModel(BaseModel):
    title: str
    description: str = ""
    time_limit_minutes: int = 30
    passing_score: int = 70
    created_by: str = "Admin"
    questions: List[dict]

class AssessmentSubmission(BaseModel):
    user_name: str
    answers: List[int]
    violations: int = 0

@app.post("/proctored-assessments")
async def create_assessment(
    request: Request
):
    """
    Create a new proctored assessment.
    Accepts both JSON (AssessmentModel) and Form data for compatibility.
    """
    import json

    # Try to get JSON body first
    try:
        content_type = request.headers.get("content-type", "")
        logger.info(f"[CreateAssessment] Content-Type: {content_type}")

        if "application/json" in content_type:
            body = await request.json()
            logger.info(f"[CreateAssessment] Received JSON body")
            title = body.get("title")
            description = body.get("description", "")
            time_limit_minutes = body.get("time_limit_minutes", 30)
            passing_score = body.get("passing_score", 70)
            questions_list = body.get("questions", [])
            created_by = body.get("created_by", "Admin")
        else:
            # Form data - parse questions from JSON string
            form_data = await request.form()
            title = form_data.get("title")
            questions = form_data.get("questions")
            description = form_data.get("description", "")
            time_limit_minutes = int(form_data.get("time_limit_minutes", 30))
            passing_score = int(form_data.get("passing_score", 70))
            created_by = form_data.get("created_by", "Admin")

            logger.info(f"[CreateAssessment] Received Form data - title: {title}, questions length: {len(questions) if questions else 0}")
            if not title or not questions:
                logger.error(f"[CreateAssessment] Missing fields - title: {title}, questions: {questions}")
                raise HTTPException(status_code=422, detail="Missing required fields: title and questions")
            try:
                questions_list = json.loads(questions)
                logger.info(f"[CreateAssessment] Parsed {len(questions_list)} questions from JSON")
            except Exception as parse_error:
                logger.error(f"[CreateAssessment] JSON parse error: {parse_error}")
                raise HTTPException(status_code=400, detail="Invalid questions format - must be valid JSON")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing request: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid request format: {str(e)}")

    # Validate questions list
    if not isinstance(questions_list, list) or len(questions_list) == 0:
        raise HTTPException(status_code=400, detail="Questions must be a non-empty array")

    # Create assessment
    new_id = str(uuid.uuid4())
    assessment = {
        "id": new_id,
        "title": title,
        "description": description,
        "questions": questions_list,
        "time_limit_minutes": time_limit_minutes,
        "passing_score": passing_score,
        "created_at": datetime.now().isoformat(),
        "created_by": created_by,
        "active": True,
        "total_questions": len(questions_list)
    }

    # Save to database
    try:
        db = SessionLocal()
        try:
            db_assessment_data = {
                "id": new_id,
                "title": title,
                "description": description,
                "questions": questions_list,
                "time_limit_minutes": time_limit_minutes,
                "passing_score": passing_score,
                "created_by": created_by,
                "active": True,
                "total_questions": len(questions_list)
            }
            db_ops.create_assessment(db, db_assessment_data)
            logger.info(f"Proctored Assessment saved to DB: {new_id}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error saving assessment to DB: {e}")

    # Also keep in memory for backward compatibility
    proctored_assessments.insert(0, assessment)
    logger.info(f"Proctored Assessment Created: {title} with {len(questions_list)} questions")

    return {"status": "success", "id": new_id, "assessment": assessment}

@app.put("/proctored-assessments/{assessment_id}")
async def update_assessment(
    assessment_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Update an existing proctored assessment.
    """
    import json

    # Check if assessment exists (database first, then in-memory)
    db_assessment = db_ops.get_assessment_by_id(db, assessment_id)
    memory_assessment = None
    matching = [a for a in proctored_assessments if a["id"] == assessment_id]
    if matching:
        memory_assessment = matching[0]

    if not db_assessment and not memory_assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Try to get JSON body first
    try:
        content_type = request.headers.get("content-type", "")

        if "application/json" in content_type:
            body = await request.json()
            title = body.get("title")
            description = body.get("description", "")
            time_limit_minutes = body.get("time_limit_minutes")
            passing_score = body.get("passing_score")
            questions_list = body.get("questions")
            created_by = body.get("created_by")
        else:
            # Form data
            form_data = await request.form()
            title = form_data.get("title")
            questions_str = form_data.get("questions")
            description = form_data.get("description", "")
            time_limit_minutes = int(form_data.get("time_limit_minutes", 30)) if form_data.get("time_limit_minutes") else None
            passing_score = int(form_data.get("passing_score", 70)) if form_data.get("passing_score") else None
            created_by = form_data.get("created_by")

            if questions_str:
                try:
                    questions_list = json.loads(questions_str)
                except:
                    raise HTTPException(status_code=400, detail="Invalid questions format")
            else:
                questions_list = None

        # Build updates dict
        updates = {}
        if title: updates["title"] = title
        if description is not None: updates["description"] = description
        if time_limit_minutes: updates["time_limit_minutes"] = time_limit_minutes
        if passing_score: updates["passing_score"] = passing_score
        if questions_list:
            if not isinstance(questions_list, list) or len(questions_list) == 0:
                raise HTTPException(status_code=400, detail="Questions must be a non-empty array")
            updates["questions"] = questions_list
            updates["total_questions"] = len(questions_list)
        if created_by: updates["created_by"] = created_by

        # Update in database
        if db_assessment and updates:
            db_ops.update_assessment(db, assessment_id, updates)
            logger.info(f"Assessment updated in DB: {assessment_id}")

        # Also update in-memory
        if memory_assessment:
            for key, value in updates.items():
                memory_assessment[key] = value

        # Return updated assessment
        result_assessment = memory_assessment if memory_assessment else db_ops.model_to_dict(db_ops.get_assessment_by_id(db, assessment_id))
        return {"status": "success", "message": "Assessment updated", "assessment": result_assessment}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating assessment: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")

# REMOVED: Duplicate endpoints - now handled by database-aware endpoints at lines 1699-1784
# @app.get("/proctored-assessments")
# @app.get("/proctored-assessments/all")
# @app.delete("/proctored-assessments/{assessment_id}")
# @app.post("/proctored-assessments/{assessment_id}/submit")

@app.get("/proctored-assessments/{assessment_id}/submissions")
async def get_assessment_submissions(assessment_id: str, db: Session = Depends(get_db)):
    """Get all submissions for a proctored assessment"""
    # Try database first
    db_submissions = db_ops.get_assessment_submissions(db, assessment_id)
    if db_submissions:
        submissions = [db_ops.model_to_dict(s) for s in db_submissions]
        # Convert datetime objects to strings
        for s in submissions:
            if s.get("submitted_at") and hasattr(s["submitted_at"], "isoformat"):
                s["submitted_at"] = s["submitted_at"].isoformat()
        return submissions
    # Fallback to in-memory
    return [s for s in assessment_submissions if s["assessment_id"] == assessment_id]


class TranslateRequest(BaseModel):
    text: str
    target_language: str

@app.post("/ai/translate")
async def translate_text(req: TranslateRequest):
    try:
        # Use Groq for translation
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        
        prompt = f"""
        Translate the following text into {req.target_language}.
        Preserve the original meaning and tone.
        Return ONLY the translated text, no preamble or explanation.
        
        Text to translate:
        {req.text}
        """
        
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.3
        )
        
        translated_text = completion.choices[0].message.content.strip()
        return {"translated_text": translated_text}
        
    except Exception as e:
        logger.error(f"Translation Error: {e}")
        raise HTTPException(status_code=500, detail="Translation failed")

class AiGenRequest(BaseModel):
    topic: str = ""
    content: str = ""
    num_questions: int = 5

@app.post("/proctored-assessments/ai-generate")
async def ai_generate_assessment(req: AiGenRequest):
    try:
        if not req.topic and not req.content:
             return {"error": "Provide topic or content"}

        prompt = f"""
        Generate {req.num_questions} multiple-choice questions for an assessment.
        Topic: {req.topic}
        Context: {req.content[:1000]}
        
        Format JSON:
        {{
            "questions": [
                {{ "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0 }}
            ]
        }}
        """
        
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"}
        )
        content = completion.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        logger.error(f"AI Gen Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ask-ai")
async def ask_ai_about_course(req: AskAIRequest):
    try:
        if not req.question.strip():
            return {"answer": "Please ask a valid question."}

        context_text = ""
        
        # Use RAG service for semantic search (OpenAI embeddings)
        try:
            context_text = rag_service.get_context_for_question(
                req.question, 
                req.course_id, 
                max_chunks=4
            )
            if context_text:
                logger.info(f"RAG found context for question: {req.question[:50]}...")
        except Exception as rag_error:
            logger.warning(f"RAG search failed: {rag_error}")
        
        # Fallback: Use transcript directly from content_store
        if not context_text:
            course = None
            for item in content_store:
                if item.get("id") == req.course_id:
                    course = item
                    break
            
            if not course:
                return {"answer": "Course not found. Please make sure the course exists."}
            
            transcript = course.get("transcript", "")
            
            if not transcript or len(transcript.strip()) < 50:
                return {
                    "answer": "This course doesn't have a transcript yet. The AI assistant needs the video to be processed first. Please try again after the video has been fully uploaded and processed."
                }
            
            # Use first 4000 chars of transcript
            context_text = transcript[:4000]
        
        # Prepare prompts
        system_prompt = """You are an AI tutor for a training course at Belgian Waffle.
Answer questions  based on the provided transcript context.
Keep answers concise, clear, and helpful. Use bullet points if listing multiple items.if user asks anything outside of course 
explain that also but tell that it is outside of course context"""
        
        user_prompt = f"""Transcript Context:
{context_text}

Question: {req.question}

Answer:"""
        
        # Call Groq API
        try:
            client = Groq(api_key=os.environ["GROQ_API_KEY"])
            
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=400
            )
            
            answer = completion.choices[0].message.content.strip()
            
            return {"answer": answer}
            
        except Exception as groq_error:
            logger.error(f"Groq API Error: {groq_error}")
            return {
                "answer": "I'm having trouble connecting to the AI service. Please try again in a moment."
            }

    except Exception as e:
        logger.error(f"Ask AI Error: {e}")
        return {
            "answer": "An error occurred while processing your question. Please try again."
        }

@app.post("/proctored-assessments/bulk-upload")
async def bulk_upload_assessment(
    title: str = Form(...),
    description: str = Form(...),
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    created_by: str = Form("Admin"),
    file: UploadFile = File(...)
):
    try:
        import pandas as pd
        contents = await file.read()
        import io
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
            
        questions = []
        # Expect columns: Question, Option1, Option2, Option3, Option4, CorrectOption (1-4)
        for _, row in df.iterrows():
            q = {
                "question": str(row.iloc[0]),
                "options": [str(row.iloc[1]), str(row.iloc[2]), str(row.iloc[3]), str(row.iloc[4])],
                "correctIndex": int(row.iloc[5]) - 1
            }
            questions.append(q)
            
        new_id = str(uuid.uuid4())
        assessment = {
            "id": new_id,
            "title": title,
            "description": description,
            "time_limit_minutes": time_limit_minutes,
            "passing_score": passing_score,
            "created_by": created_by,
            "questions": questions,
            "created_at": datetime.now().isoformat(),
            "active": True,
            "total_questions": len(questions)
        }

        # Save to database
        try:
            db = SessionLocal()
            try:
                db_assessment_data = {
                    "id": new_id,
                    "title": title,
                    "description": description,
                    "questions": questions,
                    "time_limit_minutes": time_limit_minutes,
                    "passing_score": passing_score,
                    "created_by": created_by,
                    "active": True,
                    "total_questions": len(questions)
                }
                db_ops.create_assessment(db, db_assessment_data)
                logger.info(f"Bulk Upload Assessment saved to DB: {new_id}")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error saving bulk upload assessment to DB: {e}")

        # Also keep in memory for backward compatibility
        proctored_assessments.append(assessment)
        return {"status": "success", "id": new_id, "questions_count": len(questions)}
        
    except Exception as e:
        logger.error(f"Bulk Upload Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")


# ==========================================
# AI COURSE RECOMMENDATION SYSTEM APIs
# ==========================================




def categorize_content_by_skill(title: str, description: str = "") -> List[str]:
    """Analyze content title/description to determine which skill categories it belongs to."""
    text = (title + " " + description).lower()
    matched_skills = []
    
    for skill_key, skill_data in skill_categories.items():
        for keyword in skill_data.get("keywords", []):
            if keyword.lower() in text:
                if skill_key not in matched_skills:
                    matched_skills.append(skill_key)
                break
    
    # Default to onboarding if no match found
    if not matched_skills:
        matched_skills = ["onboarding"]
    
    return matched_skills


def calculate_skill_gaps(user_email: str) -> List[dict]:
    """Analyze user's performance data to identify skill gaps."""
    # START DEBUG LOG
    logger.info(f"--- Calculating Gaps for {user_email} ---")
    
    profile = ensure_user_profile(user_email)
    skill_gaps = []
    
    # NEW LOGIC: Calculate based on Module Completion (Completed / Total)
    
    # 1. Total Modules Map
    total_modules_per_skill = {k: 0 for k in skill_categories}
    for item in content_store:
        # Use simple mapping (bucket priority)
        item_bucket = item.get("bucket", "")
        item_title = item.get("title", "")
        key = find_skill_key_from_content(item_bucket, item_title)
        if key in total_modules_per_skill:
            total_modules_per_skill[key] += 1
            
    # 2. Completed Modules Map (Unique content completion)
    completed_modules_per_skill = {k: 0 for k in skill_categories}
    user_completions = [c for c in course_completions if c["user_email"] == user_email]
    
    completed_ids = set()
    for c in user_completions:
        cid = c.get("course_id")
        if cid and cid not in completed_ids:
            completed_ids.add(cid)
            # Find usage bucket/title from completion record
            c_bucket = c.get("bucket", "")
            c_title = c.get("course_title", "")
            key = find_skill_key_from_content(c_bucket, c_title)
            if key in completed_modules_per_skill:
                 completed_modules_per_skill[key] += 1
    
    for skill_key, skill_data in skill_categories.items():
        user_skill = profile["skill_scores"].get(skill_key, {"score": 0, "max_score": 0, "attempts": 0})
        
        # Ensure we read numeric values safely
        score = user_skill.get("score", 0)
        max_score = user_skill.get("max_score", 0)
        attempts = user_skill.get("attempts", 0)
        
        # Calculate percentage based on modules completed
        total_mod = total_modules_per_skill.get(skill_key, 0)
        completed_mod = completed_modules_per_skill.get(skill_key, 0)
        
        if total_mod > 0:
            percentage = (completed_mod / total_mod) * 100
        else:
            # If no modules are defined, but user has completion, assume 100%
            percentage = 100 if completed_mod > 0 else 0
            
        # Cap at 100
        percentage = min(100.0, percentage)

        # Fix for "Not started" showing when percentage > 0
        # If user has completed modules, treat it as at least 1 attempt
        if attempts == 0 and completed_mod > 0:
            attempts = 1
            
        # Determine strict status text
        status_text = "Not Started"
        if percentage >= 100:
            status_text = "Completed"
        elif percentage > 0:
            status_text = "In Progress"
            
        # DEBUG LOG
        logger.info(f"Skill: {skill_key} | Modules: {completed_mod}/{total_mod} | Pct: {percentage}% | Status: {status_text}")
            
        # A skill is considered weak if score is below 70% or no attempts made
        gap_level = "critical" if percentage < 50 else "moderate" if percentage < 70 else "minor" if percentage < 85 else "none"
        
        skill_gaps.append({
            "skill_key": skill_key,
            "skill_name": skill_data["name"],
            "icon": skill_data["icon"],
            "color": skill_data["color"],
            "current_score": score,
            "max_score": max_score,
            "percentage": round(percentage, 1),
            "attempts": attempts,
            "gap_level": gap_level,
            "status": status_text,  # Explicit status for UI
            "needs_improvement": percentage < 70 or attempts == 0,
            "modules_completed": completed_mod,
            "total_modules": total_mod
        })
    
    # Sort by gap severity (critical first, then moderate, then minor)
    gap_order = {"critical": 0, "moderate": 1, "minor": 2, "none": 3}
    skill_gaps.sort(key=lambda x: (gap_order.get(x["gap_level"], 4), -x["attempts"]))
    
    return skill_gaps


def update_skill_score(user_email: str, skill_key: str, score: int, max_score: int, source_type: str, source_id: str):
    """Update a user's skill score based on assessment/quiz results."""
    profile = ensure_user_profile(user_email)
    
    if skill_key in profile["skill_scores"]:
        profile["skill_scores"][skill_key]["score"] += score
        profile["skill_scores"][skill_key]["max_score"] += max_score
        profile["skill_scores"][skill_key]["attempts"] += 1
    
    # Record the assessment
    assessment_record = {
        "id": str(uuid.uuid4()),
        "user_email": user_email,
        "skill_category": skill_key,
        "score": score,
        "max_score": max_score,
        "percentage": round((score / max_score) * 100, 1) if max_score > 0 else 0,
        "assessment_date": datetime.now().isoformat(),
        "source_type": source_type,
        "source_id": source_id
    }
    user_skill_assessments.append(assessment_record)
    
    # Update profile timestamp
    profile["updated_at"] = datetime.now().isoformat()
    profile["last_activity"] = datetime.now().isoformat()
    
    # Recalculate weak and strong areas
    skill_gaps = calculate_skill_gaps(user_email)
    profile["weak_areas"] = [g["skill_key"] for g in skill_gaps if g["gap_level"] in ["critical", "moderate"]]
    profile["strong_areas"] = [g["skill_key"] for g in skill_gaps if g["gap_level"] == "none" and g["attempts"] > 0]
    
    return assessment_record


@app.post("/recommendations/track-completion")
async def track_course_completion(
    user_email: str = Form(...),
    course_id: str = Form(...),
    course_title: str = Form(...),
    bucket: str = Form(None),
    score: int = Form(0),
    max_score: int = Form(100),
    time_spent_seconds: int = Form(0),
    quiz_correct: int = Form(0),
    quiz_total: int = Form(0),
    db: Session = Depends(get_db)
):
    """Track when a user completes a course/module and update their learning profile."""
    try:
        profile = ensure_user_profile(user_email)

        # Determine skill categories from course title
        matched_skills = categorize_content_by_skill(course_title, bucket or "")

        # Create completion record in DATABASE
        completion_data = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "course_id": course_id,
            "course_title": course_title,
            "bucket": bucket,
            "score": float(score) if score else None,
            "time_spent_seconds": time_spent_seconds,
            "quiz_correct": quiz_correct,
            "quiz_total": quiz_total,
            "quiz_answers": None
        }

        try:
            db_completion = db_ops.create_course_completion(db, completion_data)
        except Exception as db_error:
            logger.error(f"Database completion error: {db_error}")
            db.rollback()
            # Continue with in-memory tracking

        # Also store in memory for backward compatibility
        completion = {
            **completion_data,
            "max_score": max_score,
            "percentage": round((score / max_score) * 100, 1) if max_score > 0 else 0,
            "completed_at": datetime.now().isoformat(),
            "matched_skills": matched_skills
        }
        course_completions.append(completion)
        
        # Update learning profile
        profile["courses_completed"] += 1
        profile["total_xp"] += 50 + (score * 2)  # Base XP + score bonus
        profile["total_time_spent_seconds"] += time_spent_seconds
        profile["last_activity"] = datetime.now().isoformat()
        profile["updated_at"] = datetime.now().isoformat()
        
        # Update skill scores for matched skills
        for skill_key in matched_skills:
            update_skill_score(user_email, skill_key, score, max_score, "course_completion", course_id)
        
        # Update skill scores for matched skills
        for skill_key in matched_skills:
            update_skill_score(user_email, skill_key, score, max_score, "course_completion", course_id)
        
        logger.info(f"Course completion tracked: {user_email} completed '{course_title}' with score {score}/{max_score}")
        log_user_activity(user_email, "COURSE_COMPLETE", f"Completed course: {course_title}", {"score": score, "xp": 50 + (score * 2)})

        
        # Check for level up after completion
        level_up_result = None
        try:
            level_up_result = await check_and_apply_level_up(user_email)
        except Exception as level_err:
            logger.warning(f"Level up check failed (non-critical): {level_err}")
        
        return {
            "status": "success",
            "completion": completion,
            "xp_earned": 50 + (score * 2),
            "total_xp": profile["total_xp"],
            "level_up": level_up_result
        }
        
    except Exception as e:
        logger.error(f"Track completion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recommendations/track-quiz")
async def track_quiz_submission(
    user_email: str = Form(...),
    quiz_id: str = Form(...),
    quiz_title: str = Form(...),
    correct: int = Form(...),
    total: int = Form(...),
    time_spent_seconds: int = Form(0)
):
    """Track quiz submissions and update skill scores."""
    try:
        profile = ensure_user_profile(user_email)
        
        # Determine skill categories from quiz title
        matched_skills = categorize_content_by_skill(quiz_title)
        
        # Update profile
        profile["quizzes_completed"] += 1
        profile["total_xp"] += 25 + (correct * 10)  # Base XP + per-correct bonus
        profile["last_activity"] = datetime.now().isoformat()
        
        # Update skill scores
        for skill_key in matched_skills:
            update_skill_score(user_email, skill_key, correct, total, "quiz", quiz_id)
        
        # Record interaction
        interaction = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "interaction_type": "quiz_completion",
            "content_id": quiz_id,
            "content_type": "quiz",
            "duration_seconds": time_spent_seconds,
            "timestamp": datetime.now().isoformat(),
            "metadata": {"correct": correct, "total": total, "title": quiz_title}
        }
        user_interactions.append(interaction)
        
        logger.info(f"Quiz tracked: {user_email} scored {correct}/{total} on '{quiz_title}'")
        log_user_activity(user_email, "QUIZ_SUBMIT", f"Submitted quiz: {quiz_title}", {"score": f"{correct}/{total}"})

        
        return {
            "status": "success",
            "xp_earned": 25 + (correct * 10),
            "total_xp": profile["total_xp"],
            "matched_skills": matched_skills
        }
        
    except Exception as e:
        logger.error(f"Track quiz error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recommendations/track-assessment")
async def track_assessment_completion(
    user_email: str = Form(...),
    assessment_id: str = Form(...),
    assessment_title: str = Form(...),
    score: float = Form(...),
    correct: int = Form(...),
    total: int = Form(...),
    passed: bool = Form(...),
    time_taken_seconds: int = Form(0)
):
    """Track proctored assessment completions and update skill scores."""
    try:
        profile = ensure_user_profile(user_email)
        
        # Determine skill categories from assessment title
        matched_skills = categorize_content_by_skill(assessment_title)
        
        # Update profile
        profile["assessments_completed"] += 1
        xp_base = 100 if passed else 25
        xp_bonus = int(score)
        profile["total_xp"] += xp_base + xp_bonus
        profile["last_activity"] = datetime.now().isoformat()
        
        # Update skill scores (weighted more heavily for assessments)
        for skill_key in matched_skills:
            update_skill_score(user_email, skill_key, correct, total, "assessment", assessment_id)
        
        # Record interaction
        interaction = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "interaction_type": "assessment_completion",
            "content_id": assessment_id,
            "content_type": "assessment",
            "duration_seconds": time_taken_seconds,
            "timestamp": datetime.now().isoformat(),
            "metadata": {"score": score, "correct": correct, "total": total, "passed": passed, "title": assessment_title}
        }
        user_interactions.append(interaction)
        
        logger.info(f"Assessment tracked: {user_email} scored {score}% on '{assessment_title}' - {'PASSED' if passed else 'FAILED'}")
        
        return {
            "status": "success",
            "xp_earned": xp_base + xp_bonus,
            "total_xp": profile["total_xp"],
            "matched_skills": matched_skills
        }
        
    except Exception as e:
        logger.error(f"Track assessment error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recommendations/profile/{user_email}")
async def get_learning_profile(user_email: str):
    """Get a user's complete learning profile including skill scores and gaps."""
    try:
        profile = ensure_user_profile(user_email)
        skill_gaps = calculate_skill_gaps(user_email)
        
        # Get recent completions
        recent_completions = [c for c in course_completions if c["user_email"] == user_email][-10:]
        
        # Get recent assessments
        recent_assessments = [a for a in user_skill_assessments if a["user_email"] == user_email][-10:]
        
        return {
            "status": "success",
            "profile": profile,
            "skill_gaps": skill_gaps,
            "recent_completions": recent_completions[::-1],  # Most recent first
            "recent_assessments": recent_assessments[::-1],
            "skill_categories": skill_categories
        }
        
    except Exception as e:
        logger.error(f"Get profile error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recommendations/skill-gaps/{user_email}")
async def get_skill_gaps(user_email: str):
    """Get detailed skill gap analysis for a user."""
    try:
        skill_gaps = calculate_skill_gaps(user_email)
        
        # Separate into categories
        critical_gaps = [g for g in skill_gaps if g["gap_level"] == "critical"]
        moderate_gaps = [g for g in skill_gaps if g["gap_level"] == "moderate"]
        minor_gaps = [g for g in skill_gaps if g["gap_level"] == "minor"]
        strong_areas = [g for g in skill_gaps if g["gap_level"] == "none" and g["attempts"] > 0]
        unexplored = [g for g in skill_gaps if g["attempts"] == 0]
        
        return {
            "status": "success",
            "skill_gaps": skill_gaps,
            "summary": {
                "critical_count": len(critical_gaps),
                "moderate_count": len(moderate_gaps),
                "minor_count": len(minor_gaps),
                "strong_count": len(strong_areas),
                "unexplored_count": len(unexplored)
            },
            "critical_gaps": critical_gaps,
            "moderate_gaps": moderate_gaps,
            "minor_gaps": minor_gaps,
            "strong_areas": strong_areas,
            "unexplored_areas": unexplored
        }
        
    except Exception as e:
        logger.error(f"Get skill gaps error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recommendations/generate/{user_email}")
async def generate_recommendations(user_email: str, limit: int = 5):
    """Generate AI-powered personalized course recommendations based on skill gaps and learning history."""
    try:
        profile = ensure_user_profile(user_email)
        skill_gaps = calculate_skill_gaps(user_email)
        
        # Get available courses
        available_courses = content_store.copy()
        
        # Get user's completed courses
        completed_course_ids = [c["course_id"] for c in course_completions if c["user_email"] == user_email]
        
        # Filter out completed courses
        uncompleted_courses = [c for c in available_courses if c.get("id") not in completed_course_ids]
        
        # Build context for AI
        weak_skills = [g for g in skill_gaps if g["needs_improvement"]]
        strong_skills = [g for g in skill_gaps if g["gap_level"] == "none" and g["attempts"] > 0]
        
        # Prepare course list for AI analysis
        course_summaries = []
        for course in uncompleted_courses[:20]:  # Limit to avoid token overflow
            course_summaries.append({
                "id": course.get("id"),
                "title": course.get("title"),
                "description": course.get("description", ""),
                "bucket": course.get("bucket", "General")
            })
        
        # Generate AI recommendations using Groq
        from groq import Groq
        groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        
        # Build JSON strings before the f-string to avoid syntax issues
        weak_skills_json = json.dumps([{"skill": g["skill_name"], "score": g["percentage"], "level": g["gap_level"]} for g in weak_skills], indent=2)
        strong_skills_json = json.dumps([{"skill": g["skill_name"], "score": g["percentage"]} for g in strong_skills], indent=2)
        courses_json = json.dumps(course_summaries, indent=2)
        
        prompt = f"""You are an AI learning advisor for a restaurant training platform. Analyze the user's learning profile and recommend the most relevant courses.

USER LEARNING PROFILE:
- Total XP: {profile['total_xp']}
- Courses Completed: {profile['courses_completed']}
- Quizzes Completed: {profile['quizzes_completed']}
- Assessments Completed: {profile['assessments_completed']}

SKILL GAP ANALYSIS:
Weak Areas (Need Improvement):
{weak_skills_json}

Strong Areas:
{strong_skills_json}

AVAILABLE COURSES (Not Yet Completed):
{courses_json}

Based on this analysis, recommend up to {limit} courses that would best help this user improve their weak areas. Prioritize courses that address critical skill gaps.

Return a JSON object with this structure:
{{
    "recommendations": [
        {{
            "course_id": "id of the recommended course",
            "course_title": "title of the course",
            "priority": "high/medium/low",
            "reason": "Brief explanation why this course is recommended (max 50 words)",
            "skill_addressed": "primary skill this addresses",
            "expected_improvement": "what the user will learn/improve"
        }}
    ],
    "overall_advice": "Brief personalized advice for the user's learning journey (max 100 words)",
    "focus_areas": ["list of 2-3 skills the user should prioritize"]
}}

Return ONLY the JSON object, no additional text."""

        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are an expert learning advisor. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=2000,
            response_format={"type": "json_object"}
        )
        
        response_text = completion.choices[0].message.content.strip()
        ai_result = json.loads(response_text)
        
        # Enrich recommendations with full course data
        enriched_recommendations = []
        for rec in ai_result.get("recommendations", []):
            course_id = rec.get("course_id")
            # Find the full course data
            full_course = next((c for c in uncompleted_courses if c.get("id") == course_id), None)
            if full_course:
                enriched_rec = {
                    **rec,
                    "course_data": {
                        "id": full_course.get("id"),
                        "title": full_course.get("title"),
                        "description": full_course.get("description"),
                        "videoUrl": full_course.get("videoUrl"),
                        "bucket": full_course.get("bucket"),
                        "xp": full_course.get("xp", 50)
                    }
                }
                enriched_recommendations.append(enriched_rec)
        
        # Save recommendation history
        recommendation_record = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "recommendations": enriched_recommendations,
            "ai_advice": ai_result.get("overall_advice", ""),
            "focus_areas": ai_result.get("focus_areas", []),
            "generated_at": datetime.now().isoformat(),
            "skill_gaps_at_time": [{"skill": g["skill_name"], "percentage": g["percentage"]} for g in weak_skills]
        }
        recommendation_history.append(recommendation_record)
        
        logger.info(f"AI Recommendations generated for {user_email}: {len(enriched_recommendations)} courses")
        
        return {
            "status": "success",
            "user_email": user_email,
            "recommendations": enriched_recommendations,
            "overall_advice": ai_result.get("overall_advice", ""),
            "focus_areas": ai_result.get("focus_areas", []),
            "skill_gaps": skill_gaps,
            "profile_summary": {
                "total_xp": profile["total_xp"],
                "courses_completed": profile["courses_completed"],
                "weak_areas_count": len(weak_skills),
                "strong_areas_count": len(strong_skills)
            },
            "generated_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Generate recommendations error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        # Fallback: Return rule-based recommendations if AI fails
        skill_gaps = calculate_skill_gaps(user_email)
        weak_skills = [g for g in skill_gaps if g["needs_improvement"]]
        
        # Simple rule-based recommendations
        fallback_recommendations = []
        for course in content_store[:limit]:
            if course.get("id") not in [c["course_id"] for c in course_completions if c["user_email"] == user_email]:
                fallback_recommendations.append({
                    "course_id": course.get("id"),
                    "course_title": course.get("title"),
                    "priority": "medium",
                    "reason": "Recommended for your learning journey",
                    "course_data": course
                })
        
        return {
            "status": "success",
            "user_email": user_email,
            "recommendations": fallback_recommendations[:limit],
            "overall_advice": "Continue learning to build your skills. Focus on areas where you have less experience.",
            "focus_areas": [g["skill_name"] for g in weak_skills[:3]],
            "skill_gaps": skill_gaps,
            "fallback": True,
            "generated_at": datetime.now().isoformat()
        }


@app.get("/recommendations/history/{user_email}")
async def get_recommendation_history(user_email: str, limit: int = 10):
    """Get a user's recommendation history."""
    try:
        history = [r for r in recommendation_history if r["user_email"] == user_email]
        history.sort(key=lambda x: x["generated_at"], reverse=True)
        
        return {
            "status": "success",
            "history": history[:limit],
            "total_count": len(history)
        }
        
    except Exception as e:
        logger.error(f"Get recommendation history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recommendations/track-interaction")
async def track_interaction(
    user_email: str = Form(...),
    interaction_type: str = Form(...),  # view, start, complete, skip, bookmark
    content_id: str = Form(...),
    content_type: str = Form(...),  # course, quiz, assessment, resource
    duration_seconds: int = Form(0),
    metadata: str = Form("{}")  # JSON string
):
    """Track user interactions for improving recommendations."""
    try:
        interaction = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "interaction_type": interaction_type,
            "content_id": content_id,
            "content_type": content_type,
            "duration_seconds": duration_seconds,
            "timestamp": datetime.now().isoformat(),
            "metadata": json.loads(metadata) if metadata else {}
        }
        user_interactions.append(interaction)
        
        # Update learning profile last activity
        profile = ensure_user_profile(user_email)
        profile["last_activity"] = datetime.now().isoformat()
        
        logger.info(f"Interaction tracked: {user_email} - {interaction_type} on {content_type} {content_id}")
        
        return {"status": "success", "interaction_id": interaction["id"]}
        
    except Exception as e:
        logger.error(f"Track interaction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recommendations/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Get top learners leaderboard based on XP and completions."""
    try:
        leaderboard = []
        for user_email, profile in user_learning_profiles.items():
            leaderboard.append({
                "user_email": user_email,
                "user_name": users_store.get(user_email, {}).get("name", user_email),
                "total_xp": profile["total_xp"],
                "courses_completed": profile["courses_completed"],
                "quizzes_completed": profile["quizzes_completed"],
                "assessments_completed": profile["assessments_completed"],
                "strong_areas_count": len(profile.get("strong_areas", [])),
                "last_activity": profile.get("last_activity")
            })
        
        # Sort by XP
        leaderboard.sort(key=lambda x: x["total_xp"], reverse=True)
        
        # Add rank
        for i, entry in enumerate(leaderboard):
            entry["rank"] = i + 1
        
        return {
            "status": "success",
            "leaderboard": leaderboard[:limit],
            "total_learners": len(leaderboard)
        }
        
    except Exception as e:
        logger.error(f"Get leaderboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recommendations/analytics/admin")
async def get_recommendation_analytics():
    """Admin analytics for the recommendation system."""
    try:
        total_profiles = len(user_learning_profiles)
        total_completions = len(course_completions)
        total_assessments = len(user_skill_assessments)
        total_recommendations = len(recommendation_history)
        total_interactions = len(user_interactions)
        
        # Skill distribution
        skill_distribution = {key: {"total_attempts": 0, "total_score": 0, "total_max": 0} for key in skill_categories.keys()}
        for assessment in user_skill_assessments:
            skill_key = assessment.get("skill_category")
            if skill_key in skill_distribution:
                skill_distribution[skill_key]["total_attempts"] += 1
                skill_distribution[skill_key]["total_score"] += assessment.get("score", 0)
                skill_distribution[skill_key]["total_max"] += assessment.get("max_score", 0)
        
        # Calculate averages
        for key in skill_distribution:
            if skill_distribution[key]["total_max"] > 0:
                skill_distribution[key]["average_percentage"] = round(
                    (skill_distribution[key]["total_score"] / skill_distribution[key]["total_max"]) * 100, 1
                )
            else:
                skill_distribution[key]["average_percentage"] = 0
        
        return {
            "status": "success",
            "overview": {
                "total_profiles": total_profiles,
                "total_completions": total_completions,
                "total_skill_assessments": total_assessments,
                "total_recommendations_generated": total_recommendations,
                "total_interactions_tracked": total_interactions
            },
            "skill_distribution": skill_distribution,
            "skill_categories": skill_categories
        }
        
    except Exception as e:
        logger.error(f"Get analytics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))




# Helper to ensure profile exists
def ensure_user_profile(user_email: str):
    """Ensure user profile exists with proper skill_scores structure including attempts."""
    if user_email not in user_learning_profiles:
        user_learning_profiles[user_email] = {
            "skill_scores": {k: {"score": 0, "max_score": 0, "percentage": 0, "attempts": 0} for k in skill_categories.keys()},
            "total_xp": 0,
            "courses_completed": 0,
            "quizzes_completed": 0,
            "assessments_completed": 0,
            "total_time_spent_seconds": 0,  # Track total time spent
            "last_activity": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "learning_streak": 0,
            "weak_areas": [],
            "strong_areas": []
        }
    else:
        # Ensure all skill_scores have 'attempts' key (for backward compatibility)
        for k in skill_categories.keys():
            if k not in user_learning_profiles[user_email]["skill_scores"]:
                user_learning_profiles[user_email]["skill_scores"][k] = {"score": 0, "max_score": 0, "percentage": 0, "attempts": 0}
            elif "attempts" not in user_learning_profiles[user_email]["skill_scores"][k]:
                user_learning_profiles[user_email]["skill_scores"][k]["attempts"] = 0
        # Ensure missing fields exist (backward compatibility)
        if "total_time_spent_seconds" not in user_learning_profiles[user_email]:
            user_learning_profiles[user_email]["total_time_spent_seconds"] = 0
        if "updated_at" not in user_learning_profiles[user_email]:
            user_learning_profiles[user_email]["updated_at"] = datetime.now().isoformat()
    return user_learning_profiles[user_email]


def find_skill_key_from_content(bucket: str, title: str = ""):
    """Find the best matching skill category key from bucket name or content title."""
    # Handle None values for bucket and title
    bucket = bucket or ""
    title = title or ""
    text = (bucket + " " + title).lower()

    # Explicit bucket name mappings (handles common variations)
    bucket_mappings = {
        "product training": "product_knowledge",
        "product knowledge": "product_knowledge",
        "customer service": "customer_service",
        "safety & hygiene": "safety_hygiene",
        "safety hygiene": "safety_hygiene",
        "safety": "safety_hygiene",
        "operations": "operations",
        "espresso & coffee": "espresso_coffee",
        "espresso": "espresso_coffee",
        "coffee": "espresso_coffee",
        "onboarding": "onboarding",
        "onboarding essentials": "onboarding",
        "general": "onboarding",  # Default general content to onboarding
    }

    # First try explicit bucket mapping
    bucket_lower = bucket.lower().strip()
    if bucket_lower in bucket_mappings:
        return bucket_mappings[bucket_lower]

    # Then try direct bucket match to skill key
    if bucket_lower in skill_categories:
        return bucket_lower
    
    # Then try keyword matching from skill_categories
    for skill_key, skill_data in skill_categories.items():
        for keyword in skill_data.get("keywords", []):
            if keyword.lower() in text:
                return skill_key
    
    # Default to onboarding for unmatched content
    return "onboarding"

@app.post("/recommendations/track-quiz")
async def track_quiz(
    user_email: str = Form(...),
    quiz_id: str = Form(...),
    score: int = Form(...),
    total_questions: int = Form(...),
    bucket: str = Form("general"),
    quiz_title: str = Form(None)  # Optional title from frontend
):
    """Track quiz completion and award XP based on score."""
    try:
        profile = ensure_user_profile(user_email)
        
        # Update Stats
        profile["quizzes_completed"] += 1
        profile["last_activity"] = datetime.now().isoformat()
        
        # Calculate XP based on score (10 XP per correct answer + 5 bonus per correct)
        correct_count = int(score)
        total = int(total_questions)
        percentage = (correct_count / total * 100) if total > 0 else 0
        
        # XP Formula: Base (10 per correct) + Bonus if >70% (extra 25 XP)
        xp_earned = correct_count * 10
        if percentage >= 70:
            xp_earned += 25  # Bonus for good performance
        if percentage >= 90:
            xp_earned += 25  # Extra bonus for excellent performance
            
        profile["total_xp"] += xp_earned
        
        # Update Skill Score - use title for better categorization
        skill_key = find_skill_key_from_content(bucket, quiz_title or "")
        
        logger.info(f"[SKILL DEBUG] bucket='{bucket}', title='{quiz_title}', matched_skill='{skill_key}'")
        
        if skill_key and skill_key in profile["skill_scores"]:
            current_skill = profile["skill_scores"][skill_key]
            current_skill["score"] += correct_count
            current_skill["max_score"] += total
            current_skill["attempts"] = current_skill.get("attempts", 0) + 1
            if current_skill["max_score"] > 0:
                current_skill["percentage"] = int((current_skill["score"] / current_skill["max_score"]) * 100)
            logger.info(f"[SKILL DEBUG] Updated {skill_key}: score={current_skill['score']}/{current_skill['max_score']}, attempts={current_skill['attempts']}, pct={current_skill.get('percentage', 0)}%")
        else:
            logger.warning(f"[SKILL DEBUG] Skill key '{skill_key}' not found in profile skill_scores!")
        
        logger.info(f"Quiz tracked for {user_email}: {correct_count}/{total} correct, +{xp_earned} XP, skill: {skill_key}")
        
        return {
            "status": "success", 
            "xp_earned": xp_earned, 
            "total_xp": profile["total_xp"],
            "percentage": round(percentage, 1),
            "message": f"Quiz completed! +{xp_earned} XP"
        }
    except Exception as e:
        logger.error(f"Track quiz error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # Return success anyway to not block UI
        return {"status": "error", "message": str(e)}

@app.post("/recommendations/track-completion")
async def track_completion(
    user_email: str = Form(...),
    course_id: str = Form(...),
    bucket: str = Form("general"),
    xp_earned: int = Form(50),
    course_title: str = Form(None),  # Optional title from frontend
    db: Session = Depends(get_db)
):
    """Track module/course completion and award XP."""
    try:
        profile = ensure_user_profile(user_email)

        # Find skill key using title for better categorization
        skill_key = find_skill_key_from_content(bucket, course_title or "")

        # Calculate actual XP (base + skill matching bonus if skill found)
        actual_xp = int(xp_earned)
        if skill_key and skill_key != "onboarding":  # Bonus for non-default skill match
            actual_xp += 10

        profile["courses_completed"] += 1
        profile["total_xp"] += actual_xp
        profile["last_activity"] = datetime.now().isoformat()

        # Update skill score if matched
        if skill_key and skill_key in profile["skill_scores"]:
            current_skill = profile["skill_scores"][skill_key]
            current_skill["score"] += 1  # Completion counts as 1 point
            current_skill["max_score"] += 1
            current_skill["attempts"] = current_skill.get("attempts", 0) + 1
            if current_skill["max_score"] > 0:
                current_skill["percentage"] = int((current_skill["score"] / current_skill["max_score"]) * 100)

        # Record specific completion in DATABASE
        completion_data = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "course_id": course_id,
            "course_title": course_title,
            "bucket": bucket,
            "score": None,
            "time_spent_seconds": None,
            "quiz_answers": None,
            "quiz_correct": None,
            "quiz_total": None
        }

        try:
            db_completion = db_ops.create_course_completion(db, completion_data)
        except Exception as db_error:
            logger.error(f"Database completion error: {db_error}")
            db.rollback()
            # Continue with in-memory tracking even if database fails

        # Also store in memory for backward compatibility
        completion_record = {
            **completion_data,
            "xp": actual_xp,
            "completed_at": datetime.now().isoformat()
        }
        course_completions.append(completion_record)
        
        # === LEVEL ADVANCEMENT LOGIC ===
        level_up = False
        new_role = None
        
        # Ensure user exists in users_store
        if user_email not in users_store:
            users_store[user_email] = {
                "email": user_email,
                "role": "Waffler",
                "created_at": datetime.now().isoformat()
            }
        
        user_data = users_store.get(user_email)
        current_role = user_data.get("role", "Waffler")
        
        # Define Hierarchy Order
        HIERARCHY = ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Assistant Store Manager']
        
        if current_role in HIERARCHY:
            current_idx = HIERARCHY.index(current_role)
            
            # Check for promotion if not at top level
            if current_idx < len(HIERARCHY) - 1:
                # Get requirements for CURRENT level
                # User must complete ALL courses assigned to their current level to advance
                role_rules = access_control_store.get(current_role, {})
                required_courses = role_rules.get("accessible_courses", [])
                
                if required_courses:
                    # Check if user has completed ALL required courses
                    user_completed_ids = [c["course_id"] for c in course_completions if c["user_email"] == user_email]
                    
                    # Check subset
                    all_completed = all(req_id in user_completed_ids for req_id in required_courses)
                    
                    if all_completed:
                        # PROMOTE USER - DISABLED (Now requires Proctored Exam)
                        # next_role = HIERARCHY[current_idx + 1]
                        # user_data["role"] = next_role
                        # users_store[user_email] = user_data  # Save updated role
                        # level_up = True
                        # new_role = next_role
                        # logger.info(f"USER PROMOTED: {user_email} -> {next_role}")
                        logger.info(f"User {user_email} has completed all courses for {current_role}. Ready for Exam.")


        logger.info(f"Module completion tracked for {user_email}: +{actual_xp} XP")
        
        return {
            "status": "success",
            "xp_earned": actual_xp,
            "total_xp": profile["total_xp"],
            "message": f"Module completed! +{actual_xp} XP",
            "level_up": level_up,
            "new_level": new_role
        }
    except Exception as e:
        logger.error(f"Track completion error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "message": str(e)}

# Duplicate endpoint removed - now uses database queries at line 2344


# ==========================================
# ROBUST LEARNING PATH APIs
# ==========================================

@app.post("/learning-path/track-video-progress")
async def track_video_progress(
    user_email: str = Form(...),
    node_id: str = Form(...),
    video_position_seconds: float = Form(...),
    video_duration_seconds: float = Form(...),
    explicit_progress_percent: Optional[int] = Form(None), # NEW: Robust percent from frontend
):
    """Track video watching progress for a node/course."""
    try:
        if user_email not in user_node_progress:
            user_node_progress[user_email] = {}
        
        if node_id not in user_node_progress[user_email]:
            user_node_progress[user_email][node_id] = {
                "video_watched_percent": 0,
                "video_duration_seconds": video_duration_seconds,
                "video_position_seconds": 0,
                "max_position_reached": 0,
                "mid_quizzes_passed": 0,
                "mid_quizzes_total": 0,
                "mid_quizzes_completed": [],  # List of completed quiz trigger times
                "end_quiz_score": 0,
                "end_quiz_passed": False,
                "end_quiz_attempts": 0,
                "completed": False,
                "completed_at": None,
            }
        
        progress = user_node_progress[user_email][node_id]
        
        # Update max position (prevent rewind cheating)
        progress["max_position_reached"] = max(progress["max_position_reached"], video_position_seconds)
        progress["video_position_seconds"] = video_position_seconds
        progress["video_duration_seconds"] = video_duration_seconds
        
        # Calculate watch percentage
        if explicit_progress_percent is not None:
             # Use accurate unique-seconds count from frontend
             progress["video_watched_percent"] = max(progress.get("video_watched_percent", 0), int(explicit_progress_percent))
        elif video_duration_seconds > 0:
            # Fallback legacy calculation
            progress["video_watched_percent"] = min(100, int((progress["max_position_reached"] / video_duration_seconds) * 100))
        
        return {
            "status": "success",
            "progress": progress
        }
    except Exception as e:
        logger.error(f"Track video progress error: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/learning-path/node-progress/{user_email}/{node_id}")
async def get_node_progress(user_email: str, node_id: str):
    """Get detailed progress for a specific node."""
    try:
        # Get requirements
        requirements = node_completion_requirements.get(node_id, node_completion_requirements["default"])
        
        progress = {}
        if user_email in user_node_progress and node_id in user_node_progress[user_email]:
            progress = user_node_progress[user_email][node_id]
        else:
            progress = {
                "video_watched_percent": 0,
                "video_duration_seconds": 0,
                "video_position_seconds": 0,
                "max_position_reached": 0,
                "mid_quizzes_passed": 0,
                "mid_quizzes_total": 0,
                "mid_quizzes_completed": [],
                "end_quiz_score": 0,
                "end_quiz_passed": False,
                "end_quiz_attempts": 0,
                "completed": False,
                "completed_at": None,
            }
        
        # Check completion status
        video_complete = progress["video_watched_percent"] >= requirements["video_watch_percent"]
        quiz_passed = progress["end_quiz_passed"]
        
        # Check mid-quiz requirement
        mid_quiz_ok = True
        if requirements.get("mid_quiz_required", False):
            total_mid = progress.get("mid_quizzes_total", 0)
            passed_mid = progress.get("mid_quizzes_passed", 0)
            if total_mid > 0:
                mid_quiz_ok = passed_mid >= (total_mid * requirements.get("mid_quiz_pass_percent", 60) / 100)
        
        is_complete = video_complete and quiz_passed and mid_quiz_ok
        
        return {
            "progress": progress,
            "requirements": requirements,
            "video_complete": video_complete,
            "quiz_passed": quiz_passed,
            "mid_quiz_ok": mid_quiz_ok,
            "is_complete": is_complete
        }
    except Exception as e:
        logger.error(f"Get node progress error: {e}")
        return {"error": str(e)}


@app.post("/learning-path/generate-mid-video-quiz")
async def generate_mid_video_quiz(
    node_id: str = Form(...),
    transcript_segment: str = Form(...),
    trigger_time_seconds: float = Form(...),
    num_questions: int = Form(3)
):
    """Generate a mid-video quiz based on transcript segment using AI."""
    try:
        # Check if quiz already exists for this trigger time
        if node_id in mid_video_quizzes:
            for existing in mid_video_quizzes[node_id]:
                if abs(existing["trigger_time_seconds"] - trigger_time_seconds) < 10:
                    return {"status": "exists", "quiz": existing}
        
        # Generate quiz using Groq
        prompt = f"""Generate exactly {num_questions} multiple-choice quiz questions based on this video transcript segment:

"{transcript_segment}"

IMPORTANT: Return ONLY a valid JSON array with this exact structure:
[
    {{
        "question": "Clear, specific question about the content?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 0
    }}
]

Requirements:
- Questions should test comprehension of the transcript segment
- Each question should have exactly 4 options
- correctIndex is 0-3 indicating the correct option
- Return ONLY the JSON array, no markdown or extra text"""

        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a quiz generator. Return only valid JSON arrays."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Extract JSON array
        import re
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            response_text = json_match.group()
        
        questions = json.loads(response_text)
        
        # Create quiz entry
        quiz_entry = {
            "quiz_id": str(uuid.uuid4()),
            "trigger_time_seconds": trigger_time_seconds,
            "questions": questions[:num_questions],
            "generated_from_transcript": transcript_segment[:200] + "...",
            "created_at": datetime.now().isoformat()
        }
        
        if node_id not in mid_video_quizzes:
            mid_video_quizzes[node_id] = []
        mid_video_quizzes[node_id].append(quiz_entry)
        
        # Sort by trigger time
        mid_video_quizzes[node_id].sort(key=lambda x: x["trigger_time_seconds"])
        
        logger.info(f"Mid-video quiz generated for node {node_id} at {trigger_time_seconds}s")
        
        return {"status": "success", "quiz": quiz_entry}
        
    except Exception as e:
        logger.error(f"Generate mid-video quiz error: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/learning-path/mid-video-quizzes/{node_id}")
async def get_mid_video_quizzes(node_id: str, user_email: str = None):
    """Get all mid-video quizzes for a node, optionally with user completion status."""
    try:
        quizzes = mid_video_quizzes.get(node_id, [])
        
        if user_email:
            # Get user's completed quizzes for this node
            completed_triggers = []
            if user_email in user_node_progress and node_id in user_node_progress[user_email]:
                completed_triggers = user_node_progress[user_email][node_id].get("mid_quizzes_completed", [])
            
            # Mark each quiz with completion status
            for quiz in quizzes:
                quiz["completed"] = quiz["trigger_time_seconds"] in completed_triggers
        
        return {"quizzes": quizzes}
    except Exception as e:
        logger.error(f"Get mid-video quizzes error: {e}")
        return {"error": str(e)}


@app.post("/learning-path/submit-mid-video-quiz")
async def submit_mid_video_quiz(
    user_email: str = Form(...),
    node_id: str = Form(...),
    quiz_id: str = Form(...),
    trigger_time_seconds: float = Form(...),
    answers: str = Form(...),  # JSON array of answer indices
):
    """Submit answers for a mid-video quiz."""
    try:
        answers_list = json.loads(answers)
        
        # Find the quiz
        quiz = None
        if node_id in mid_video_quizzes:
            for q in mid_video_quizzes[node_id]:
                if q["quiz_id"] == quiz_id:
                    quiz = q
                    break
        
        if not quiz:
            return {"status": "error", "message": "Quiz not found"}
        
        # Calculate score
        questions = quiz["questions"]
        correct = 0
        for i, ans in enumerate(answers_list):
            if i < len(questions) and ans == questions[i].get("correctIndex"):
                correct += 1
        
        total = len(questions)
        score_percent = (correct / total * 100) if total > 0 else 0
        
        # Get requirements
        requirements = node_completion_requirements.get(node_id, node_completion_requirements["default"])
        passed = score_percent >= requirements.get("mid_quiz_pass_percent", 60)
        
        # Record attempt
        attempt = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "node_id": node_id,
            "quiz_id": quiz_id,
            "trigger_time_seconds": trigger_time_seconds,
            "score": correct,
            "total": total,
            "score_percent": score_percent,
            "passed": passed,
            "attempted_at": datetime.now().isoformat()
        }
        mid_video_quiz_attempts.append(attempt)
        
        # Update user progress
        if user_email not in user_node_progress:
            user_node_progress[user_email] = {}
        if node_id not in user_node_progress[user_email]:
            user_node_progress[user_email][node_id] = {
                "video_watched_percent": 0,
                "video_duration_seconds": 0,
                "video_position_seconds": 0,
                "max_position_reached": 0,
                "mid_quizzes_passed": 0,
                "mid_quizzes_total": 0,
                "mid_quizzes_completed": [],
                "end_quiz_score": 0,
                "end_quiz_passed": False,
                "end_quiz_attempts": 0,
                "completed": False,
                "completed_at": None,
            }
        
        progress = user_node_progress[user_email][node_id]
        
        # Track this quiz (only count once per trigger time)
        if trigger_time_seconds not in progress["mid_quizzes_completed"]:
            progress["mid_quizzes_total"] += 1
            if passed:
                progress["mid_quizzes_passed"] += 1
                progress["mid_quizzes_completed"].append(trigger_time_seconds)
        
        logger.info(f"Mid-video quiz submitted: {user_email} on {node_id} - {correct}/{total}")
        
        return {
            "status": "success",
            "result": {
                "correct": correct,
                "total": total,
                "score_percent": score_percent,
                "passed": passed,
                "can_continue": passed
            }
        }
        
    except Exception as e:
        logger.error(f"Submit mid-video quiz error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/learning-path/submit-end-quiz")
async def submit_end_quiz(
    user_email: str = Form(...),
    node_id: str = Form(...),
    score: int = Form(...),
    total: int = Form(...),
):
    """Submit the end-of-lesson quiz score and check completion."""
    try:
        # Get requirements
        requirements = node_completion_requirements.get(node_id, node_completion_requirements["default"])
        
        score_percent = (score / total * 100) if total > 0 else 0
        passed = score_percent >= requirements.get("quiz_pass_percent", 70)
        
        # Update user progress
        if user_email not in user_node_progress:
            user_node_progress[user_email] = {}
        if node_id not in user_node_progress[user_email]:
            user_node_progress[user_email][node_id] = {
                "video_watched_percent": 0,
                "video_duration_seconds": 0,
                "video_position_seconds": 0,
                "max_position_reached": 0,
                "mid_quizzes_passed": 0,
                "mid_quizzes_total": 0,
                "mid_quizzes_completed": [],
                "end_quiz_score": 0,
                "end_quiz_passed": False,
                "end_quiz_attempts": 0,
                "completed": False,
                "completed_at": None,
            }
        
        progress = user_node_progress[user_email][node_id]
        progress["end_quiz_attempts"] += 1
        progress["end_quiz_score"] = max(progress["end_quiz_score"], score_percent)
        progress["end_quiz_passed"] = progress["end_quiz_passed"] or passed
        
        # Check full completion
        video_complete = progress["video_watched_percent"] >= requirements["video_watch_percent"]
        mid_quiz_ok = True
        if requirements.get("mid_quiz_required", False) and progress["mid_quizzes_total"] > 0:
            mid_pass_rate = progress["mid_quizzes_passed"] / progress["mid_quizzes_total"] * 100
            mid_quiz_ok = mid_pass_rate >= requirements.get("mid_quiz_pass_percent", 60)
        
        is_complete = video_complete and passed and mid_quiz_ok
        
        if is_complete and not progress["completed"]:
            progress["completed"] = True
            progress["completed_at"] = datetime.now().isoformat()
        
        logger.info(f"End quiz submitted: {user_email} on {node_id} - {score}/{total} ({score_percent}%) - Complete: {is_complete}")
        
        return {
            "status": "success",
            "result": {
                "score": score,
                "total": total,
                "score_percent": score_percent,
                "passed": passed,
                "video_complete": video_complete,
                "current_video_percent": progress["video_watched_percent"],  # Return actual server-side value
                "mid_quiz_ok": mid_quiz_ok,
                "is_complete": is_complete,
                "message": "Course completed! 🎉" if is_complete else "Keep trying! You need to pass the quiz." if not passed else "Watch more of the video to complete."
            }
        }
        
    except Exception as e:
        logger.error(f"Submit end quiz error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/learning-path/validate-completion")
async def validate_node_completion(
    user_email: str = Form(...),
    node_id: str = Form(...),
):
    """Validate if a node is properly completed (video + quiz + mid-quizzes)."""
    try:
        requirements = node_completion_requirements.get(node_id, node_completion_requirements["default"])
        
        progress = {}
        if user_email in user_node_progress and node_id in user_node_progress[user_email]:
            progress = user_node_progress[user_email][node_id]
        
        # Check all requirements
        video_watched = progress.get("video_watched_percent", 0) >= requirements["video_watch_percent"]
        end_quiz_passed = progress.get("end_quiz_passed", False)
        
        mid_quiz_ok = True
        mid_quiz_details = {"required": False, "passed": 0, "total": 0}
        
        if requirements.get("mid_quiz_required", False):
            mid_quiz_details["required"] = True
            mid_quiz_details["passed"] = progress.get("mid_quizzes_passed", 0)
            mid_quiz_details["total"] = progress.get("mid_quizzes_total", 0)
            if mid_quiz_details["total"] > 0:
                pass_rate = mid_quiz_details["passed"] / mid_quiz_details["total"] * 100
                mid_quiz_ok = pass_rate >= requirements.get("mid_quiz_pass_percent", 60)
        
        is_valid = video_watched and end_quiz_passed and mid_quiz_ok
        
        return {
            "is_valid": is_valid,
            "details": {
                "video_watched_percent": progress.get("video_watched_percent", 0),
                "video_required_percent": requirements["video_watch_percent"],
                "video_ok": video_watched,
                "end_quiz_score": progress.get("end_quiz_score", 0),
                "end_quiz_required": requirements["quiz_pass_percent"],
                "end_quiz_passed": end_quiz_passed,
                "mid_quiz": mid_quiz_details,
                "mid_quiz_ok": mid_quiz_ok,
            }
        }
        
    except Exception as e:
        logger.error(f"Validate completion error: {e}")
        return {"status": "error", "message": str(e)}


# ==========================================
# ROLE ADVANCEMENT EXAM APIs
# ==========================================

@app.get("/role-advancement/eligibility/{user_email}")
async def check_advancement_eligibility(user_email: str):
    """Check if user is eligible for role advancement exam."""
    try:
        # Get user data
        user_data = users_store.get(user_email, {"role": "Waffler"})
        current_role = user_data.get("role", "Waffler")
        
        HIERARCHY = ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Assistant Store Manager']
        
        if current_role not in HIERARCHY or current_role == HIERARCHY[-1]:
            return {"eligible": False, "reason": "Already at highest level or invalid role"}
        
        # Get advancement config
        config = level_advancement_config.get(current_role)
        if not config:
            return {"eligible": False, "reason": "No advancement path configured"}
        
        target_role = config["target"]
        
        # Check if all courses for current level are completed WITH VALID COMPLETION
        role_rules = access_control_store.get(current_role, {})
        required_courses = role_rules.get("accessible_courses", [])
        
        if not required_courses:
            return {"eligible": False, "reason": "No courses assigned to current level"}
        
        # Validate each course completion
        incomplete_courses = []
        for course_id in required_courses:
            if user_email in user_node_progress and course_id in user_node_progress[user_email]:
                progress = user_node_progress[user_email][course_id]
                if not progress.get("completed", False):
                    incomplete_courses.append(course_id)
            else:
                # Check legacy completions
                legacy_complete = any(
                    c["course_id"] == course_id and c["user_email"] == user_email 
                    for c in course_completions
                )
                if not legacy_complete:
                    incomplete_courses.append(course_id)
        
        if incomplete_courses:
            return {
                "eligible": False,
                "reason": f"Must complete all {len(required_courses)} courses first",
                "courses_remaining": len(incomplete_courses),
                "courses_total": len(required_courses)
            }
        
        # Check if exam already exists (pending)
        if user_email in role_advancement_exams:
            existing = role_advancement_exams[user_email]
            if existing.get("status") == "pending":
                return {
                    "eligible": True,
                    "has_pending_exam": True,
                    "exam_id": existing["exam_id"],
                    "target_role": target_role,
                    "config": config
                }
        
        return {
            "eligible": True,
            "has_pending_exam": False,
            "current_role": current_role,
            "target_role": target_role,
            "config": config,
            "message": f"Ready to take advancement exam for {target_role}!"
        }
        
    except Exception as e:
        logger.error(f"Check advancement eligibility error: {e}")
        return {"error": str(e)}


@app.post("/role-advancement/generate-exam")
async def generate_advancement_exam(user_email: str = Form(...)):
    """Generate a proctored advancement exam based on all courses from current level."""
    try:
        # Check eligibility first
        eligibility = await check_advancement_eligibility(user_email)
        if not eligibility.get("eligible"):
            return {"status": "error", "message": eligibility.get("reason", "Not eligible")}
        
        if eligibility.get("has_pending_exam"):
            return {"status": "exists", "exam": role_advancement_exams[user_email]}
        
        user_data = users_store.get(user_email, {"role": "Waffler"})
        current_role = user_data.get("role", "Waffler")
        config = level_advancement_config.get(current_role)
        target_role = config["target"]
        
        # Get all courses for current level
        role_rules = access_control_store.get(current_role, {})
        course_ids = role_rules.get("accessible_courses", [])
        
        # Gather all transcripts/content from these courses
        all_content = []
        for course_id in course_ids:
            for content in content_store:
                if content.get("id") == course_id:
                    transcript = content.get("transcript", "")
                    title = content.get("title", "")
                    all_content.append(f"Topic: {title}\n{transcript}")
                    break
        
        combined_content = "\n\n---\n\n".join(all_content)[:8000]  # Limit for API
        
        num_questions = config["exam_questions"]
        
        # Generate comprehensive exam using AI
        prompt = f"""Generate exactly {num_questions} challenging multiple-choice questions for a role advancement exam.

This exam tests mastery of ALL the following training content:

{combined_content}

IMPORTANT: Return ONLY a valid JSON array with this exact structure:
[
    {{
        "question": "Challenging question that tests understanding?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 0
    }}
]

Requirements:
- Questions should test deep understanding, not just recall
- Mix question difficulty (some easy, mostly medium, some hard)
- Cover different topics from the training content
- Each question should have exactly 4 plausible options
- correctIndex is 0-3 indicating the correct option
- Generate exactly {num_questions} questions
- Return ONLY the JSON array"""

        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an expert assessment creator for employee advancement exams. Create challenging but fair questions."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=6000
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Extract JSON
        import re
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            response_text = json_match.group()
        
        questions = json.loads(response_text)
        
        # Validate questions
        for q in questions:
            if "correctIndex" not in q:
                q["correctIndex"] = 0
            q["correctIndex"] = max(0, min(3, int(q["correctIndex"])))
        
        # Create exam entry
        exam_id = str(uuid.uuid4())
        exam = {
            "exam_id": exam_id,
            "user_email": user_email,
            "current_role": current_role,
            "target_role": target_role,
            "questions": questions[:num_questions],
            "time_limit_minutes": config["exam_time_minutes"],
            "pass_percent": config["pass_percent"],
            "proctored": config["proctored"],
            "max_violations": config["max_violations"],
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "expires_at": (datetime.now() + timedelta(days=7)).isoformat()
        }
        
        role_advancement_exams[user_email] = exam
        
        logger.info(f"Advancement exam generated for {user_email}: {current_role} -> {target_role}")
        
        return {
            "status": "success",
            "exam": {
                "exam_id": exam_id,
                "current_role": current_role,
                "target_role": target_role,
                "total_questions": len(questions[:num_questions]),
                "time_limit_minutes": config["exam_time_minutes"],
                "pass_percent": config["pass_percent"],
                "proctored": config["proctored"]
            }
        }
        
    except Exception as e:
        logger.error(f"Generate advancement exam error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "message": str(e)}


@app.get("/role-advancement/exam/{user_email}")
async def get_advancement_exam(user_email: str):
    """Get the pending advancement exam for a user."""
    try:
        if user_email not in role_advancement_exams:
            return {"status": "not_found", "message": "No pending exam"}
        
        exam = role_advancement_exams[user_email]
        
        if exam.get("status") != "pending":
            return {"status": "completed", "message": "Exam already taken"}
        
        # Don't include correctIndex in response (prevent cheating)
        safe_questions = []
        for q in exam["questions"]:
            safe_questions.append({
                "question": q["question"],
                "options": q["options"]
            })
        
        return {
            "status": "success",
            "exam": {
                "exam_id": exam["exam_id"],
                "current_role": exam["current_role"],
                "target_role": exam["target_role"],
                "questions": safe_questions,
                "total_questions": len(safe_questions),
                "time_limit_minutes": exam["time_limit_minutes"],
                "pass_percent": exam["pass_percent"],
                "proctored": exam["proctored"],
                "max_violations": exam["max_violations"]
            }
        }
        
    except Exception as e:
        logger.error(f"Get advancement exam error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/role-advancement/submit-exam")
async def submit_advancement_exam(
    user_email: str = Form(...),
    exam_id: str = Form(...),
    answers: str = Form(...),  # JSON array
    time_taken_seconds: int = Form(...),
    violations: int = Form(0),
    breach_log: str = Form("[]"),
    critical_breaches: int = Form(0),
    warning_breaches: int = Form(0)
):
    """Submit the advancement exam with proctoring data."""
    try:
        if user_email not in role_advancement_exams:
            return {"status": "error", "message": "No exam found"}
        
        exam = role_advancement_exams[user_email]
        
        if exam.get("status") != "pending" or exam["exam_id"] != exam_id:
            return {"status": "error", "message": "Invalid or already completed exam"}
        
        answers_list = json.loads(answers)
        breach_log_list = json.loads(breach_log)
        
        # Calculate score
        questions = exam["questions"]
        correct = 0
        for i, ans in enumerate(answers_list):
            if i < len(questions) and ans == questions[i].get("correctIndex"):
                correct += 1
        
        total = len(questions)
        score_percent = (correct / total * 100) if total > 0 else 0
        
        # Check violations
        max_violations = exam.get("max_violations", 3)
        violation_fail = critical_breaches > 0 or violations > max_violations
        
        # Determine pass/fail
        passed = score_percent >= exam["pass_percent"] and not violation_fail
        
        # Determine integrity status
        integrity_status = "clean"
        if critical_breaches > 0:
            integrity_status = "flagged"
        elif warning_breaches > 2:
            integrity_status = "suspicious"
        elif violations > 0:
            integrity_status = "minor_issues"
        
        # Record submission
        submission = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "exam_id": exam_id,
            "from_role": exam["current_role"],
            "to_role": exam["target_role"],
            "answers": answers_list,
            "correct": correct,
            "total": total,
            "score_percent": round(score_percent, 1),
            "passed": passed,
            "time_taken_seconds": time_taken_seconds,
            "violations": violations,
            "breach_log": breach_log_list,
            "critical_breaches": critical_breaches,
            "warning_breaches": warning_breaches,
            "integrity_status": integrity_status,
            "violation_fail": violation_fail,
            "submitted_at": datetime.now().isoformat()
        }
        role_advancement_submissions.append(submission)
        
        # Update exam status
        exam["status"] = "completed"
        exam["result"] = submission
        
        # Apply promotion if passed
        promotion_applied = False
        if passed:
            user_data = users_store.get(user_email)
            if user_data:
                old_role = user_data.get("role")
                user_data["role"] = exam["target_role"]
                users_store[user_email] = user_data
                promotion_applied = True
                logger.info(f"ROLE ADVANCEMENT: {user_email} promoted from {old_role} to {exam['target_role']}")
                
                # Broadcast notification
                await manager.broadcast({
                    "type": "ROLE_ADVANCEMENT",
                    "data": {
                        "user_email": user_email,
                        "from_role": old_role,
                        "to_role": exam["target_role"],
                        "score": score_percent
                    }
                })
        
        logger.info(f"Advancement exam submitted: {user_email} - {correct}/{total} ({score_percent}%) - Passed: {passed}")
        
        return {
            "status": "success",
            "result": {
                "score": correct,
                "total": total,
                "score_percent": round(score_percent, 1),
                "passed": passed,
                "violation_fail": violation_fail,
                "integrity_status": integrity_status,
                "promotion_applied": promotion_applied,
                "new_role": exam["target_role"] if passed else None,
                "message": f"🎉 Congratulations! You are now a {exam['target_role']}!" if passed else "Keep studying and try again!"
            },
            "submission_id": submission["id"]
        }
        
    except Exception as e:
        logger.error(f"Submit advancement exam error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "message": str(e)}


@app.get("/role-advancement/submissions/{user_email}")
async def get_user_advancement_submissions(user_email: str):
    """Get all advancement exam submissions for a user."""
    return [s for s in role_advancement_submissions if s["user_email"] == user_email]


@app.get("/role-advancement/admin/all-submissions")
async def get_all_advancement_submissions():
    """Admin: Get all advancement exam submissions with detailed breach logs."""
    return role_advancement_submissions


@app.get("/learning-path/requirements")
async def get_node_requirements():
    """Get all node completion requirements."""
    return node_completion_requirements


@app.post("/learning-path/requirements/{node_id}")
async def set_node_requirements(
    node_id: str,
    video_watch_percent: int = Form(90),
    quiz_pass_percent: int = Form(70),
    mid_quiz_required: bool = Form(True),
    mid_quiz_pass_percent: int = Form(60)
):
    """Set completion requirements for a specific node."""
    node_completion_requirements[node_id] = {
        "video_watch_percent": video_watch_percent,
        "quiz_pass_percent": quiz_pass_percent,
        "mid_quiz_required": mid_quiz_required,
        "mid_quiz_pass_percent": mid_quiz_pass_percent
    }
    return {"status": "success", "requirements": node_completion_requirements[node_id]}


# Import timedelta for exam expiry
from datetime import timedelta


# ==========================================
# INTERACTIVE SIMULATION APIs
# ==========================================

# --- SIMULATION DATA STORES ---
simulations_store = []  # Store all simulations
simulation_progress_store = []  # Store user progress/completions

# Initialize with sample simulation
simulations_store.append({
    "id": "sim-default-1",
    "title": "Making the Perfect Belgian Waffle",
    "description": "Learn the step-by-step process of preparing and serving our signature Belgian waffle from start to finish.",
    "category": "waffle",
    "difficulty": "Easy",
    "thumbnailUrl": "https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=600",
    "estimatedTime": "8 min",
    "maxScore": 30,
    "nodes": [
        {
            "id": "node-1",
            "title": "Entering the Kitchen",
            "description": "The shift starts. Time to prepare the waffle station.",
            "isStart": True,
            "videoUrl": None,
            "options": [
                {"id": "opt-1", "text": "Put on apron and wash hands", "isCorrect": True, "nextNodeId": "node-2", "consequence": ""},
                {"id": "opt-2", "text": "Start mixing batter immediately", "isCorrect": False, "consequence": "Starting without proper hygiene can contaminate food and spread bacteria."},
                {"id": "opt-3", "text": "Check your phone first", "isCorrect": False, "consequence": "Using your phone in the kitchen area violates food safety protocols."},
                {"id": "opt-4", "text": "Talk to colleagues", "isCorrect": False, "consequence": "Delaying preparation can impact service time and customer satisfaction."},
            ],
        },
        {
            "id": "node-2",
            "title": "Preparing the Batter",
            "description": "The batter needs to be prepared correctly for the perfect waffle.",
            "isStart": False,
            "videoUrl": None,
            "options": [
                {"id": "opt-5", "text": "Follow the recipe card exactly", "isCorrect": True, "nextNodeId": "node-3", "consequence": ""},
                {"id": "opt-6", "text": "Add extra sugar for taste", "isCorrect": False, "consequence": "Modifying recipes affects consistency and can upset customer expectations."},
                {"id": "opt-7", "text": "Use yesterday's leftover batter", "isCorrect": False, "consequence": "Old batter may have bacterial growth and produces inferior results."},
                {"id": "opt-8", "text": "Skip measuring ingredients", "isCorrect": False, "consequence": "Inconsistent measurements lead to unpredictable product quality."},
            ],
        },
        {
            "id": "node-3",
            "title": "Operating the Waffle Iron",
            "description": "Time to cook the waffle to golden perfection.",
            "isStart": False,
            "videoUrl": None,
            "options": [
                {"id": "opt-9", "text": "Preheat and grease the iron properly", "isCorrect": True, "nextNodeId": None, "consequence": ""},
                {"id": "opt-10", "text": "Pour batter on cold iron", "isCorrect": False, "consequence": "Cold iron causes sticking and uneven cooking."},
                {"id": "opt-11", "text": "Overfill the iron with batter", "isCorrect": False, "consequence": "Overflow creates mess, waste, and fire hazards."},
                {"id": "opt-12", "text": "Open iron repeatedly to check", "isCorrect": False, "consequence": "Opening during cooking releases heat and creates uneven texture."},
            ],
        },
    ],
    "createdAt": datetime.now().isoformat(),
    "updatedAt": datetime.now().isoformat(),
})

# --- PYDANTIC MODELS ---
class SimulationOption(BaseModel):
    id: str
    text: str
    isCorrect: bool
    nextNodeId: Optional[str] = None
    consequence: Optional[str] = ""

class SimulationNode(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    isStart: bool = False
    videoUrl: Optional[str] = None
    options: List[dict]

class SimulationData(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    category: str = "waffle"
    difficulty: str = "Medium"
    thumbnailUrl: Optional[str] = None
    estimatedTime: Optional[str] = "5 min"
    maxScore: Optional[int] = 0
    nodes: List[dict]
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

class SimulationProgress(BaseModel):
    userId: str
    simulationId: str
    score: int
    totalSteps: int
    wrongAttempts: int
    timeSpentSeconds: int
    attemptHistory: List[dict] = []
    completedAt: str

class ConsequenceRequest(BaseModel):
    scenario: str
    currentStep: str
    wrongOption: str


@app.get("/simulations")
async def get_all_simulations(db: Session = Depends(get_db)):
    """Get all available simulations - from DATABASE."""
    # Get from database
    db_simulations = db_ops.get_all_simulations(db, active_only=True)
    result = []
    for sim in db_simulations:
        result.append({
            "id": sim.id,
            "title": sim.title,
            "description": sim.description,
            "category": sim.category,
            "difficulty": sim.difficulty,
            "duration": sim.duration,
            "thumbnail": sim.thumbnail,
            "nodes": sim.nodes or [],
            "createdAt": sim.created_at.isoformat() if sim.created_at else None,
            "updatedAt": sim.updated_at.isoformat() if sim.updated_at else None
        })

    # Merge with in-memory for backward compatibility
    existing_ids = {s["id"] for s in result}
    for sim in simulations_store:
        if sim.get("id") not in existing_ids:
            result.append(sim)

    return result


@app.get("/simulation/{simulation_id}")
async def get_simulation(simulation_id: str, db: Session = Depends(get_db)):
    """Get a specific simulation by ID - from DATABASE."""
    # Try database first
    db_sim = db_ops.get_simulation_by_id(db, simulation_id)
    if db_sim:
        return {
            "id": db_sim.id,
            "title": db_sim.title,
            "description": db_sim.description,
            "category": db_sim.category,
            "difficulty": db_sim.difficulty,
            "duration": db_sim.duration,
            "thumbnail": db_sim.thumbnail,
            "nodes": db_sim.nodes or [],
            "createdAt": db_sim.created_at.isoformat() if db_sim.created_at else None,
            "updatedAt": db_sim.updated_at.isoformat() if db_sim.updated_at else None
        }

    # Fallback to in-memory
    for sim in simulations_store:
        if sim["id"] == simulation_id:
            return sim
    raise HTTPException(status_code=404, detail="Simulation not found")


@app.post("/simulation/save")
async def save_simulation(simulation: SimulationData, db: Session = Depends(get_db)):
    """Create or update a simulation - SAVES TO DATABASE."""
    try:
        sim_dict = simulation.dict()

        # Check if exists in database
        existing_sim = db_ops.get_simulation_by_id(db, simulation.id)

        if existing_sim:
            # Update existing in database - use correct field names from SimulationData model
            updates = {
                "title": simulation.title,
                "description": simulation.description,
                "category": simulation.category,
                "difficulty": simulation.difficulty,
                "duration": simulation.estimatedTime,  # Map estimatedTime to duration
                "thumbnail": simulation.thumbnailUrl,  # Map thumbnailUrl to thumbnail
                "nodes": simulation.nodes
            }
            db_ops.update_simulation(db, simulation.id, updates)
            logger.info(f"Simulation updated in DB: {simulation.title}")
        else:
            # Create new in database - use correct field names from SimulationData model
            sim_data = {
                "id": simulation.id,
                "title": simulation.title,
                "description": simulation.description,
                "category": simulation.category,
                "difficulty": simulation.difficulty,
                "duration": simulation.estimatedTime,  # Map estimatedTime to duration
                "thumbnail": simulation.thumbnailUrl,  # Map thumbnailUrl to thumbnail
                "nodes": simulation.nodes
            }
            db_ops.create_simulation(db, sim_data)
            logger.info(f"Simulation created in DB: {simulation.title}")

        # Also update in-memory for backward compatibility
        existing_idx = None
        for i, sim in enumerate(simulations_store):
            if sim["id"] == simulation.id:
                existing_idx = i
                break

        if existing_idx is not None:
            sim_dict["updatedAt"] = datetime.now().isoformat()
            sim_dict["createdAt"] = simulations_store[existing_idx].get("createdAt", datetime.now().isoformat())
            simulations_store[existing_idx] = sim_dict
        else:
            sim_dict["createdAt"] = datetime.now().isoformat()
            sim_dict["updatedAt"] = datetime.now().isoformat()
            simulations_store.append(sim_dict)

        return {"success": True, "id": simulation.id}

    except Exception as e:
        logger.error(f"Error saving simulation: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save simulation: {str(e)}")


@app.delete("/simulation/{simulation_id}")
async def delete_simulation_endpoint(simulation_id: str, db: Session = Depends(get_db)):
    """Delete a simulation - from DATABASE and CDN (including all node videos)."""
    global simulations_store

    # Get simulation before deletion to find all video URLs for CDN cleanup
    video_urls_to_delete = []
    try:
        db_sim = db_ops.get_simulation_by_id(db, simulation_id)
        if db_sim and db_sim.nodes:
            # Extract video URLs from all nodes
            for node in db_sim.nodes:
                if isinstance(node, dict):
                    video_url = node.get("videoUrl") or node.get("video_url")
                    if video_url:
                        video_urls_to_delete.append(video_url)
    except Exception as e:
        logger.error(f"Error getting simulation for CDN cleanup: {e}")

    # Also check in-memory
    for sim in simulations_store:
        if sim.get("id") == simulation_id:
            nodes = sim.get("nodes", [])
            for node in nodes:
                if isinstance(node, dict):
                    video_url = node.get("videoUrl") or node.get("video_url")
                    if video_url and video_url not in video_urls_to_delete:
                        video_urls_to_delete.append(video_url)
            break

    # Delete all videos from CDN
    if cdn_service.CDN_ENABLED and cdn_service.R2_PUBLIC_URL:
        for video_url in video_urls_to_delete:
            try:
                if cdn_service.R2_PUBLIC_URL in video_url:
                    object_key = video_url.replace(cdn_service.R2_PUBLIC_URL, "").lstrip("/")
                    cdn_service.delete_from_cdn(object_key)
                    logger.info(f"Deleted simulation video from CDN: {object_key}")
            except Exception as e:
                logger.error(f"Error deleting simulation video from CDN: {e}")

    # Delete from database
    db_ops.delete_simulation(db, simulation_id)

    # Also delete from in-memory
    simulations_store = [s for s in simulations_store if s["id"] != simulation_id]
    logger.info(f"Simulation deleted: {simulation_id}")
    return {"success": True}


@app.post("/simulation/upload-video")
async def upload_simulation_video(video: UploadFile = File(...)):
    """Upload a video clip for a simulation step to Cloudflare R2 CDN."""
    try:
        # Generate unique filename
        file_ext = video.filename.split(".")[-1] if "." in video.filename else "mp4"
        unique_filename = f"sim_video_{uuid.uuid4()}.{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        # Save file temporarily
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

        # Upload to Cloudflare R2 CDN
        video_url = None
        cdn_object_key = f"simulations/{unique_filename}"

        if cdn_service.CDN_ENABLED:
            content_type = cdn_service.get_content_type(unique_filename)
            cdn_url = cdn_service.upload_to_cdn(file_path, cdn_object_key, content_type)
            if cdn_url:
                video_url = cdn_url
                logger.info(f"Simulation video uploaded to CDN: {cdn_url}")
                # Delete local file after successful CDN upload
                try:
                    os.remove(file_path)
                    logger.info(f"Deleted local file after CDN upload: {file_path}")
                except Exception as del_err:
                    logger.warning(f"Could not delete local file: {del_err}")
            else:
                logger.warning("CDN upload failed, falling back to local storage")
                video_url = f"{BASE_URL}/uploads/{unique_filename}"
        else:
            video_url = f"{BASE_URL}/uploads/{unique_filename}"
            logger.info(f"Simulation video uploaded locally: {unique_filename}")

        return {"success": True, "url": video_url, "filename": unique_filename, "cdn_key": cdn_object_key}
    except Exception as e:
        logger.error(f"Video upload error: {e}")
        return {"success": False, "error": str(e)}


@app.post("/simulation/complete")
async def complete_simulation(progress: SimulationProgress):
    """Record simulation completion and update recommendations."""
    try:
        progress_dict = progress.dict()
        
        # Find simulation title
        sim_title = "Unknown"
        for sim in simulations_store:
            if sim["id"] == progress.simulationId:
                sim_title = sim["title"]
                break
        
        progress_dict["simulationTitle"] = sim_title
        progress_dict["id"] = str(uuid.uuid4())
        
        simulation_progress_store.append(progress_dict)
        logger.info(f"Simulation completed: {progress.userId} finished '{sim_title}' with score {progress.score}")
        
        # Calculate performance metrics for recommendation engine
        max_score = progress.totalSteps * 10
        percentage = (progress.score / max_score * 100) if max_score > 0 else 0
        
        # Flag weak areas based on attempt history
        weak_areas = []
        for attempt in progress.attemptHistory:
            if not attempt.get("isCorrect"):
                weak_areas.append(attempt.get("nodeId"))
        
        # Update learning profile for recommendations (if learning profile exists)
        try:
            # Find related category for skill gap update
            for sim in simulations_store:
                if sim["id"] == progress.simulationId:
                    category = sim.get("category", "general")
                    # Log for recommendation engine integration
                    logger.info(f"Recommendation data: User {progress.userId}, Category: {category}, Score: {percentage}%, Weak areas: {weak_areas}")
                    break
        except Exception as e:
            logger.warning(f"Could not update recommendation engine: {e}")
        
        return {
            "success": True,
            "message": "Progress saved",
            "percentage": round(percentage, 1),
            "weakAreas": weak_areas
        }
    except Exception as e:
        logger.error(f"Complete simulation error: {e}")
        return {"success": False, "error": str(e)}


@app.get("/simulation/history/user")
async def get_user_simulation_history(user_id: str = "user"):
    """Get simulation history for a user."""
    user_history = [p for p in simulation_progress_store if p.get("userId") == user_id]
    return sorted(user_history, key=lambda x: x.get("completedAt", ""), reverse=True)


@app.get("/simulation/history/all")
async def get_all_simulation_history():
    """Get all simulation history (for admin/manager)."""
    return sorted(simulation_progress_store, key=lambda x: x.get("completedAt", ""), reverse=True)


@app.get("/simulation/analytics/{simulation_id}")
async def get_simulation_analytics(simulation_id: str):
    """Get analytics for a specific simulation."""
    progress_list = [p for p in simulation_progress_store if p.get("simulationId") == simulation_id]
    
    if not progress_list:
        return {
            "simulationId": simulation_id,
            "totalAttempts": 0,
            "averageScore": 0,
            "averageTime": 0,
            "completionRate": 0
        }
    
    total_attempts = len(progress_list)
    avg_score = sum(p.get("score", 0) for p in progress_list) / total_attempts
    avg_time = sum(p.get("timeSpentSeconds", 0) for p in progress_list) / total_attempts
    
    # Calculate most failed steps
    failed_steps = {}
    for progress in progress_list:
        for attempt in progress.get("attemptHistory", []):
            if not attempt.get("isCorrect"):
                node_id = attempt.get("nodeId", "unknown")
                failed_steps[node_id] = failed_steps.get(node_id, 0) + 1
    
    return {
        "simulationId": simulation_id,
        "totalAttempts": total_attempts,
        "averageScore": round(avg_score, 1),
        "averageTimeSeconds": round(avg_time, 1),
        "mostFailedSteps": failed_steps
    }


@app.post("/simulation/generate-consequence")
async def generate_consequence(request: ConsequenceRequest):
    """Generate AI consequence for wrong choice."""
    try:
        from groq import Groq
        groq_client = Groq(api_key=GROQ_API_KEY)
        
        prompt = f"""
        You are a training simulation for 'The Belgian Waffle Co.' restaurant.
        
        Scenario: {request.scenario}
        Current Step: {request.currentStep}
        Wrong Choice Selected: {request.wrongOption}
        
        Generate a SHORT, impactful consequence (2-3 sentences max) explaining what could go wrong if the employee makes this choice in real life.
        Focus on:
        - Food safety risks
        - Customer satisfaction impact
        - Business/reputation consequences
        - Team/colleague effects
        
        Be specific and realistic. Don't be preachy.
        
        Return ONLY the consequence text, no formatting.
        """
        
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=150
        )
        
        consequence = completion.choices[0].message.content.strip()
        logger.info(f"Generated consequence for: {request.wrongOption[:30]}...")
        
        return {"consequence": consequence}
    except Exception as e:
        logger.error(f"Consequence generation error: {e}")
        return {"consequence": "This action could lead to problems. Think carefully about the correct procedure!"}


@app.get("/simulation/leaderboard/{simulation_id}")
async def get_simulation_leaderboard(simulation_id: str, limit: int = 10):
    """Get leaderboard for a specific simulation."""
    progress_list = [p for p in simulation_progress_store if p.get("simulationId") == simulation_id]
    
    # Sort by score (desc), then by time (asc)
    sorted_list = sorted(
        progress_list,
        key=lambda x: (-x.get("score", 0), x.get("timeSpentSeconds", 9999))
    )
    
    return sorted_list[:limit]


# ==========================================
# ADVANCED ANALYTICS MODULE
# ==========================================

# Analytics data stores
store_analytics: List[dict] = []  # {store_id, store_name, completion_%, avg_score, hygiene_score, risk_level, sales_impact}
employee_analytics: List[dict] = []  # {user_email, name, role, store, completion_%, avg_score, skills, risk_status}

@app.get("/analytics/dashboard")
async def get_analytics_dashboard(db: Session = Depends(get_db)):
    """Main analytics dashboard with overview metrics - OPTIMIZED with DB queries"""
    # Use optimized database queries instead of in-memory iteration
    stats = db_ops.get_dashboard_stats(db)

    total_stores = stats['total_stores']
    total_employees = stats['total_users']
    total_completions = stats['total_completions']
    total_courses = stats['total_courses']
    avg_quiz_score = stats['avg_quiz_score']
    total_assessments = stats['total_assessments']
    passed_assessments = stats['passed_assessments']

    # Calculate completion rate
    avg_completion = (total_completions / max(total_employees * total_courses, 1)) * 100 if total_courses > 0 else 0

    # Compliance score
    compliance_score = (passed_assessments / total_assessments * 100) if total_assessments > 0 else 100

    # Customer satisfaction (simulated based on training)
    customer_satisfaction = min(100, 75 + (avg_completion / 10))

    # Training completion trend (last 30 days) - optimized single query
    trend_results = db_ops.get_completion_trend(db, days=30)

    # Fill in missing days with 0 completions
    from datetime import datetime, timedelta
    today = datetime.now().date()
    trend_dict = {r['date']: r['count'] for r in trend_results}
    trend_data = []
    for i in range(30, 0, -1):
        date = today - timedelta(days=i)
        date_str = str(date)
        trend_data.append({"date": date_str, "completions": trend_dict.get(date_str, 0)})

    # Risk summary - calculated from store analytics
    store_data = db_ops.get_store_analytics(db)
    high_risk_stores = 0
    fully_compliant_stores = 0
    employees_needing_retraining = 0

    for store in store_data:
        user_count = store.get('user_count', 0)
        completion_count = store.get('completion_count', 0)
        completion_pct = (completion_count / max(user_count * total_courses, 1)) * 100 if total_courses > 0 else 0

        if completion_pct < 30:
            high_risk_stores += 1
            employees_needing_retraining += user_count
        elif completion_pct >= 60:
            fully_compliant_stores += 1

    return {
        "overview": {
            "total_stores": total_stores,
            "total_employees": total_employees,
            "avg_completion": round(avg_completion, 1),
            "avg_quiz_score": round(avg_quiz_score, 1),
            "compliance_score": round(compliance_score, 1),
            "customer_satisfaction": round(customer_satisfaction, 1)
        },
        "trend": trend_data,
        "risk_summary": {
            "high_risk_stores": high_risk_stores,
            "employees_needing_retraining": employees_needing_retraining,
            "fully_compliant_stores": fully_compliant_stores
        }
    }


@app.get("/analytics/stores")
async def get_store_performance(db: Session = Depends(get_db)):
    """Store-wise performance analytics - OPTIMIZED with DB queries"""
    return db_ops.get_store_performance_data(db)


@app.get("/analytics/stores/{store_name}")
async def get_store_detail_endpoint(store_name: str, db: Session = Depends(get_db)):
    """Detailed store analytics with tabs - OPTIMIZED with DB queries"""
    store_data = db_ops.get_store_detail(db, store_name)

    return {
        "overview": {
            "store_name": store_name,
            "completion_percent": store_data["total_completion"],
            "avg_quiz_score": store_data["avg_score"],
            "compliance_percent": 95.0,  # Simulated
            "customer_complaints_reduction": 25  # Simulated correlation
        },
        "employees": store_data["employees"],
        "hygiene": {
            "sop_compliance": 92.0,
            "audit_ready": True,
            "violations": []
        },
        "sales_impact": {
            "training_vs_sales_improvement": 18.5,
            "customer_rating_improvement": 0.8
        }
    }


@app.get("/analytics/employees")
async def get_employee_performance(db: Session = Depends(get_db)):
    """Employee-wise performance analytics - OPTIMIZED with DB queries"""
    from sqlalchemy import func

    # Get total courses
    total_courses = db.query(func.count(DBContent.id)).scalar() or 1

    # Get all non-superadmin users
    users = db.query(DBUser).filter(DBUser.is_superadmin == False).all()

    employees_list = []
    for user in users:
        # Get completion count
        completion_count = db.query(func.count(DBCourseCompletion.id)).filter(
            DBCourseCompletion.user_email == user.email
        ).scalar() or 0

        # Get quiz stats
        from models import QuizSubmission
        quiz_stats = db.query(
            func.count(QuizSubmission.id),
            func.avg(QuizSubmission.score)
        ).filter(
            QuizSubmission.user_email == user.email
        ).first()

        avg_score = round(float(quiz_stats[1]), 1) if quiz_stats and quiz_stats[1] else 0

        completion_percent = (completion_count / total_courses) * 100

        # Risk status
        if completion_percent < 30 or avg_score < 50:
            risk_status = "red"
        elif completion_percent < 60 or avg_score < 70:
            risk_status = "yellow"
        else:
            risk_status = "green"

        employees_list.append({
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "store": user.store or "Unassigned",
            "completion_percent": round(completion_percent, 1),
            "avg_score": avg_score,
            "risk_status": risk_status
        })

    return employees_list


@app.get("/analytics/employees/{user_email}")
async def get_employee_detail(user_email: str, db: Session = Depends(get_db)):
    """Detailed employee analytics with tabs - OPTIMIZED with DB queries"""
    from sqlalchemy import func

    # Get user from database
    user = db_ops.get_user_by_email(db, user_email)
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get user analytics in one call
    analytics = db_ops.get_user_analytics(db, user_email)

    # Get total courses
    from models import QuizSubmission
    total_courses = db.query(func.count(DBContent.id)).scalar() or 0

    # Get quiz stats
    quiz_count = analytics.get('quiz_count', 0)
    avg_quiz_score = analytics.get('avg_quiz_score', 0)

    # Calculate completion count
    completion_count = analytics.get('completion_count', 0)

    # Calculate skill scores (simulated based on completions)
    completion_pct = (completion_count / total_courses * 100) if total_courses > 0 else 0
    skill_scores = {
        "product_knowledge": min(100, 50 + completion_pct / 2),
        "hygiene": min(100, 60 + completion_pct / 3),
        "pos": min(100, 70 + completion_pct / 4),
        "customer_handling": min(100, 55 + completion_pct / 2.5),
        "speed_of_service": min(100, 50 + completion_pct / 2)
    }

    # Weak topics from quiz analysis
    weak_topics = ["Coffee Grinding", "Milk Texturing"] if quiz_count > 0 else []

    return {
        "training": {
            "assigned_courses": total_courses,
            "completed_courses": completion_count,
            "pending_courses": max(0, total_courses - completion_count),
            "learning_streak": min(completion_count, 7),  # Simplified streak
            "xp_earned": completion_count * 100
        },
        "quizzes": {
            "attempts": quiz_count,
            "avg_score": avg_quiz_score,
            "improvement_trend": "+12%",
            "weak_topics": weak_topics
        },
        "skills": skill_scores,
        "hygiene": {
            "sop_adherence": 94.0,
            "audit_ready": True,
            "violations": []
        },
        "ai_usage": {
            "questions_asked": 24,
            "confusion_topics": ["Espresso calibration", "Latte art"],
            "resolution_success": 89.0
        }
    }


@app.get("/analytics/training-effectiveness")
async def get_training_effectiveness():
    """Course-wise effectiveness analytics"""
    course_stats = []
    
    for course in content_store:
        course_id = course.get("id")
        completions = [c for c in course_completions if c.get("course_id") == course_id]
        
        # Quiz scores for this course
        course_quizzes = [s for s in quiz_submissions if course.get("title", "").lower() in s.get("quiz_id", "").lower()]
        avg_score = sum([q.get("score", 0) for q in course_quizzes]) / len(course_quizzes) if course_quizzes else 0
        
        total_users = len([u for u in users_store.values() if not u.get("is_superadmin")])
        completion_rate = (len(completions) / total_users * 100) if total_users > 0 else 0
        
        # Drop rate (simulated)
        drop_rate = max(0, 100 - completion_rate - 10)
        
        # Effectiveness rating
        if avg_score >= 80 and completion_rate >= 70:
            effectiveness = "Excellent"
        elif avg_score >= 60 and completion_rate >= 50:
            effectiveness = "Good"
        else:
            effectiveness = "Needs Improvement"
        
        course_stats.append({
            "course_id": course_id,
            "course_name": course.get("title"),
            "completion_percent": round(completion_rate, 1),
            "avg_score": round(avg_score, 1),
            "drop_rate": round(drop_rate, 1),
            "effectiveness": effectiveness
        })
    
    return course_stats


@app.get("/analytics/hygiene-compliance")
async def get_hygiene_compliance():
    """Hygiene and compliance analytics"""
    stores = {}
    
    for user_email, user in users_store.items():
        if user.get("is_superadmin"):
            continue
        
        store = user.get("store", "Unassigned")
        if store not in stores:
            stores[store] = {
                "store_name": store,
                "sop_compliance": 92.0,  # Simulated
                "audit_ready": True,
                "risk_level": "green"
            }
    
    # Summary
    fully_compliant = len([s for s in stores.values() if s["sop_compliance"] >= 90])
    needs_attention = len([s for s in stores.values() if 70 <= s["sop_compliance"] < 90])
    critical_risk = len([s for s in stores.values() if s["sop_compliance"] < 70])
    
    return {
        "summary": {
            "fully_compliant_stores": fully_compliant,
            "stores_needing_attention": needs_attention,
            "critical_risk_stores": critical_risk
        },
        "stores": list(stores.values())
    }


@app.get("/analytics/customer-impact")
async def get_customer_experience_impact():
    """Customer experience correlation with training"""
    
    # Generate correlation data
    training_levels = [20, 30, 40, 50, 60, 70, 80, 90, 100]
    satisfaction_correlation = [
        {"training_completion": level, "customer_satisfaction": 60 + (level * 0.35)}
        for level in training_levels
    ]
    
    complaint_correlation = [
        {"training_completion": level, "complaint_reduction": level * 0.4}
        for level in training_levels
    ]
    
    sales_correlation = [
        {"training_completion": level, "sales_uplift": level * 0.25}
        for level in training_levels
    ]
    
    return {
        "satisfaction_correlation": satisfaction_correlation,
        "complaint_correlation": complaint_correlation,
        "sales_correlation": sales_correlation,
        "summary": "Stores with higher hygiene training show 32% better customer ratings and 28% reduction in complaints."
    }


@app.get("/analytics/ai-insights")
async def get_ai_learning_insights():
    """AI-powered learning insights"""
    
    # Most asked topics (simulated from interactions)
    most_asked = [
        {"topic": "Espresso calibration", "count": 45},
        {"topic": "Milk texturing", "count": 38},
        {"topic": "Waffle batter ratio", "count": 32},
        {"topic": "POS troubleshooting", "count": 28},
        {"topic": "Hygiene protocols", "count": 25}
    ]
    
    # Confusion areas
    confusion_areas = [
        {"topic": "Coffee grinding settings", "confusion_score": 78},
        {"topic": "Latte art techniques", "confusion_score": 65},
        {"topic": "Equipment maintenance", "confusion_score": 58}
    ]
    
    # Topics needing retraining
    retraining_needed = [
        "Safety protocols",
        "Cash handling procedures",
        "Customer complaint resolution"
    ]
    
    return {
        "most_asked_topics": most_asked,
        "confusion_areas": confusion_areas,
        "topics_needing_retraining": retraining_needed,
        "ai_usage_frequency": "87% of employees use AI assistant weekly"
    }


@app.post("/analytics/generate-report")
async def generate_analytics_report(
    report_type: str = Form(...),
    date_from: str = Form(""),
    date_to: str = Form(""),
    store_filter: str = Form(""),
    role_filter: str = Form(""),
    format: str = Form("pdf")
):
    """Generate analytics report (PDF/Excel)"""
    
    report_data = {
        "report_type": report_type,
        "generated_at": datetime.now().isoformat(),
        "filters": {
            "date_from": date_from,
            "date_to": date_to,
            "store": store_filter,
            "role": role_filter
        },
        "data": []
    }
    
    if report_type == "employee_performance":
        employees = await get_employee_performance()
        report_data["data"] = employees
    elif report_type == "store_performance":
        stores = await get_store_performance()
        report_data["data"] = stores
    elif report_type == "hygiene_compliance":
        hygiene = await get_hygiene_compliance()
        report_data["data"] = hygiene["stores"]
    elif report_type == "training_effectiveness":
        training = await get_training_effectiveness()
        report_data["data"] = training
    
    # AI Summary generation
    try:
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        
        summary_prompt = f"""
        Analyze this {report_type} data and provide a concise executive summary:
        
        {json.dumps(report_data["data"][:5], indent=2)}
        
        Provide:
        1. Overall training health
        2. Weak areas needing attention
        3. Top 3 recommended actions
        
        Keep it professional and actionable. Max 150 words.
        """
        
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": summary_prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.5,
            max_tokens=200
        )
        
        ai_summary = completion.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"AI summary error: {e}")
        ai_summary = "Summary generation unavailable."
    
    report_data["ai_summary"] = ai_summary
    
    # Return report data (client will handle PDF/Excel formatting)
    return {
        "status": "success",
        "report": report_data,
        "download_url": f"/analytics/reports/{report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{format}"
    }


@app.get("/analytics/ai-executive-summary")
async def generate_ai_executive_summary():
    """Generate AI-powered executive summary"""
    
    # Gather key metrics
    dashboard = await get_analytics_dashboard()
    employees = await get_employee_performance()
    stores = await get_store_performance()
    
    try:
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        
        summary_data = {
            "avg_completion": dashboard["overview"]["avg_completion"],
            "avg_quiz_score": dashboard["overview"]["avg_quiz_score"],
            "compliance_score": dashboard["overview"]["compliance_score"],
            "high_risk_stores": dashboard["risk_summary"]["high_risk_stores"],
            "employees_at_risk": dashboard["risk_summary"]["employees_needing_retraining"]
        }
        
        prompt = f"""
        As an LMS analytics expert for Belgian Waffle QSR chain, analyze this data:
        
        {json.dumps(summary_data, indent=2)}
        
        Provide a concise executive summary covering:
        1. Overall Training Health (1-2 sentences)
        2. Critical Weak Areas (bullet points)
        3. Top 3 Recommended Actions (actionable, specific)
        
        Be professional and data-driven. Max 200 words.
        """
        
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.5,
            max_tokens=250
        )
        
        summary = completion.choices[0].message.content.strip()
        
        return {
            "status": "success",
            "summary": summary,
            "generated_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Executive summary error: {e}")
        return {
            "status": "error",
            "summary": "Executive summary generation unavailable. Please try again.",
            "generated_at": datetime.now().isoformat()
        }
# ==========================================
# LMS SUPPORT TICKET ENDPOINTS
# ==========================================

@app.get("/support/categories")
async def get_support_categories():
    """Get available support ticket categories"""
    return {"categories": SUPPORT_CATEGORIES}


@app.post("/support/create-ticket")
async def create_support_ticket(
    user_email: str = Form(...),
    user_name: str = Form("User"),
    user_role: str = Form("user"),  # user, manager, superadmin
    subject: str = Form(...),
    message: str = Form(...),
    category: str = Form("help"),  # bug, feature, help, complaint, feedback
    priority: str = Form("medium")  # low, medium, high, critical
):
    """Create a new support ticket to LMS team"""
    ticket_id = str(uuid.uuid4())[:8]
    
    ticket = {
        "id": ticket_id,
        "user_email": user_email,
        "user_name": user_name,
        "user_role": user_role,
        "subject": subject,
        "message": message,
        "category": category,
        "priority": priority,
        "status": "open",  # open, in_progress, resolved, closed
        "created_at": datetime.now().isoformat(),
        "responses": [],  # List of {responder, message, timestamp}
        "resolved_at": None
    }
    
    support_tickets.append(ticket)
    logger.info(f"Support ticket created: {ticket_id} by {user_email} - {subject}")
    
    return {
        "status": "success",
        "message": "Ticket submitted successfully! Our team will respond soon.",
        "ticket": ticket
    }


@app.get("/support/my-tickets/{user_email}")
async def get_user_support_tickets(user_email: str):
    """Get all support tickets for a specific user"""
    user_tickets = [t for t in support_tickets if t["user_email"] == user_email]
    # Sort by created_at descending
    user_tickets.sort(key=lambda x: x["created_at"], reverse=True)
    
    return {
        "tickets": user_tickets,
        "count": len(user_tickets),
        "open_count": len([t for t in user_tickets if t["status"] == "open"]),
        "resolved_count": len([t for t in user_tickets if t["status"] in ["resolved", "closed"]])
    }


@app.get("/support/all-tickets")
async def get_all_support_tickets():
    """Get all support tickets (for LMS team/super admin)"""
    tickets_sorted = sorted(support_tickets, key=lambda x: x["created_at"], reverse=True)
    
    return {
        "tickets": tickets_sorted,
        "stats": {
            "total": len(tickets_sorted),
            "open": len([t for t in tickets_sorted if t["status"] == "open"]),
            "in_progress": len([t for t in tickets_sorted if t["status"] == "in_progress"]),
            "resolved": len([t for t in tickets_sorted if t["status"] == "resolved"]),
            "by_category": {
                cat["id"]: len([t for t in tickets_sorted if t["category"] == cat["id"]])
                for cat in SUPPORT_CATEGORIES
            },
            "by_priority": {
                p: len([t for t in tickets_sorted if t["priority"] == p])
                for p in ["low", "medium", "high", "critical"]
            }
        }
    }


@app.post("/support/respond-ticket")
async def respond_to_support_ticket(
    ticket_id: str = Form(...),
    responder_email: str = Form(...),
    responder_name: str = Form("LMS Team"),
    response_message: str = Form(...),
    new_status: str = Form(None)  # Optional status update
):
    """Add a response to a support ticket (LMS team or admin)"""
    ticket = next((t for t in support_tickets if t["id"] == ticket_id), None)
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    response = {
        "responder_email": responder_email,
        "responder_name": responder_name,
        "message": response_message,
        "timestamp": datetime.now().isoformat()
    }
    
    ticket["responses"].append(response)
    
    if new_status:
        ticket["status"] = new_status
        if new_status in ["resolved", "closed"]:
            ticket["resolved_at"] = datetime.now().isoformat()
    
    logger.info(f"Support ticket {ticket_id} responded by {responder_email}")
    
    return {
        "status": "success",
        "message": "Response added successfully",
        "ticket": ticket
    }


@app.post("/support/update-status")
async def update_ticket_status(
    ticket_id: str = Form(...),
    new_status: str = Form(...)  # open, in_progress, resolved, closed
):
    """Update support ticket status"""
    ticket = next((t for t in support_tickets if t["id"] == ticket_id), None)
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    ticket["status"] = new_status
    if new_status in ["resolved", "closed"]:
        ticket["resolved_at"] = datetime.now().isoformat()
    
    return {"status": "success", "ticket": ticket}


# ==========================================
# PHASE 1: LEADERBOARD & GAMIFICATION ENDPOINTS
# ==========================================

@app.get("/leaderboard/global")
async def get_global_leaderboard(limit: int = 10):
    """Get company-wide XP leaderboard"""
    sorted_users = sorted(user_xp_scores.items(), key=lambda x: x[1], reverse=True)[:limit]
    
    leaderboard = []
    for rank, (email, xp) in enumerate(sorted_users, 1):
        user = next((u for u in users_store.values() if u["email"] == email), None)
        user_badge_list = [b for b in user_badges if b["user_email"] == email]
        
        leaderboard.append({
            "rank": rank,
            "email": email,
            "name": user["name"] if user else email.split("@")[0].title(),
            "xp": xp,
            "badges_count": len(user_badge_list),
            "avatar": user.get("avatar") if user else None,
            "store": user.get("store") if user else "Unknown"
        })
    
    return {
        "leaderboard": leaderboard,
        "total_users": len(user_xp_scores),
        "updated_at": datetime.now().isoformat()
    }


@app.get("/leaderboard/store/{store_id}")
async def get_store_leaderboard(store_id: str, limit: int = 10):
    """Get store-specific leaderboard"""
    # Filter users by store
    store_users = {email: xp for email, xp in user_xp_scores.items() 
                   if any(u["email"] == email and u.get("store") == store_id for u in users_store.values())}
    
    # If no store filtering, return all (demo mode)
    if not store_users:
        store_users = user_xp_scores
    
    sorted_users = sorted(store_users.items(), key=lambda x: x[1], reverse=True)[:limit]
    
    leaderboard = []
    for rank, (email, xp) in enumerate(sorted_users, 1):
        leaderboard.append({
            "rank": rank,
            "email": email,
            "name": email.split("@")[0].title(),
            "xp": xp
        })
    
    return {"store_id": store_id, "leaderboard": leaderboard}


@app.get("/badges")
async def get_all_badges():
    """Get all badge definitions"""
    return {"badges": badges}


@app.get("/user/{email}/badges")
async def get_user_badges(email: str):
    """Get badges earned by a specific user"""
    earned = [ub for ub in user_badges if ub["user_email"] == email]
    
    # Enrich with badge details
    earned_with_details = []
    for ub in earned:
        badge = next((b for b in badges if b["id"] == ub["badge_id"]), None)
        if badge:
            earned_with_details.append({
                **badge,
                "earned_at": ub["earned_at"]
            })
    
    return {
        "email": email,
        "badges": earned_with_details,
        "total_earned": len(earned),
        "total_available": len(badges)
    }


@app.post("/user/{email}/award-badge")
async def award_badge_to_user(email: str, badge_id: str = Form(...)):
    """Award a badge to a user"""
    # Check if badge exists
    badge = next((b for b in badges if b["id"] == badge_id), None)
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    
    # Check if already earned
    already_earned = any(ub["user_email"] == email and ub["badge_id"] == badge_id for ub in user_badges)
    if already_earned:
        return {"status": "already_earned", "message": "User already has this badge"}
    
    # Award badge
    user_badges.append({
        "user_email": email,
        "badge_id": badge_id,
        "earned_at": datetime.now().isoformat()
    })
    
    # Add XP reward
    if email in user_xp_scores:
        user_xp_scores[email] += badge["xp_reward"]
    else:
        user_xp_scores[email] = badge["xp_reward"]
    
    return {
        "status": "success",
        "message": f"Awarded '{badge['name']}' badge with {badge['xp_reward']} XP",
        "new_xp": user_xp_scores.get(email, 0)
    }


@app.get("/challenges")
async def get_active_challenges():
    """Get all active challenges"""
    active = [c for c in challenges if c.get("is_active", True)]
    return {"challenges": active}


@app.get("/challenges/{user_email}/progress")
async def get_user_challenge_progress(user_email: str):
    """Get challenge progress for a user"""
    user_progress = [cp for cp in challenge_progress if cp["user_email"] == user_email]
    
    enriched = []
    for cp in user_progress:
        challenge = next((c for c in challenges if c["id"] == cp["challenge_id"]), None)
        if challenge:
            enriched.append({
                **cp,
                "challenge": challenge,
                "progress_percent": (cp["progress"] / challenge["target"]) * 100
            })
    
    return {"email": user_email, "progress": enriched}


# ==========================================
# PHASE 1: COMPETENCY MATRIX ENDPOINTS
# ==========================================

@app.get("/competency/skills")
async def get_all_skills():
    """Get all skill definitions"""
    return {"skills": skills}


@app.get("/competency/matrix")
async def get_competency_matrix():
    """Get full competency matrix for all users"""
    matrix = []
    
    for email, skill_levels in user_skills.items():
        user = next((u for u in users_store.values() if u["email"] == email), None)
        
        # Calculate overall competency score
        total_score = sum(skill_levels.values())
        max_score = len(skill_levels) * 5
        overall = round((total_score / max_score) * 100) if max_score > 0 else 0
        
        # Find gaps (skills below 3)
        gaps = [s for s, level in skill_levels.items() if level < 3]
        
        matrix.append({
            "email": email,
            "name": user["name"] if user else email.split("@")[0].title(),
            "role": user.get("role", "Crew Member") if user else "Unknown",
            "store": user.get("store") if user else "Unknown",
            "skills": skill_levels,
            "overall_score": overall,
            "gaps_count": len(gaps),
            "gaps": gaps
        })
    
    # Sort by overall score descending
    matrix.sort(key=lambda x: x["overall_score"], reverse=True)
    
    return {
        "matrix": matrix,
        "skills": skills,
        "total_users": len(matrix),
        "avg_score": round(sum(m["overall_score"] for m in matrix) / len(matrix)) if matrix else 0
    }


@app.get("/competency/gaps")
async def get_skill_gaps_analysis():
    """Get company-wide skill gap analysis"""
    skill_averages = {}
    skill_below_threshold = {}
    
    for skill in skills:
        skill_id = skill["id"]
        levels = [user_skills.get(email, {}).get(skill_id, 0) for email in user_skills]
        
        avg_level = sum(levels) / len(levels) if levels else 0
        below_3_count = len([l for l in levels if l < 3])
        
        skill_averages[skill_id] = round(avg_level, 1)
        skill_below_threshold[skill_id] = below_3_count
    
    # Find top gaps (lowest average skills)
    gaps_sorted = sorted(skill_averages.items(), key=lambda x: x[1])[:5]
    
    top_gaps = []
    for skill_id, avg in gaps_sorted:
        skill = next((s for s in skills if s["id"] == skill_id), None)
        if skill:
            top_gaps.append({
                "skill": skill,
                "average_level": avg,
                "employees_below_3": skill_below_threshold.get(skill_id, 0)
            })
    
    return {
        "top_gaps": top_gaps,
        "skill_averages": skill_averages,
        "total_employees": len(user_skills)
    }


@app.get("/competency/user/{email}")
async def get_user_competency(email: str):
    """Get competency profile for a specific user"""
    if email not in user_skills:
        raise HTTPException(status_code=404, detail="User not found in competency system")
    
    skill_levels = user_skills[email]
    user = next((u for u in users if u["email"] == email), None)
    
    # Enrich skills with details
    enriched_skills = []
    for skill in skills:
        level = skill_levels.get(skill["id"], 0)
        enriched_skills.append({
            **skill,
            "level": level,
            "status": "expert" if level >= 4 else ("proficient" if level >= 3 else "needs_training")
        })
    
    # Calculate overall
    total = sum(skill_levels.values())
    max_score = len(skill_levels) * 5
    
    return {
        "email": email,
        "name": user["name"] if user else email,
        "skills": enriched_skills,
        "overall_score": round((total / max_score) * 100) if max_score > 0 else 0,
        "strengths": [s for s in enriched_skills if s["level"] >= 4],
        "gaps": [s for s in enriched_skills if s["level"] < 3]
    }


@app.put("/competency/user/{email}/skill/{skill_id}")
async def update_user_skill(email: str, skill_id: str, level: int = Form(...)):
    """Update a user's skill level"""
    if level < 1 or level > 5:
        raise HTTPException(status_code=400, detail="Level must be between 1 and 5")
    
    if email not in user_skills:
        user_skills[email] = {}
    
    user_skills[email][skill_id] = level
    
    return {"status": "success", "email": email, "skill_id": skill_id, "new_level": level}


# ==========================================
# PHASE 1: COMPLIANCE DASHBOARD ENDPOINTS
# ==========================================

@app.get("/compliance/requirements")
async def get_compliance_requirements():
    """Get all compliance requirements"""
    return {"requirements": compliance_requirements}


@app.get("/compliance/dashboard")
async def get_compliance_dashboard():
    """Get compliance overview statistics"""
    total_certs = len(user_compliance)
    valid = len([c for c in user_compliance if c["status"] == "valid"])
    expiring = len([c for c in user_compliance if c["status"] == "expiring_soon"])
    expired = len([c for c in user_compliance if c["status"] == "expired"])
    
    # Calculate overall compliance rate
    compliance_rate = round((valid / total_certs) * 100) if total_certs > 0 else 0
    
    # Store summary
    stores = list(store_compliance_scores.values())
    green_stores = len([s for s in stores if s["status"] == "green"])
    yellow_stores = len([s for s in stores if s["status"] == "yellow"])
    red_stores = len([s for s in stores if s["status"] == "red"])
    
    return {
        "overview": {
            "compliance_rate": compliance_rate,
            "total_certifications": total_certs,
            "valid": valid,
            "expiring_soon": expiring,
            "expired": expired
        },
        "stores": {
            "total": len(stores),
            "green": green_stores,
            "yellow": yellow_stores,
            "red": red_stores
        },
        "store_details": stores,
        "updated_at": datetime.now().isoformat()
    }


@app.get("/compliance/store/{store_id}")
async def get_store_compliance(store_id: str):
    """Get compliance status for a specific store"""
    store = store_compliance_scores.get(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    return {"store_id": store_id, **store}


@app.get("/compliance/expiring")
async def get_expiring_certifications(days: int = 30):
    """Get certifications expiring within X days"""
    from datetime import timedelta
    
    today = datetime.now().date()
    cutoff = today + timedelta(days=days)
    
    expiring = []
    for cert in user_compliance:
        try:
            expires = datetime.strptime(cert["expires_at"], "%Y-%m-%d").date()
            if today <= expires <= cutoff:
                req = next((r for r in compliance_requirements if r["id"] == cert["requirement_id"]), None)
                expiring.append({
                    **cert,
                    "requirement": req,
                    "days_remaining": (expires - today).days
                })
        except:
            continue
    
    # Sort by days remaining
    expiring.sort(key=lambda x: x.get("days_remaining", 999))
    
    return {
        "within_days": days,
        "count": len(expiring),
        "expiring": expiring
    }


@app.get("/compliance/user/{email}")
async def get_user_compliance(email: str):
    """Get compliance status for a specific user"""
    user_certs = [c for c in user_compliance if c["user_email"] == email]
    
    # Enrich with requirement details
    enriched = []
    for cert in user_certs:
        req = next((r for r in compliance_requirements if r["id"] == cert["requirement_id"]), None)
        if req:
            enriched.append({
                **cert,
                "requirement": req
            })
    
    # Check for missing mandatory requirements
    user_req_ids = {c["requirement_id"] for c in user_certs}
    mandatory = [r for r in compliance_requirements if r["is_mandatory"]]
    missing = [r for r in mandatory if r["id"] not in user_req_ids]
    
    return {
        "email": email,
        "certifications": enriched,
        "missing_mandatory": missing,
        "is_fully_compliant": len(missing) == 0 and all(c["status"] == "valid" for c in user_certs)
    }


@app.post("/compliance/certify")
async def certify_user(
    user_email: str = Form(...),
    requirement_id: str = Form(...),
    certificate_id: str = Form(None)
):
    """Mark a user as certified for a requirement"""
    req = next((r for r in compliance_requirements if r["id"] == requirement_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    
    today = datetime.now().date()
    expires = today + timedelta(days=req["validity_days"])
    
    # Remove old cert if exists
    global user_compliance
    user_compliance = [c for c in user_compliance if not (c["user_email"] == user_email and c["requirement_id"] == requirement_id)]
    
    # Add new cert
    new_cert = {
        "user_email": user_email,
        "requirement_id": requirement_id,
        "earned_at": today.isoformat(),
        "expires_at": expires.isoformat(),
        "status": "valid",
        "certificate_id": certificate_id or f"{requirement_id.upper()}-{datetime.now().strftime('%Y%m%d%H%M')}"
    }
    user_compliance.append(new_cert)
    
    return {"status": "success", "certification": new_cert}


# ==========================================
# PHASE 2: TRAINING CAMPAIGNS SYSTEM
# ==========================================

# Campaign data store
campaigns: List[dict] = [
    {
        "id": "camp1",
        "title": "Summer Menu Launch",
        "description": "Training campaign for new summer menu items including chocolate waffles and iced coffee specials",
        "target_audience": {"roles": ["Crew Member", "Senior Crew"], "stores": ["all"]},
        "courses": ["summer-menu-101", "iced-coffee-basics"],
        "xp_reward": 200,
        "start_date": "2024-01-20",
        "end_date": "2024-02-15",
        "is_active": True,
        "created_by": "admin@example.com",
        "created_at": "2024-01-15T10:00:00"
    },
    {
        "id": "camp2",
        "title": "Hygiene Refresh 2024",
        "description": "Annual hygiene training refresh for all staff",
        "target_audience": {"roles": ["all"], "stores": ["all"]},
        "courses": ["hygiene-fundamentals", "food-safety-advanced"],
        "xp_reward": 150,
        "start_date": "2024-01-01",
        "end_date": "2024-01-31",
        "is_active": True,
        "created_by": "admin@example.com",
        "created_at": "2023-12-28T14:00:00"
    }
]

# Campaign progress tracking
campaign_progress: List[dict] = [
    {"user_email": "user@example.com", "campaign_id": "camp1", "courses_completed": 1, "total_courses": 2, "completed": False},
    {"user_email": "sarah@store.com", "campaign_id": "camp1", "courses_completed": 2, "total_courses": 2, "completed": True, "completed_at": "2024-01-25"},
]


@app.get("/campaigns")
async def get_all_campaigns():
    """Get all training campaigns"""
    active = [c for c in campaigns if c.get("is_active", True)]
    past = [c for c in campaigns if not c.get("is_active", True)]
    
    return {
        "active": active,
        "past": past,
        "total": len(campaigns)
    }


@app.get("/campaigns/{campaign_id}")
async def get_campaign_details(campaign_id: str):
    """Get campaign details with progress"""
    campaign = next((c for c in campaigns if c["id"] == campaign_id), None)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    progress_list = [p for p in campaign_progress if p["campaign_id"] == campaign_id]
    completed_count = len([p for p in progress_list if p.get("completed")])
    
    return {
        **campaign,
        "progress": {
            "total_enrolled": len(progress_list),
            "completed": completed_count,
            "completion_rate": round((completed_count / len(progress_list)) * 100) if progress_list else 0
        }
    }


@app.post("/campaigns")
async def create_campaign(
    title: str = Form(...),
    description: str = Form(...),
    target_roles: str = Form("all"),
    target_stores: str = Form("all"),
    start_date: str = Form(...),
    end_date: str = Form(...),
    xp_reward: int = Form(100)
):
    """Create a new training campaign"""
    new_campaign = {
        "id": f"camp{len(campaigns) + 1}",
        "title": title,
        "description": description,
        "target_audience": {
            "roles": target_roles.split(",") if target_roles != "all" else ["all"],
            "stores": target_stores.split(",") if target_stores != "all" else ["all"]
        },
        "courses": [],
        "xp_reward": xp_reward,
        "start_date": start_date,
        "end_date": end_date,
        "is_active": True,
        "created_by": "admin",
        "created_at": datetime.now().isoformat()
    }
    campaigns.append(new_campaign)
    
    return {"status": "success", "campaign": new_campaign}


# ==========================================
# PHASE 2: AUDIT LOGS SYSTEM
# ==========================================

# Audit log data store
audit_logs: List[dict] = []

ACTION_TYPES = {
    "CREATE_USER": {"icon": "account-plus", "color": "#10B981"},
    "DELETE_USER": {"icon": "account-minus", "color": "#EF4444"},
    "UPLOAD_CONTENT": {"icon": "cloud-upload", "color": "#3B82F6"},
    "DELETE_CONTENT": {"icon": "delete", "color": "#EF4444"},
    "ASSIGN_QUIZ": {"icon": "clipboard-check", "color": "#F59E0B"},
    "UPDATE_COMPLIANCE": {"icon": "shield-check", "color": "#10B981"},
    "CREATE_CAMPAIGN": {"icon": "bullhorn", "color": "#8B5CF6"},
    "SEND_NOTIFICATION": {"icon": "bell", "color": "#EC4899"},
    "UPDATE_ACCESS": {"icon": "lock", "color": "#6366F1"},
}


# DUPLICATE ENDPOINT - Removed to avoid conflicts, using the migrated version at line ~777
# @app.get("/audit-logs")
# async def get_audit_logs(
#     admin_email: str = None,
#     action_type: str = None,
#     limit: int = 50
# ):
#     """Get audit logs with optional filters"""
#     filtered = audit_logs
#
#     if admin_email:
#         filtered = [log for log in filtered if log["admin_email"] == admin_email]
#     if action_type:
#         filtered = [log for log in filtered if log["action"] == action_type]
#
#     # Sort by timestamp descending
#     filtered = sorted(filtered, key=lambda x: x["timestamp"], reverse=True)[:limit]
#
#     return {
#         "logs": filtered,
#         "total": len(filtered),
#         "action_types": list(ACTION_TYPES.keys())
#     }


@app.post("/audit-logs")
async def add_audit_log(
    admin_email: str = Form(...),
    action: str = Form(...),
    target: str = Form(...),
    details: str = Form(""),
    db: Session = Depends(get_db)
):
    """Add new audit log entry"""
    # Use the log_action helper which now saves to DB
    log_action(action, target, details, admin_email)

    # Return the last added log
    if audit_logs:
        return {"status": "success", "log": audit_logs[0]}

    return {"status": "success"}


# ==========================================
# PHASE 2: CONTENT LIBRARY ENDPOINTS
# ==========================================

@app.get("/content/library")
async def get_content_library(
    bucket: str = None,
    content_type: str = None,
    search: str = None
):
    """Get all content with filters"""
    filtered = content_store
    
    if bucket:
        filtered = [c for c in filtered if c.get("bucket") == bucket]
    if content_type:
        # Filter by video, quiz, document, etc.
        if content_type == "video":
            filtered = [c for c in filtered if c.get("video_url")]
        elif content_type == "quiz":
            filtered = [c for c in filtered if c.get("quiz") or c.get("manual_quiz")]
    if search:
        search_lower = search.lower()
        filtered = [c for c in filtered if search_lower in c.get("title", "").lower() or search_lower in c.get("description", "").lower()]
    
    # Add stats to each content
    enriched = []
    for content in filtered:
        views = len([cc for cc in course_completions if cc.get("course_id") == content.get("id")])
        enriched.append({
            **content,
            "stats": {
                "views": views,
                "completions": views,
                "avg_score": 85  # Placeholder
            }
        })
    
    return {
        "content": enriched,
        "total": len(enriched),
        "buckets": list({c.get("bucket") for c in content_store if c.get("bucket")})
    }


@app.post("/content/{content_id}/duplicate")
async def duplicate_content(content_id: str):
    """Duplicate a content item"""
    original = next((c for c in content_store if c.get("id") == content_id), None)
    if not original:
        raise HTTPException(status_code=404, detail="Content not found")
    
    duplicate = {
        **original,
        "id": f"{content_id}_copy_{datetime.now().strftime('%Y%m%d%H%M')}",
        "title": f"{original.get('title', 'Content')} (Copy)",
        "timestamp": datetime.now().isoformat()
    }
    content_store.append(duplicate)
    
    return {"status": "success", "content": duplicate}


# ==========================================
# PHASE 2: CERTIFICATION MANAGER ENDPOINTS
# ==========================================

@app.get("/certifications/types")
async def get_certification_types():
    """Get all certification/requirement types with stats"""
    enriched = []
    for req in compliance_requirements:
        # Count users with this cert
        valid_count = len([c for c in user_compliance if c["requirement_id"] == req["id"] and c["status"] == "valid"])
        expiring_count = len([c for c in user_compliance if c["requirement_id"] == req["id"] and c["status"] == "expiring_soon"])
        expired_count = len([c for c in user_compliance if c["requirement_id"] == req["id"] and c["status"] == "expired"])
        
        enriched.append({
            **req,
            "stats": {
                "valid": valid_count,
                "expiring": expiring_count,
                "expired": expired_count,
                "total": valid_count + expiring_count + expired_count
            }
        })
    
    return {"certifications": enriched}


@app.post("/certifications")
async def create_certification_type(
    name: str = Form(...),
    cert_type: str = Form("certification"),
    validity_days: int = Form(365),
    is_mandatory: bool = Form(False),
    icon: str = Form("certificate"),
    color: str = Form("#10B981")
):
    """Create a new certification type"""
    cert_id = name.lower().replace(" ", "_")
    
    # Check if already exists
    if any(r["id"] == cert_id for r in compliance_requirements):
        raise HTTPException(status_code=400, detail="Certification type already exists")
    
    new_cert = {
        "id": cert_id,
        "name": name,
        "type": cert_type,
        "validity_days": validity_days,
        "is_mandatory": is_mandatory,
        "icon": icon,
        "color": color
    }
    compliance_requirements.append(new_cert)
    
    return {"status": "success", "certification": new_cert}


@app.delete("/certifications/{cert_id}")
async def delete_certification_type(cert_id: str):
    """Delete a certification type"""
    global compliance_requirements
    original_len = len(compliance_requirements)
    compliance_requirements = [r for r in compliance_requirements if r["id"] != cert_id]
    
    if len(compliance_requirements) == original_len:
        raise HTTPException(status_code=404, detail="Certification type not found")
    
    return {"status": "success", "message": "Certification type deleted"}


# ==========================================
# SCHEDULED EXAMS SYSTEM ENDPOINTS
# ==========================================

@app.get("/scheduled-exams")
async def get_scheduled_exams(db: Session = Depends(get_db)):
    """Get all scheduled exams (admin view)"""
    try:
        db_exams = db_ops.get_all_scheduled_exams(db)
        exams_list = [db_ops.model_to_dict(e) for e in db_exams]
        return exams_list if exams_list else scheduled_exams
    except Exception as e:
        logger.error(f"Error fetching scheduled exams from DB: {e}")
        return scheduled_exams

@app.get("/scheduled-exams/user/{user_email}")
async def get_user_scheduled_exams(user_email: str, db: Session = Depends(get_db)):
    """Get scheduled exams assigned to a specific user"""
    user_exams = []
    user_email_lower = user_email.lower().strip()

    logger.info(f"[ScheduledExams] Fetching exams for user: {user_email}")

    # Try database first
    try:
        db_exams = db_ops.get_all_scheduled_exams(db)
        logger.info(f"[ScheduledExams] Total scheduled exams from DB: {len(db_exams)}")

        for exam in db_exams:
            assigned_users = exam.assigned_users if exam.assigned_users else []
            # Case-insensitive email matching
            assigned_users_lower = [u.lower().strip() if isinstance(u, str) else "" for u in assigned_users]

            if user_email_lower in assigned_users_lower:
                # Get attendance from DB
                attendance_db = db_ops.get_user_exam_attendance(db, exam.id, user_email)
                attendance_dict = db_ops.model_to_dict(attendance_db) if attendance_db else None

                exam_dict = db_ops.model_to_dict(exam)
                exam_dict["attendance"] = attendance_dict
                exam_dict["can_start"] = attendance_dict.get("marked_present", False) if attendance_dict else False
                exam_dict["has_completed"] = attendance_dict.get("completed", False) if attendance_dict else False
                user_exams.append(exam_dict)
                logger.info(f"[ScheduledExams] Found exam '{exam.title}' for user {user_email}")

        if user_exams:
            logger.info(f"[ScheduledExams] Returning {len(user_exams)} exams for {user_email}")
            return user_exams
    except Exception as e:
        logger.error(f"Error fetching user scheduled exams from DB: {e}")

    # Fallback to in-memory
    logger.info(f"[ScheduledExams] Total scheduled exams: {len(scheduled_exams)}")

    for exam in scheduled_exams:
        assigned_users = exam.get("assigned_users", [])
        # Case-insensitive email matching
        assigned_users_lower = [u.lower().strip() if isinstance(u, str) else "" for u in assigned_users]

        if user_email_lower in assigned_users_lower:
            # Find the original email for attendance lookup
            original_email = user_email
            for i, lower_email in enumerate(assigned_users_lower):
                if lower_email == user_email_lower:
                    original_email = assigned_users[i]
                    break

            # Check if user's attendance record exists (case-insensitive)
            attendance = next((a for a in scheduled_exam_attendance
                              if a["exam_id"] == exam["id"] and
                              a["user_email"].lower().strip() == user_email_lower), None)
            exam_copy = exam.copy()
            exam_copy["attendance"] = attendance
            exam_copy["can_start"] = attendance.get("marked_present", False) if attendance else False
            exam_copy["has_completed"] = attendance.get("completed", False) if attendance else False
            user_exams.append(exam_copy)
            logger.info(f"[ScheduledExams] Found exam '{exam.get('title')}' for user {user_email}")

    logger.info(f"[ScheduledExams] Returning {len(user_exams)} exams for {user_email}")
    return user_exams

@app.get("/scheduled-exams/{exam_id}")
async def get_scheduled_exam(exam_id: str, db: Session = Depends(get_db)):
    """Get a specific scheduled exam"""
    try:
        db_exam = db_ops.get_scheduled_exam_by_id(db, exam_id)
        if db_exam:
            return db_ops.model_to_dict(db_exam)
    except Exception as e:
        logger.error(f"Error fetching scheduled exam from DB: {e}")

    # Fallback to in-memory
    for exam in scheduled_exams:
        if exam.get("id") == exam_id:
            return exam
    raise HTTPException(status_code=404, detail="Scheduled exam not found")

@app.post("/scheduled-exams")
async def create_scheduled_exam(
    title: str = Form(...),
    description: str = Form(""),
    exam_date: str = Form(...),  # YYYY-MM-DD
    exam_time: str = Form(...),  # HH:MM
    location: str = Form(...),
    shift: str = Form("Morning"),
    supervisor_email: str = Form(...),
    supervisor_name: str = Form(...),
    assigned_users: str = Form(...),  # JSON array of user emails
    questions: str = Form(...),  # JSON array of questions
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    created_by: str = Form("Admin"),
    db: Session = Depends(get_db)
):
    """Create a new scheduled exam"""
    import json

    try:
        assigned_list = json.loads(assigned_users)
        questions_list = json.loads(questions)
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON format for users or questions")

    exam_id = str(uuid.uuid4())

    new_exam = {
        "id": exam_id,
        "title": title,
        "description": description,
        "exam_date": exam_date,
        "exam_time": exam_time,
        "location": location,
        "shift": shift,
        "supervisor_email": supervisor_email,
        "supervisor_name": supervisor_name,
        "assigned_users": assigned_list,
        "questions": questions_list,
        "time_limit_minutes": time_limit_minutes,
        "passing_score": passing_score,
        "created_by": created_by,
        "created_at": datetime.now(),
        "status": "scheduled"  # scheduled, ongoing, completed, cancelled
    }

    # Save to database
    try:
        db_ops.create_scheduled_exam(db, new_exam)
        logger.info(f"Scheduled exam saved to DB: {title}")
    except Exception as e:
        logger.error(f"Error saving scheduled exam to DB: {e}")
        db.rollback()

    # Convert created_at for in-memory and response
    new_exam["created_at"] = new_exam["created_at"].isoformat()

    # Also keep in memory for backward compatibility
    scheduled_exams.insert(0, new_exam)
    
    # Create attendance records for all assigned users
    for user_email in assigned_list:
        user_data = users_store.get(user_email, {})
        attendance_record = {
            "id": str(uuid.uuid4()),
            "exam_id": exam_id,
            "user_email": user_email,
            "user_name": user_data.get("name", user_email),
            "marked_present": False,
            "marked_by": None,
            "marked_at": None,
            "started_exam": False,
            "start_time": None,
            "completed": False,
            "submission_id": None
        }

        # Save to database
        try:
            db_ops.create_exam_attendance(db, attendance_record)
        except Exception as e:
            logger.error(f"Error saving attendance record to DB: {e}")
            db.rollback()

        # Also keep in memory for backward compatibility
        scheduled_exam_attendance.append(attendance_record)
    
    # Send notification to all assigned users
    notification = {
        "id": str(uuid.uuid4()),
        "title": f"📝 Scheduled Exam: {title}",
        "message": f"You have been assigned to an exam on {exam_date} at {exam_time}. Location: {location}, Shift: {shift}. Supervisor: {supervisor_name}. Please report on time.",
        "type": "exam_scheduled",
        "exam_id": exam_id,
        "exam_date": exam_date,
        "exam_time": exam_time,
        "location": location,
        "shift": shift,
        "created_at": datetime.now().isoformat(),
        "target_users": assigned_list,
        "is_persistent": True
    }
    notification_store.insert(0, notification)
    
    # Broadcast via WebSocket
    await manager.broadcast({
        "type": "EXAM_SCHEDULED",
        "data": new_exam,
        "notification": notification
    })
    
    # Audit log
    log_action("SCHEDULE_EXAM", title, f"Scheduled exam for {len(assigned_list)} users on {exam_date}")
    
    logger.info(f"Scheduled Exam Created: {title} on {exam_date} for {len(assigned_list)} users")
    
    return {"status": "success", "exam": new_exam}

@app.get("/scheduled-exams/{exam_id}/attendance")
async def get_exam_attendance(exam_id: str, db: Session = Depends(get_db)):
    """Get attendance list for a scheduled exam"""
    try:
        db_attendance = db_ops.get_exam_attendance(db, exam_id)
        attendance_list = [db_ops.model_to_dict(a) for a in db_attendance]
        return attendance_list if attendance_list else [a for a in scheduled_exam_attendance if a["exam_id"] == exam_id]
    except Exception as e:
        logger.error(f"Error fetching exam attendance from DB: {e}")
        return [a for a in scheduled_exam_attendance if a["exam_id"] == exam_id]

@app.post("/scheduled-exams/{exam_id}/mark-present")
async def mark_user_present(
    exam_id: str,
    user_email: str = Form(...),
    marked_by: str = Form(...),
    db: Session = Depends(get_db)
):
    """Mark a user as present for the exam (supervisor action)"""
    # Try database first
    try:
        db_attendance = db_ops.get_user_exam_attendance(db, exam_id, user_email)
        if db_attendance:
            db_ops.update_exam_attendance(db, db_attendance.id, {
                "marked_present": True,
                "marked_by": marked_by,
                "marked_at": datetime.now()
            })
            attendance = db_ops.model_to_dict(db_attendance)
            attendance["marked_present"] = True
            attendance["marked_by"] = marked_by
            attendance["marked_at"] = datetime.now().isoformat()

            # Update in-memory as well
            for mem_attendance in scheduled_exam_attendance:
                if mem_attendance["exam_id"] == exam_id and mem_attendance["user_email"] == user_email:
                    mem_attendance["marked_present"] = True
                    mem_attendance["marked_by"] = marked_by
                    mem_attendance["marked_at"] = attendance["marked_at"]
                    break

            # Notify the user that they can start the exam
            await manager.broadcast({
                "type": "EXAM_START_ENABLED",
                "exam_id": exam_id,
                "user_email": user_email
            })

            logger.info(f"User {user_email} marked present for exam {exam_id} by {marked_by}")
            return {"status": "success", "attendance": attendance}
    except Exception as e:
        logger.error(f"Error marking user present in DB: {e}")
        db.rollback()

    # Fallback to in-memory
    for attendance in scheduled_exam_attendance:
        if attendance["exam_id"] == exam_id and attendance["user_email"] == user_email:
            attendance["marked_present"] = True
            attendance["marked_by"] = marked_by
            attendance["marked_at"] = datetime.now().isoformat()

            # Notify the user that they can start the exam
            await manager.broadcast({
                "type": "EXAM_START_ENABLED",
                "exam_id": exam_id,
                "user_email": user_email
            })

            logger.info(f"User {user_email} marked present for exam {exam_id} by {marked_by}")
            return {"status": "success", "attendance": attendance}

    raise HTTPException(status_code=404, detail="Attendance record not found")

@app.post("/scheduled-exams/{exam_id}/mark-absent")
async def mark_user_absent(
    exam_id: str,
    user_email: str = Form(...),
    marked_by: str = Form(...),
    db: Session = Depends(get_db)
):
    """Mark a user as absent for the exam"""
    # Try database first
    try:
        db_attendance = db_ops.get_user_exam_attendance(db, exam_id, user_email)
        if db_attendance:
            db_ops.update_exam_attendance(db, db_attendance.id, {
                "marked_present": False,
                "marked_by": marked_by,
                "marked_at": datetime.now()
            })
            attendance = db_ops.model_to_dict(db_attendance)
            attendance["marked_present"] = False
            attendance["marked_by"] = marked_by
            attendance["marked_at"] = datetime.now().isoformat()

            # Update in-memory as well
            for mem_attendance in scheduled_exam_attendance:
                if mem_attendance["exam_id"] == exam_id and mem_attendance["user_email"] == user_email:
                    mem_attendance["marked_present"] = False
                    mem_attendance["marked_by"] = marked_by
                    mem_attendance["marked_at"] = attendance["marked_at"]
                    break

            logger.info(f"User {user_email} marked absent for exam {exam_id} by {marked_by}")
            return {"status": "success", "attendance": attendance}
    except Exception as e:
        logger.error(f"Error marking user absent in DB: {e}")
        db.rollback()

    # Fallback to in-memory
    for attendance in scheduled_exam_attendance:
        if attendance["exam_id"] == exam_id and attendance["user_email"] == user_email:
            attendance["marked_present"] = False
            attendance["marked_by"] = marked_by
            attendance["marked_at"] = datetime.now().isoformat()

            logger.info(f"User {user_email} marked absent for exam {exam_id} by {marked_by}")
            return {"status": "success", "attendance": attendance}

    raise HTTPException(status_code=404, detail="Attendance record not found")

@app.post("/scheduled-exams/{exam_id}/start")
async def start_scheduled_exam(
    exam_id: str,
    user_email: str = Form(...),
    db: Session = Depends(get_db)
):
    """User starts the scheduled exam (after being marked present)"""
    # Try database first
    attendance = None
    exam = None

    try:
        db_attendance = db_ops.get_user_exam_attendance(db, exam_id, user_email)
        if db_attendance:
            attendance = db_ops.model_to_dict(db_attendance)
            db_exam = db_ops.get_scheduled_exam_by_id(db, exam_id)
            if db_exam:
                exam = db_ops.model_to_dict(db_exam)
    except Exception as e:
        logger.error(f"Error fetching attendance/exam from DB: {e}")

    # Fallback to in-memory
    if not attendance:
        attendance = next((a for a in scheduled_exam_attendance
                          if a["exam_id"] == exam_id and a["user_email"] == user_email), None)

    if not exam:
        exam = next((e for e in scheduled_exams if e["id"] == exam_id), None)

    if not attendance:
        raise HTTPException(status_code=404, detail="You are not assigned to this exam")

    if not attendance["marked_present"]:
        raise HTTPException(status_code=403, detail="You must be marked present by supervisor to start the exam")

    if attendance["completed"]:
        raise HTTPException(status_code=400, detail="You have already completed this exam")

    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Mark as started
    start_time_iso = datetime.now().isoformat()

    # Update database
    try:
        db_attendance = db_ops.get_user_exam_attendance(db, exam_id, user_email)
        if db_attendance:
            db_ops.update_exam_attendance(db, db_attendance.id, {
                "started_exam": True,
                "start_time": datetime.now()
            })
    except Exception as e:
        logger.error(f"Error updating exam start in DB: {e}")
        db.rollback()

    # Update in-memory
    for mem_attendance in scheduled_exam_attendance:
        if mem_attendance["exam_id"] == exam_id and mem_attendance["user_email"] == user_email:
            mem_attendance["started_exam"] = True
            mem_attendance["start_time"] = start_time_iso
            break

    logger.info(f"User {user_email} started exam {exam_id}")

    return {
        "status": "success",
        "exam": {
            "id": exam["id"],
            "title": exam["title"],
            "description": exam["description"],
            "questions": exam["questions"],
            "time_limit_minutes": exam["time_limit_minutes"],
            "passing_score": exam["passing_score"]
        },
        "start_time": start_time_iso
    }

@app.post("/scheduled-exams/{exam_id}/submit")
async def submit_scheduled_exam(
    exam_id: str,
    user_email: str = Form(...),
    user_name: str = Form(...),
    answers: str = Form(...),  # JSON array
    time_taken_seconds: int = Form(...),
    violations: int = Form(0),
    breach_log: str = Form("[]")
):
    """Submit a scheduled exam"""
    import json
    
    # Get exam
    exam = next((e for e in scheduled_exams if e["id"] == exam_id), None)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    # Parse answers
    try:
        answers_list = json.loads(answers)
        breach_log_list = json.loads(breach_log)
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    
    # Calculate score
    correct_count = 0
    total = len(exam["questions"])
    
    for i, ans in enumerate(answers_list):
        if i < total and ans == exam["questions"][i].get("correctIndex"):
            correct_count += 1
    
    score_percent = (correct_count / total * 100) if total > 0 else 0
    passed = score_percent >= exam.get("passing_score", 70)
    
    # Create submission
    submission = {
        "id": str(uuid.uuid4()),
        "exam_id": exam_id,
        "exam_title": exam["title"],
        "user_email": user_email,
        "user_name": user_name,
        "answers": answers_list,
        "correct_count": correct_count,
        "total_questions": total,
        "score_percent": round(score_percent, 1),
        "passed": passed,
        "time_taken_seconds": time_taken_seconds,
        "violations": violations,
        "breach_log": breach_log_list,
        "submitted_at": datetime.now().isoformat()
    }
    
    scheduled_exam_submissions.insert(0, submission)
    
    # Update attendance record
    for attendance in scheduled_exam_attendance:
        if attendance["exam_id"] == exam_id and attendance["user_email"] == user_email:
            attendance["completed"] = True
            attendance["submission_id"] = submission["id"]
            break
    
    logger.info(f"Scheduled Exam Submitted: {user_name} scored {score_percent}% on {exam['title']}")
    
    return {
        "status": "success",
        "submission": submission,
        "result": {
            "score": round(score_percent, 1),
            "correct": correct_count,
            "total": total,
            "passed": passed,
            "passing_score": exam.get("passing_score", 70)
        }
    }

@app.get("/scheduled-exams/{exam_id}/submissions")
async def get_exam_submissions(exam_id: str):
    """Get all submissions for a scheduled exam"""
    return [s for s in scheduled_exam_submissions if s["exam_id"] == exam_id]

@app.post("/scheduled-exams/{exam_id}/generate-questions")
async def generate_exam_questions(
    exam_id: str,
    topic: str = Form(...),
    num_questions: int = Form(10),
    difficulty: str = Form("Medium")
):
    """Generate questions for a scheduled exam using AI"""
    from groq import Groq
    
    try:
        prompt = f"""Generate exactly {num_questions} multiple-choice quiz questions about: {topic}
        Difficulty level: {difficulty}
        
IMPORTANT: Return ONLY a valid JSON array with this exact structure:
[
    {{
        "question": "Clear question text?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 0
    }}
]

Requirements:
- Each question should test understanding
- Options should be plausible but only one correct
- correctIndex is 0-3 indicating the correct option
- Return ONLY the JSON array, no markdown"""

        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an expert exam creator. Return only valid JSON arrays."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=4000
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Extract JSON array
        import re
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            response_text = json_match.group()
        
        questions_list = json.loads(response_text)
        
        logger.info(f"Generated {len(questions_list)} questions for topic: {topic}")
        
        return {"status": "success", "questions": questions_list}
        
    except Exception as e:
        logger.error(f"AI question generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate questions: {str(e)}")

@app.delete("/scheduled-exams/{exam_id}")
async def delete_scheduled_exam(exam_id: str, db: Session = Depends(get_db)):
    """Delete a scheduled exam"""
    global scheduled_exams, scheduled_exam_attendance

    # Delete from database
    try:
        # Delete attendance records first (foreign key constraint)
        db_attendance_list = db_ops.get_exam_attendance(db, exam_id)
        for attendance in db_attendance_list:
            db.delete(attendance)

        # Delete exam
        db_deleted = db_ops.delete_scheduled_exam(db, exam_id)
        if db_deleted:
            logger.info(f"Scheduled Exam Deleted from DB: {exam_id}")
    except Exception as e:
        logger.error(f"Error deleting scheduled exam from DB: {e}")
        db.rollback()

    # Delete from in-memory
    original_len = len(scheduled_exams)
    scheduled_exams = [e for e in scheduled_exams if e["id"] != exam_id]

    if len(scheduled_exams) == original_len:
        raise HTTPException(status_code=404, detail="Scheduled exam not found")

    # Remove attendance records
    scheduled_exam_attendance = [a for a in scheduled_exam_attendance if a["exam_id"] != exam_id]

    logger.info(f"Scheduled Exam Deleted: {exam_id}")
    return {"status": "success", "message": "Scheduled exam deleted"}


@app.get("/scheduled-exams/{exam_id}/report")
async def get_exam_report(exam_id: str):
    """Get detailed report for a scheduled exam (admin view)"""
    # Get exam
    exam = next((e for e in scheduled_exams if e["id"] == exam_id), None)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    # Get all attendance records for this exam
    attendance_list = [a for a in scheduled_exam_attendance if a["exam_id"] == exam_id]
    
    # Get all submissions for this exam
    submissions = [s for s in scheduled_exam_submissions if s["exam_id"] == exam_id]
    
    # Calculate statistics
    total_assigned = len(attendance_list)
    marked_present = len([a for a in attendance_list if a.get("marked_present")])
    marked_absent = len([a for a in attendance_list if a.get("marked_by") and not a.get("marked_present")])
    pending_marking = total_assigned - marked_present - marked_absent
    
    completed = len([a for a in attendance_list if a.get("completed")])
    started_not_finished = len([a for a in attendance_list if a.get("started_exam") and not a.get("completed")])
    
    # Score statistics
    scores = [s["score_percent"] for s in submissions]
    avg_score = sum(scores) / len(scores) if scores else 0
    max_score = max(scores) if scores else 0
    min_score = min(scores) if scores else 0
    passed_count = len([s for s in submissions if s.get("passed")])
    failed_count = len(submissions) - passed_count
    
    # Determine exam status
    all_marked = pending_marking == 0
    all_present_completed = all(
        a.get("completed") for a in attendance_list if a.get("marked_present")
    ) if marked_present > 0 else False
    
    exam_status = exam.get("status", "scheduled")
    if all_marked and all_present_completed and marked_present > 0:
        exam_status = "completed"
        # Update exam status in the list
        for e in scheduled_exams:
            if e["id"] == exam_id:
                e["status"] = "completed"
                break
    elif completed > 0 or started_not_finished > 0:
        exam_status = "ongoing"
    
    # Build detailed attendee report
    attendee_reports = []
    for att in attendance_list:
        submission = next((s for s in submissions if s["user_email"] == att["user_email"]), None)
        attendee_reports.append({
            "user_email": att["user_email"],
            "user_name": att.get("user_name", att["user_email"]),
            "marked_present": att.get("marked_present", False),
            "marked_by": att.get("marked_by"),
            "marked_at": att.get("marked_at"),
            "started_exam": att.get("started_exam", False),
            "start_time": att.get("start_time"),
            "completed": att.get("completed", False),
            "submission": submission
        })
    
    return {
        "exam": exam,
        "status": exam_status,
        "statistics": {
            "total_assigned": total_assigned,
            "marked_present": marked_present,
            "marked_absent": marked_absent,
            "pending_marking": pending_marking,
            "started": completed + started_not_finished,
            "completed": completed,
            "in_progress": started_not_finished,
            "avg_score": round(avg_score, 1),
            "max_score": max_score,
            "min_score": min_score,
            "passed": passed_count,
            "failed": failed_count,
            "pass_rate": round((passed_count / len(submissions) * 100) if submissions else 0, 1)
        },
        "attendees": attendee_reports,
        "submissions": submissions
    }


@app.get("/scheduled-exams/all/with-stats")
async def get_all_exams_with_stats():
    """Get all scheduled exams with basic stats for admin list view"""
    result = []
    for exam in scheduled_exams:
        exam_id = exam["id"]
        attendance_list = [a for a in scheduled_exam_attendance if a["exam_id"] == exam_id]
        submissions = [s for s in scheduled_exam_submissions if s["exam_id"] == exam_id]
        
        total_assigned = len(attendance_list)
        marked_present = len([a for a in attendance_list if a.get("marked_present")])
        completed = len([a for a in attendance_list if a.get("completed")])
        
        # Determine status
        all_marked = all(a.get("marked_by") for a in attendance_list) if attendance_list else False
        all_present_completed = all(
            a.get("completed") for a in attendance_list if a.get("marked_present")
        ) if marked_present > 0 else False
        
        status = exam.get("status", "scheduled")
        if all_marked and all_present_completed and marked_present > 0:
            status = "completed"
        elif completed > 0:
            status = "ongoing"
        
        avg_score = sum(s["score_percent"] for s in submissions) / len(submissions) if submissions else 0
        
        result.append({
            "id": exam["id"],
            "title": exam["title"],
            "exam_date": exam["exam_date"],
            "exam_time": exam["exam_time"],
            "location": exam["location"],
            "status": status,
            "created_at": exam.get("created_at"),
            "stats": {
                "total_assigned": total_assigned,
                "marked_present": marked_present,
                "completed": completed,
                "avg_score": round(avg_score, 1)
            }
        })
    
    return result

# ==========================================
# CONTENT LIBRARY MANAGEMENT ENDPOINTS
# ==========================================

@app.get("/api/content-library")
async def get_api_content_library():
    """
    Get content grouped by bucket/category for ContentLibraryModal.
    Returns categories with items array.
    """
    # Get all unique buckets from content
    buckets_in_use = set()
    for item in content_store:
        bucket = item.get("bucket") or "Uncategorized"
        buckets_in_use.add(bucket)
    
    # Get bucket metadata from course_buckets
    bucket_meta = {}
    for bucket in course_buckets:
        bucket_meta[bucket.get("name")] = {
            "id": bucket.get("id"),
            "icon": bucket.get("icon", "folder"),
            "color": bucket.get("color", "#6B7280")
        }
    
    # Group content by bucket
    categories = []
    for bucket_name in buckets_in_use:
        meta = bucket_meta.get(bucket_name, {
            "id": f"cat-{bucket_name.lower().replace(' ', '-')}",
            "icon": "folder",
            "color": "#6B7280"
        })
        
        items = []
        for item in content_store:
            item_bucket = item.get("bucket") or "Uncategorized"
            if item_bucket == bucket_name:
                items.append({
                    "id": item.get("id"),
                    "title": item.get("title", "Untitled"),
                    "description": item.get("description", "No description"),
                    "type": "Video" if item.get("videoUrl") else "Document",
                    "category": bucket_name,
                    "bucket_id": meta.get("id"),
                    "videoUrl": item.get("videoUrl"),
                    "date": item.get("timestamp", "")[:10] if item.get("timestamp") else "Unknown"
                })
        
        if items:
            categories.append({
                "id": meta.get("id"),
                "name": bucket_name,
                "icon": meta.get("icon"),
                "color": meta.get("color"),
                "items": items
            })
    
    # Sort: Uncategorized last
    categories.sort(key=lambda x: (x["name"] == "Uncategorized", x["name"]))
    
    return {"categories": categories}


@app.get("/api/buckets")
async def get_api_buckets():
    """Get available course buckets for category selection"""
    return {
        "buckets": [
            {
                "id": bucket.get("id"),
                "name": bucket.get("name"),
                "icon": bucket.get("icon", "folder"),
                "color": bucket.get("color", "#6B7280")
            }
            for bucket in course_buckets
        ]
    }


@app.put("/api/content/{content_id}")
async def update_api_content(
    content_id: str,
    title: str = Form(None),
    description: str = Form(None),
    bucket_id: str = Form(None)
):
    """Update content item details"""
    for item in content_store:
        if item.get("id") == content_id:
            if title:
                item["title"] = title
            if description:
                item["description"] = description
            if bucket_id:
                # Find bucket name from id
                if bucket_id == "uncategorized":
                    item["bucket"] = "Uncategorized"
                else:
                    for bucket in course_buckets:
                        if bucket.get("id") == bucket_id:
                            item["bucket"] = bucket.get("name")
                            break
            
            return {"status": "success", "content": item}
    
    raise HTTPException(status_code=404, detail="Content not found")


@app.delete("/api/content/{content_id}")
async def delete_api_content(content_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Delete content from library - FAST version
    Returns immediately after database deletion, runs cleanup in background
    """
    global content_store, resource_store
    
    try:
        video_url = None
        cdn_object_key = None
        deleted_from_db = False

        # 1. Quick lookup for CDN key and URL (single DB query)
        try:
            db_content = db_ops.get_content_by_id(db, content_id)
            if db_content:
                video_url = db_content.video_url or db_content.file_url
                if db_content.extra_data and isinstance(db_content.extra_data, dict):
                    cdn_object_key = db_content.extra_data.get("cdn_object_key")
        except Exception as e:
            logger.error(f"[API Delete] Error finding content: {e}")

        # 2. Delete from database FIRST (critical operation - synchronous)
        try:
            deleted_from_db = db_ops.delete_content(db, content_id) or False
            db_ops.delete_resource(db, content_id)  # Also try resource table
        except Exception as e:
            logger.error(f"[API Delete] DB delete error: {e}")

        # 3. Delete from in-memory stores immediately (fast)
        initial_content_len = len(content_store)
        content_store[:] = [item for item in content_store if item.get("id") != content_id]
        deleted_from_memory = len(content_store) < initial_content_len
        
        resource_store[:] = [item for item in resource_store if item.get("id") != content_id]

        # Check if we deleted anything
        if not deleted_from_db and not deleted_from_memory:
            raise HTTPException(status_code=404, detail="Content not found")

        # 4. Schedule background cleanup tasks (non-blocking)
        def background_cleanup():
            """Run slow cleanup operations in background"""
            # CDN deletion
            if cdn_service.CDN_ENABLED and (cdn_object_key or video_url):
                try:
                    object_key = cdn_object_key
                    if not object_key and video_url and cdn_service.R2_PUBLIC_URL:
                        if cdn_service.R2_PUBLIC_URL in video_url:
                            object_key = video_url.replace(cdn_service.R2_PUBLIC_URL, "").lstrip("/")
                    if object_key:
                        cdn_service.delete_from_cdn(object_key)
                        logger.info(f"[BG] Deleted from CDN: {object_key}")
                except Exception as e:
                    logger.error(f"[BG] CDN delete error: {e}")
            
            # Local file deletion
            if video_url and "/uploads/" in video_url:
                try:
                    filename = video_url.split("/uploads/")[-1]
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    if os.path.exists(file_path):
                        os.remove(file_path)
                        logger.info(f"[BG] Deleted local file: {file_path}")
                except Exception as e:
                    logger.error(f"[BG] Local file delete error: {e}")
            
            # RAG cleanup
            try:
                rag_service.clear_rag_for_course(content_id)
            except Exception as e:
                logger.error(f"[BG] RAG clear error: {e}")
            
            logger.info(f"[BG] Background cleanup completed for: {content_id}")

        background_tasks.add_task(background_cleanup)
        
        logger.info(f"[API Delete] Content deleted: {content_id} (cleanup scheduled)")
        log_action("DELETE_CONTENT", content_id, "Content deleted from library")
        
        return {"status": "success", "message": "Content deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API Delete] Error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete content: {str(e)}")


@app.put("/api/content/{content_id}/category")
async def change_content_category(
    content_id: str,
    bucket_id: str = Form(...)
):
    """Change content category/bucket"""
    for item in content_store:
        if item.get("id") == content_id:
            if bucket_id == "uncategorized":
                item["bucket"] = "Uncategorized"
            else:
                for bucket in course_buckets:
                    if bucket.get("id") == bucket_id:
                        item["bucket"] = bucket.get("name")
                        break
            
            return {"status": "success", "content": item}
    
    raise HTTPException(status_code=404, detail="Content not found")
# --- ADMIN ANALYST AI ENDPOINT ---
class AdminChatRequest(BaseModel):
    query: str

@app.post("/admin/ask-ai")
async def admin_ask_ai(request: AdminChatRequest):
    query = request.query
    
    # 1. Aggregate Data Summary (Fast and lightweight)
    
    # Users
    user_count = len(users_store)
    role_counts = {}
    for user in users_store.values():
        role = user.get('role', 'Unknown')
        role_counts[role] = role_counts.get(role, 0) + 1
        
    # Content & Quizzes
    content_count = len(content_store)
    quiz_count = len(quiz_store)
    
    # Proctored
    proc_count = len(proctored_assessments)
    proc_subs = len(assessment_submissions)
    avg_proc_score = 0
    if proc_subs > 0:
        avg_proc_score = sum(s.get('score', 0) for s in assessment_submissions) / proc_subs
        
    # CRM
    crm_open = len([t for t in crm_tickets if t.get('status') != 'Closed'])
    crm_total = len(crm_tickets)
    
    # Scheduled Exams
    sched_exams = len(scheduled_exams)
    
    # Recent Alerts/Logs (last 5)
    recent_logs = []
    # Ensure audit_logs is accessed safely if defined earlier
    logs_to_show = audit_logs[:5] if 'audit_logs' in globals() else []
    for log in logs_to_show:
        recent_logs.append(f"{log.get('action', 'ACTION')} by {log.get('admin_email', 'unknown')}: {log.get('details', '')}")

    # Construct Context
    context_str = f"""
    SYSTEM OVERVIEW:
    - Total Users: {user_count}
    - User/Role Breakdown: {json.dumps(role_counts)}
    - Content Modules: {content_count}
    - Quizzes Created: {quiz_count}
    - Proctored Assessments: {proc_count} (Submissions: {proc_subs}, Avg Score: {avg_proc_score:.1f}%)
    - CRM Tickets: {crm_open} Open / {crm_total} Total
    - Scheduled Exams: {sched_exams}
    
    RECENT AUDIT LOGS (Latest Activity):
    {chr(10).join(recent_logs)}
    
    SAMPLE CONTENT TITLES:
    {json.dumps([c.get('title') for c in content_store[:5]])}

    SAMPLE QUIZ TITLES:
    {json.dumps([q.get('title') for q in quiz_store[:5]])}
    
    This is the live administrative data of the LMS. Use this to answer the admin's query.
    """
    
    # 2. Call Groq
    try:
        client = Groq()
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": f"You are the Intelligent Admin Analyst for the BW LMS. Your goal is to help the Super Admin understand the system status, analyze trends, and get insights. Use the following real-time system data to answer the user's question accurately and helpfully.\\n\\nDATA CONTEXT:\\n{context_str}\\n\\nIf the answer to the specific question is not in the summary data provided, make a reasonable inference or state that you need more specific data, but try to be as helpful as possible with general LMS knowledge. Be concise, professional, and insightful."
                },
                {
                    "role": "user",
                    "content": query
                }
            ],
            model="llama-3.1-8b-instant",
            temperature=0.5,
            max_tokens=400
        )
        answer = chat_completion.choices[0].message.content
        return {"answer": answer}
    except Exception as e:
        print(f"AI Error: {e}")
        # Fallback response if API fails
        return {"answer": "I apologize, but I'm strictly analyzing local data and cannot connect to the inference engine right now. Please check your internet connection or API keys."}

# --- QUIZ GENERATION ENDPOINT ---
class QuizGenerationRequest(BaseModel):
    topic: str
    num_questions: int
    difficulty: str

@app.post("/generate-quiz-from-topic")
async def generate_quiz_from_topic(request: QuizGenerationRequest):
    topic = request.topic
    num_questions = request.num_questions
    difficulty = request.difficulty

    try:
        client = Groq()
        prompt = f"""
        Generate a {difficulty} difficulty quiz about "{topic}" with {num_questions} multiple-choice questions.
        Return ONLY valid JSON in the following format:
        
        {{
            "questions": [
                {{
                    "question": "Question text here?",
                    "options": ["Option A", "Option B", "Option C", "Option D"],
                    "correctIndex": 0
                }}
            ]
        }}
        
        Ensure "correctIndex" is an integer (0-3) corresponding to the correct option in the "options" array.
        Do not include any markdown formatting (like ```json), just the raw JSON string.
        """
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a quiz generator that outputs strict JSON."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.1-8b-instant",
            temperature=0.7,
            max_tokens=2048
        )
        
        response_content = chat_completion.choices[0].message.content
        
        # Clean response if it contains markdown code blocks
        if "```json" in response_content:
            response_content = response_content.split("```json")[1].split("```")[0].strip()
        elif "```" in response_content:
            response_content = response_content.split("```")[1].split("```")[0].strip()
             
        try:
             quiz_data = json.loads(response_content)
             return quiz_data
        except json.JSONDecodeError:
             # Fallback if JSON is malformed
             logger.error(f"Failed to parse JSON from AI: {response_content}")
             raise HTTPException(status_code=500, detail="AI returned invalid JSON format")

    except Exception as e:
        print(f"Quiz Gen Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# STORE AUDITS ENDPOINTS
# ==========================================

@app.post("/store-audits/submit")
async def submit_store_audit(
    user_email: str = Form(...),
    user_name: str = Form(...),
    store: str = Form(...),
    category: str = Form(...),
    checklist_items: str = Form(...),  # JSON string of all checklist items
    checked_items: str = Form(...)     # JSON string of checked items {key: boolean}
):
    """Submit a store audit checklist for a category"""
    try:
        items_list = json.loads(checklist_items)
        checked_dict = json.loads(checked_items)
        
        # Calculate completion rate
        total_items = len(items_list)
        checked_count = sum(1 for key, val in checked_dict.items() if val and key.startswith(category))
        completion_rate = round((checked_count / total_items) * 100) if total_items > 0 else 0
        
        # Get category info
        cat_info = STORE_AUDIT_CATEGORIES.get(category, {"name": category, "icon": "check", "color": "#6B7280"})
        
        submission = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "user_name": user_name,
            "store": store,
            "category": category,
            "category_name": cat_info["name"],
            "checklist_items": items_list,
            "checked_items": checked_dict,
            "checked_count": checked_count,
            "total_items": total_items,
            "completion_rate": completion_rate,
            "submitted_at": datetime.now().isoformat()
        }
        
        store_audit_submissions.append(submission)
        logger.info(f"Store Audit submitted: {user_name} @ {store} - {cat_info['name']} ({completion_rate}%)")
        
        return {"status": "success", "data": submission}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for checklist items")
    except Exception as e:
        logger.error(f"Store Audit submission error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/store-audits/history")
async def get_store_audit_history(
    store: Optional[str] = None,
    user_email: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 100
):
    """Get store audit history with optional filters for Super Admins"""
    filtered = store_audit_submissions.copy()
    
    # Apply filters
    if store:
        filtered = [a for a in filtered if a.get("store") == store]
    if user_email:
        filtered = [a for a in filtered if a.get("user_email") == user_email]
    if category:
        filtered = [a for a in filtered if a.get("category") == category]
    
    # Sort by date (newest first)
    filtered.sort(key=lambda x: x.get("submitted_at", ""), reverse=True)
    
    # Apply limit
    filtered = filtered[:limit]
    
    # Compute statistics
    total_count = len(filtered)
    avg_completion = round(sum(a.get("completion_rate", 0) for a in filtered) / total_count) if total_count > 0 else 0
    
    # Group by category for stats
    category_stats = {}
    for a in filtered:
        cat = a.get("category", "unknown")
        if cat not in category_stats:
            category_stats[cat] = {"count": 0, "total_completion": 0}
        category_stats[cat]["count"] += 1
        category_stats[cat]["total_completion"] += a.get("completion_rate", 0)
    
    for cat in category_stats:
        if category_stats[cat]["count"] > 0:
            category_stats[cat]["avg_completion"] = round(category_stats[cat]["total_completion"] / category_stats[cat]["count"])
    
    return {
        "audits": filtered,
        "total_count": total_count,
        "avg_completion_rate": avg_completion,
        "category_stats": category_stats,
        "categories": STORE_AUDIT_CATEGORIES
    }

@app.get("/store-audits/filters")
async def get_store_audit_filters():
    """Get unique stores and employees for filter dropdowns"""
    stores = list(set(a.get("store") for a in store_audit_submissions if a.get("store")))
    employees = list(set(
        json.dumps({"email": a.get("user_email"), "name": a.get("user_name")}) 
        for a in store_audit_submissions if a.get("user_email")
    ))
    
    # Parse employees back to objects
    unique_employees = [json.loads(e) for e in employees]
    
    return {
        "stores": sorted(stores),
        "employees": sorted(unique_employees, key=lambda x: x.get("name", "")),
        "categories": [{"id": k, **v} for k, v in STORE_AUDIT_CATEGORIES.items()]
    }

@app.post("/ai/chatbot")
async def ai_chatbot(
    request: Request,
    message: str = Form(...),
    history: str = Form("[]"),
    authorization: Optional[str] = Header(None)
):
    """
    Role & Privilege-Based AI Chatbot that:
    1. Requires authentication to determine user role and privileges
    2. Only answers based on LMS content (courses, transcripts, resources)
    3. Filters content by role: employees see employee content
    4. Filters content by privileges: admins only see content related to their privileges
    5. Superadmins see everything
    6. Refuses to answer general knowledge questions outside LMS scope
    """
    try:
        import json
        
        # --- AUTHENTICATION & ROLE/PRIVILEGE/LEVEL DETECTION ---
        user_role = "employee"
        user_privileges = []
        is_superadmin = False
        user_name = "User"
        user_category = "Waffler"  # Default to lowest level
        
        # Try to get user from authorization header
        if authorization and authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                user_role = payload.get("role", "employee").lower()
                user_privileges = payload.get("privileges", [])
                is_superadmin = payload.get("is_superadmin", False)
                user_name = payload.get("name", "User")
                # Get user's level/category for level-based filtering
                user_category = payload.get("category") or payload.get("role", "Waffler")
            except jwt.ExpiredSignatureError:
                pass
            except jwt.InvalidTokenError:
                pass
        
        is_admin = user_role in ["admin", "manager", "superadmin"] or is_superadmin
        
        # Get user's accessible levels based on their category
        accessible_levels = get_accessible_levels(user_category)
        user_level_index = get_user_level_index(user_category)
        
        # --- PRIVILEGE TO CONTENT CATEGORY MAPPING ---
        # Maps privileges to content categories they can access
        PRIVILEGE_CONTENT_MAP = {
            "upload_training": ["training", "course", "video", "learning path", "sop"],
            "manage_learning_path": ["learning path", "course", "training", "module"],
            "post_quiz": ["quiz", "assessment", "question", "test"],
            "assign_quiz": ["quiz", "assessment", "test", "score"],
            "proctored_assessment": ["exam", "proctored", "assessment", "test"],
            "proctored_create_manage": ["exam", "proctored", "assessment", "test"],
            "proctored_view_results": ["exam", "result", "score", "report", "proctored"],
            "scheduled_exams": ["exam", "schedule", "assessment"],
            "exam_reports": ["exam", "report", "result", "score"],
            "reports": ["report", "analytics", "score", "completion", "progress"],
            "view_analytics": ["analytics", "report", "dashboard", "metrics"],
            "team_list": ["team", "employee", "user", "staff", "member"],
            "post_news": ["news", "announcement", "update", "notification"],
            "audits": ["audit", "compliance", "checklist", "inspection"],
            "live_tracking": ["tracking", "location", "attendance", "clock"],
            "manage_simulations": ["simulation", "interactive", "roleplay", "scenario"],
            "crm_tickets": ["crm", "ticket", "support", "customer"],
            "support_library": ["support", "help", "faq", "documentation"],
            "create_user": ["user", "employee", "team", "onboarding"],
            "send_notification": ["notification", "message", "alert"],
            "manage_buckets": ["bucket", "category", "course", "organization"],
            "bulk_upload": ["upload", "bulk", "import", "migration"],
            "access_control": ["access", "permission", "role", "security"],
            "view_audit_logs": ["audit", "log", "activity", "history"],
        }
        
        # Get all accessible categories based on privileges
        accessible_categories = set()
        if is_superadmin:
            # Superadmins can access everything
            for categories in PRIVILEGE_CONTENT_MAP.values():
                accessible_categories.update(categories)
            accessible_categories.add("all")  # Special marker for full access
        elif is_admin and user_privileges:
            for priv in user_privileges:
                if priv in PRIVILEGE_CONTENT_MAP:
                    accessible_categories.update(PRIVILEGE_CONTENT_MAP[priv])
            # All admins get basic training access
            accessible_categories.update(["training", "course", "sop", "recipe", "procedure"])
        else:
            # Employees get standard training content
            accessible_categories.update(["training", "course", "sop", "recipe", "procedure", "safety"])
        
        # Parse chat history
        try:
            chat_history = json.loads(history)
        except:
            chat_history = []
        
        # --- RAG SEARCH (Privilege-Filtered) ---
        relevant_context = []
        matched_sources = []
        
        try:
            rag_results = rag_service.search_rag(message, top_k=5)
            for result in rag_results:
                content_type = result.get("type", "training").lower()
                content_category = result.get("category", "").lower()
                
                # Check if user has access based on privileges
                has_access = False
                if is_superadmin or "all" in accessible_categories:
                    has_access = True
                else:
                    # Check if content matches any accessible category
                    for cat in accessible_categories:
                        if cat in content_type or cat in content_category or cat in result.get("title", "").lower():
                            has_access = True
                            break
                
                if has_access:
                    relevant_context.append(result.get("text", ""))
                    matched_sources.append({
                        "title": result.get("title", "Training Content"),
                        "type": content_type
                    })
        except Exception as rag_error:
            logger.warning(f"RAG search failed: {rag_error}")
        
        # --- BUILD LEVEL & PRIVILEGE-FILTERED KNOWLEDGE BASE ---
        course_summaries = []
        course_details = []
        
        # First, apply level-based filtering to courses
        level_filtered_courses = filter_courses_by_level(content_store[:50], user_category, is_admin)
        
        for course in level_filtered_courses:
            if course.get("isPathNode", False):
                content_type = course.get("type", "training").lower()
                content_category = course.get("category", "").lower()
                title = course.get('title', '').lower()
                
                # For admins, also check privilege-based access
                has_privilege_access = True
                if is_admin and not is_superadmin:
                    has_privilege_access = False
                    for cat in accessible_categories:
                        if cat in content_type or cat in content_category or cat in title:
                            has_privilege_access = True
                            break
                    # General training is accessible to all admins
                    if not has_privilege_access and any(cat in ["training", "course", "sop"] for cat in accessible_categories):
                        has_privilege_access = True
                
                if has_privilege_access:
                    course_title = course.get('title', 'Untitled')
                    description = course.get('description', '')[:150]
                    transcript = course.get('transcript', '')[:300] if course.get('transcript') else ''
                    bucket = course.get('bucket', 'General')
                    
                    course_summaries.append(f"- {course_title} ({bucket}): {description}")
                    if transcript:
                        course_details.append(f"[{course_title}]: {transcript}")
        
        resource_summaries = []
        for resource in resource_store[:20]:
            resource_category = resource.get("category", "").lower()
            resource_type = resource.get("type", "").lower()
            
            # Check access based on privileges
            has_access = False
            if is_superadmin or "all" in accessible_categories:
                has_access = True
            else:
                for cat in accessible_categories:
                    if cat in resource_category or cat in resource_type:
                        has_access = True
                        break
                # General resources are accessible to all
                if not has_access and resource_category in ["general", "training", "sop", ""]:
                    has_access = True
            
            if has_access:
                resource_summaries.append(f"- {resource.get('title', 'Untitled')}: {resource.get('category', 'General')}")
        
        # --- CHECK IF WE HAVE RELEVANT CONTENT ---
        has_relevant_content = len(relevant_context) > 0 or len(course_summaries) > 0
        
        # --- BUILD LEVEL & PRIVILEGE-AWARE PROMPT ---
        if is_superadmin:
            role_context = "a Superadmin with FULL ACCESS to all LMS features and content"
            access_note = "You have access to ALL content across the entire LMS system."
            level_note = "Full access to all levels"
        elif is_admin and user_privileges:
            privilege_names = ", ".join(user_privileges[:5])
            if len(user_privileges) > 5:
                privilege_names += f" (+{len(user_privileges) - 5} more)"
            role_context = f"an Admin ({user_category}) with privileges: {privilege_names}"
            access_note = f"You can access content related to your privileges and levels up to {user_category}."
            level_note = f"Levels: {', '.join(accessible_levels)}"
        elif is_admin:
            role_context = f"an Admin at level: {user_category}"
            access_note = f"You have access to training content for levels: {', '.join(accessible_levels)}."
            level_note = f"Levels: {', '.join(accessible_levels)}"
        else:
            role_context = f"an Employee at level: {user_category}"
            access_note = f"You have access to courses for your level ({user_category}) and below."
            level_note = f"Accessible levels: {', '.join(accessible_levels)}"
        
        system_prompt = f"""You are BWC AI Assistant, the EXCLUSIVE training assistant for Belgian Waffle Co.'s Learning Management System (LMS).

👤 CURRENT USER: {user_name} ({role_context})
📋 ACCESS LEVEL: {access_note}
🎯 TRAINING LEVEL: {level_note}

🚨 CRITICAL RULES - YOU MUST FOLLOW THESE STRICTLY:
1. You can ONLY answer questions based on the LMS content provided below
2. You CANNOT answer general knowledge questions (like "Who is Elon Musk?", "What is the capital of France?")
3. If asked about anything NOT related to the LMS training content, respond with:
   "❌ I can only answer questions related to your BW LMS training materials. Please ask me about courses, SOPs, or training content available to you."
4. If the user asks about content OUTSIDE their level access (e.g., a Waffler asking about Shift Manager content), respond with:
   "🔒 That content is for a higher level than yours. Complete your current courses to unlock more content!"
5. NEVER make up information - only use what's in the provided context

AVAILABLE LMS CONTENT FOR THIS USER (filtered by level: {user_category}):
{chr(10).join(course_summaries[:15]) if course_summaries else "No courses currently available for your level."}

TRANSCRIPT/DETAILED CONTENT:
{chr(10).join(relevant_context[:3]) if relevant_context else chr(10).join(course_details[:3]) if course_details else "No detailed content available."}

AVAILABLE RESOURCES:
{chr(10).join(resource_summaries[:10]) if resource_summaries else "No resources currently available for your access level."}

USER'S ACCESSIBLE LEVELS: {', '.join(accessible_levels)}

RESPONSE FORMAT:
- If the question relates to accessible LMS content: Answer helpfully with relevant course/resource references
- If the question is about content outside user's level: Politely mention they need to progress to unlock it
- If the question is NOT about LMS content at all: Politely decline and redirect to LMS topics
- Use emojis sparingly (🧇, ✅, 📚, 🔒)
- Format with *bold* for key terms
- Be concise and helpful"""

        # Build conversation messages
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add chat history (last 6 messages to save tokens)
        for msg in chat_history[-6:]:
            role = "user" if msg.get("sender") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("text", "")})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # --- GROQ API CALL ---
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,
            max_tokens=800
        )
        
        ai_response = response.choices[0].message.content.strip()
        
        return {
            "status": "success",
            "response": ai_response,
            "is_internal": len(relevant_context) > 0,
            "sources_found": len(relevant_context),
            "user_role": user_role,
            "user_category": user_category,
            "user_level_index": user_level_index,
            "accessible_levels": accessible_levels,
            "user_privileges": user_privileges if is_admin else [],
            "content_available": has_relevant_content,
            "is_superadmin": is_superadmin,
            "courses_available": len(course_summaries)
        }
        
    except Exception as e:
        logger.error(f"AI Chatbot Error: {e}")
        return {
            "status": "error",
            "response": "I'm having trouble connecting right now. Please try again in a moment. 🔄",
            "error": str(e)
        }

@app.post("/ai/voice_query")
async def ai_voice_query(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    """Handle voice queries - transcribe and respond (LMS content only, privilege-filtered)"""
    try:
        # --- AUTHENTICATION & ROLE/PRIVILEGE DETECTION ---
        user_role = "employee"
        user_privileges = []
        is_superadmin = False
        user_name = "User"
        
        if authorization and authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                user_role = payload.get("role", "employee").lower()
                user_privileges = payload.get("privileges", [])
                is_superadmin = payload.get("is_superadmin", False)
                user_name = payload.get("name", "User")
            except:
                pass
        
        is_admin = user_role in ["admin", "manager", "superadmin"] or is_superadmin
        
        # --- PRIVILEGE TO CONTENT CATEGORY MAPPING ---
        PRIVILEGE_CONTENT_MAP = {
            "upload_training": ["training", "course", "video", "sop"],
            "manage_learning_path": ["learning path", "course", "training"],
            "post_quiz": ["quiz", "assessment", "question"],
            "assign_quiz": ["quiz", "assessment", "test"],
            "proctored_assessment": ["exam", "proctored", "assessment"],
            "reports": ["report", "analytics", "score"],
            "view_analytics": ["analytics", "report", "dashboard"],
            "team_list": ["team", "employee", "user"],
            "audits": ["audit", "compliance", "checklist"],
            "manage_simulations": ["simulation", "interactive", "roleplay"],
        }
        
        # Get accessible categories
        accessible_categories = set()
        if is_superadmin:
            for categories in PRIVILEGE_CONTENT_MAP.values():
                accessible_categories.update(categories)
            accessible_categories.add("all")
        elif is_admin and user_privileges:
            for priv in user_privileges:
                if priv in PRIVILEGE_CONTENT_MAP:
                    accessible_categories.update(PRIVILEGE_CONTENT_MAP[priv])
            accessible_categories.update(["training", "course", "sop", "recipe"])
        else:
            accessible_categories.update(["training", "course", "sop", "recipe", "safety"])
        
        # Save temp file
        temp_path = f"temp_voice_{uuid.uuid4()}.m4a"
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        
        # Transcribe with Groq Whisper API
        try:
            result = ai_services.transcribe_audio(temp_path)
            user_text = result.get("text", "").strip() if result else ""
            os.remove(temp_path)
        except Exception as transcribe_err:
            os.remove(temp_path)
            logger.error(f"Transcription error: {transcribe_err}")
            return {"status": "error", "error": "Voice transcription failed"}
        
        if not user_text:
            return {"status": "error", "error": "Could not understand audio"}
        
        # Get privilege-filtered context from RAG
        context_text = ""
        try:
            results = rag_service.search_rag(user_text, top_k=3)
            for r in results:
                content_type = r.get("type", "training").lower()
                content_category = r.get("category", "").lower()
                
                has_access = False
                if is_superadmin or "all" in accessible_categories:
                    has_access = True
                else:
                    for cat in accessible_categories:
                        if cat in content_type or cat in content_category:
                            has_access = True
                            break
                
                if has_access:
                    context_text += r.get("text", "") + "\n"
        except Exception as e:
            logger.warning(f"RAG search failed in voice query: {e}")
        
        # Build privilege-filtered course context
        course_info = []
        for course in content_store[:15]:
            if course.get("isPathNode"):
                content_type = course.get("type", "training").lower()
                content_category = course.get("category", "").lower()
                title = course.get('title', '').lower()
                
                has_access = False
                if is_superadmin or "all" in accessible_categories or not is_admin:
                    has_access = True
                else:
                    for cat in accessible_categories:
                        if cat in content_type or cat in content_category or cat in title:
                            has_access = True
                            break
                    if not has_access and any(cat in ["training", "course", "sop"] for cat in accessible_categories):
                        has_access = True
                
                if has_access:
                    course_info.append(f"- {course.get('title', 'Untitled')}: {course.get('description', '')[:100]}")
        
        # Build role context
        if is_superadmin:
            role_context = "a Superadmin with full access"
        elif is_admin and user_privileges:
            role_context = f"an Admin with privileges: {', '.join(user_privileges[:3])}"
        elif is_admin:
            role_context = "an Admin with basic access"
        else:
            role_context = "an Employee"
        
        system_prompt = f"""You are BWC AI Assistant for Belgian Waffle Co.'s LMS.

👤 User: {user_name} ({role_context})

🚨 CRITICAL RULES:
1. ONLY answer questions based on the training content provided below
2. If the question is NOT about LMS training content, respond with:
   "I can only answer questions about your BW training materials. Please ask about courses, SOPs, or procedures."
3. If content is outside user's access, respond with:
   "You don't have access to that information."
4. NEVER answer general knowledge questions

AVAILABLE TRAINING CONTENT:
{chr(10).join(course_info[:8]) if course_info else "No courses available."}

CONTEXT FROM TRAINING MATERIALS:
{context_text if context_text else "No specific context found."}

Be concise and helpful. Reference specific courses when relevant."""

        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text}
            ],
            temperature=0.3,
            max_tokens=400
        )
        
        ai_response = response.choices[0].message.content.strip()
        
        return {
            "status": "success",
            "user_text": user_text,
            "ai_response": ai_response
        }
        
    except Exception as e:
        logger.error(f"Voice Query Error: {e}")
        return {"status": "error", "error": str(e)}

@app.get("/ai/suggested-questions")
async def get_suggested_questions():
    """Get dynamic suggested questions based on available courses"""
    suggestions = [
        "What is the standard waffle baking temperature?",
        "Explain the opening checklist",
        "How do I prepare the batter?",
        "What are the cleaning protocols?",
    ]
    
    # Add course-specific suggestions
    for course in content_store[:3]:
        if course.get("isPathNode"):
            suggestions.append(f"Tell me about {course.get('title', 'this course')}")
    
    return {"suggestions": suggestions[:8]}
    
if __name__ == "__main__":
    import uvicorn
    from database import Base, engine
    
    # Create new tables if they don't exist (for ProgressionLevel, AccessRule)
    logger.info("Creating/verifying database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")
    
    # Load progression levels from database (or init defaults)
    logger.info("Loading progression levels from database...")
    load_levels_from_db()
    
    # Load access rules from database (curriculum hierarchy assignments)
    logger.info("Loading access rules from database...")
    load_access_rules_from_db()
    
    logger.info(f"Starting BW LMS Backend on {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT)

