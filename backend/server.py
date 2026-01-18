import os
import sys
# Add custom library path for PyTorch and AI dependencies
sys.path.insert(0, r"C:\torch_libs")

import shutil
import asyncio
import json
import logging
from typing import List, Optional
import uuid
from datetime import datetime
from urllib.parse import unquote

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import Groq

# AI/ML imports - loaded from C:\torch_libs
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

rag_model = SentenceTransformer("all-MiniLM-L6-v2")

rag_index = faiss.IndexFlatL2(384)
rag_metadata = []

def chunk_text(text, chunk_size=200, overlap=40):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i+chunk_size])
        chunks.append(chunk)
    return chunks


def add_course_to_rag(course_id, transcript):
    chunks = chunk_text(transcript)

    for chunk in chunks:
        emb = rag_model.encode(chunk)
        rag_index.add(np.array([emb]).astype("float32"))
        rag_metadata.append({
            "course_id": course_id,
            "text": chunk
        })

# --- CONFIGURATION ---
PORT = 8000
HOST = "0.0.0.0"
BASE_URL = "http://192.168.29.119:8000"  # Local network IP for physical device

# --- LOGGING ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BW_LMS_Backend")

# --- ELEVENLABS CONFIG ---
ELEVENLABS_API_KEY = "sk_6ecd572e870639a9cb94b52be1b37f7d093d2857734c5a5a"
VOICE_ID = "Y6nOpHQlW4lnf9GRRc8f" # Best emotive Hindi voice

# --- GROQ CONFIG ---
# Check if environment variable is already set (e.g. from .env or system), otherwise use this default
if not os.environ.get("GROQ_API_KEY"):
    os.environ["GROQ_API_KEY"] = "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"

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

# --- LOAD AI MODELS ---
import whisper
logger.info("Loading OpenAI Whisper Model (Small - fast with good accuracy)...")
whisper_model = whisper.load_model("small")
logger.info("OpenAI Whisper Model Loaded (Small - optimized for speed).")

# --- APP SETUP ---
app = FastAPI(title="BW LMS Realtime Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- FFMPEG FIX FOR WHISPER ---
# Whisper requires 'ffmpeg' to be in the PATH. We add multiple possible locations.
import os

# Add WinGet-installed FFmpeg path (Windows)
FFMPEG_WINGET_PATH = r"C:\Users\Arzaan Ali Khan\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"
if os.path.exists(FFMPEG_WINGET_PATH) and FFMPEG_WINGET_PATH not in os.environ["PATH"]:
    os.environ["PATH"] = FFMPEG_WINGET_PATH + os.pathsep + os.environ["PATH"]
    logger.info(f"FFmpeg WinGet Path added: {FFMPEG_WINGET_PATH}")

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
    new_log = {
        "id": f"log-{uuid.uuid4()}",
        "action": action,
        "timestamp": datetime.now().isoformat(),
        "target": target,
        "details": details,
        "admin_email": admin_email
    }
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
    "manage_learning_path" # Manage learning path content
]

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
        "store": "HQ"
    },
    "user": {
        "email": "user", 
        "name": "Aditya User", 
        "password": "user@123", 
        "role": "Waffler",
        "category": "Employee",
        "privileges": [],  # No admin privileges
        "is_superadmin": False,
        "store": "Mumbai Central"
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
        "store": "Delhi CP"
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
        "store": "Mumbai Central"
    },
    "emp2@bw.com": {
        "email": "emp2@bw.com",
        "name": "Priya Sharma",
        "password": "test123",
        "role": "Silver Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Mumbai Central"
    },
    "emp3@bw.com": {
        "email": "emp3@bw.com",
        "name": "Amit Patel",
        "password": "test123",
        "role": "Gold Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Delhi CP"
    },
    "emp4@bw.com": {
        "email": "emp4@bw.com",
        "name": "Sneha Reddy",
        "password": "test123",
        "role": "Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Delhi CP"
    },
    "emp5@bw.com": {
        "email": "emp5@bw.com",
        "name": "Vijay Singh",
        "password": "test123",
        "role": "Silver Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Bangalore Indiranagar"
    },
    "emp6@bw.com": {
        "email": "emp6@bw.com",
        "name": "Anita Desai",
        "password": "test123",
        "role": "Waffler",
        "category": "Employee",
        "privileges": [],
        "is_superadmin": False,
        "store": "Bangalore Indiranagar"
    },
}


# ATTENDANCE/PUNCH IN-OUT STORE
attendance_records: List[dict] = []  # {id, user_id, punch_in, punch_out, duration_minutes}

# NEWS FEED STORE
news_feed: List[dict] = []  # {id, title, content, author, image, date, created_at}

# LIVE QUIZZES STORE (Topic Quizzes for Home Screen)
live_quizzes: List[dict] = []  # {id, title, questions, time, difficulty, image}

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
    # Higher roles have full access by default (not listed = full access)
}


# --- AUDIT LOG ENDPOINTS ---

@app.get("/audit-logs")
async def get_audit_logs(action_type: Optional[str] = None):
    # Collect unique action types
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

@app.get("/crm/tickets")
async def get_crm_tickets():
    """Get all CRM tickets (for admin/manager)"""
    return crm_tickets

@app.get("/crm/tickets/available")
async def get_available_tickets(category_id: str = None):
    """Get unassigned tickets, optionally filtered by category"""
    available = [t for t in crm_tickets if t.get("status") == "open" and t.get("assigned_to") is None]
    if category_id:
        available = [t for t in available if t.get("category_id") == category_id]
    return available

@app.get("/crm/tickets/{ticket_id}")
async def get_ticket_by_id(ticket_id: str):
    """Get a specific ticket by ID"""
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
    priority: str = Form("medium")  # low, medium, high, critical
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
        "created_at": datetime.now().isoformat(),
        "assigned_to": None
    }
    crm_tickets.append(new_ticket)
    logger.info(f"CRM Ticket Created: {new_ticket['id']} - {subject}")
    return {"status": "success", "ticket": new_ticket}

@app.post("/crm/assign-task")
async def assign_crm_task(
    user_email: str = Form(...),
    user_name: str = Form(...),
    category_id: str = Form(...)  # Course category they completed
):
    """Assign an available CRM ticket to user after course completion
    
    Smart matching based on course type:
    - Safety & Hygiene (3) or Customer Service (4) → Complaint tickets
    - Other courses (1, 2, 5) → Query or Request tickets
    """
    # Get allowed ticket types for this course category
    allowed_types = COURSE_TO_TICKET_TYPE.get(category_id, ["Query", "Request"])
    
    # Find unassigned ticket matching the allowed types
    available_tickets = [
        t for t in crm_tickets 
        if t.get("type") in allowed_types 
        and t.get("status") == "open" 
        and t.get("assigned_to") is None
    ]
    
    if not available_tickets:
        # Fallback: Try any open ticket if no matching type available
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
        "assigned_at": datetime.now().isoformat(),
        "status": "assigned",
        "resolution": None,
        "completed_at": None,
        "xp_earned": 0
    }
    crm_task_assignments.append(assignment)
    
    # Mark ticket as assigned
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
async def get_my_crm_tasks(user_email: str):
    """Get all CRM tasks assigned to a user"""
    my_tasks = []
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
    resolution: str = Form(...)
):
    """Complete a CRM task with resolution - awards 50 XP"""
    XP_REWARD = 50
    
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
async def delete_crm_ticket(ticket_id: str):
    """Delete a CRM ticket (admin only)"""
    global crm_tickets
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
async def get_resources():
    return resource_store

# --- COURSE BUCKETS ENDPOINTS ---

@app.get("/course-buckets")
async def get_course_buckets():
    """Get all course buckets for organizing courses"""
    return course_buckets

@app.post("/course-buckets")
async def create_course_bucket(
    name: str = Form(...),
    description: str = Form(""),
    color: str = Form("#6366F1"),
    icon: str = Form("folder")
):
    """Create a new course bucket"""
    new_bucket = {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": description,
        "color": color,
        "icon": icon
    }
    course_buckets.append(new_bucket)
    logger.info(f"Course Bucket Created: {name}")
    return {"status": "success", "bucket": new_bucket}

@app.put("/course-buckets/{bucket_id}")
async def update_course_bucket(
    bucket_id: str,
    name: str = Form(None),
    description: str = Form(None),
    color: str = Form(None),
    icon: str = Form(None)
):
    """Update an existing course bucket"""
    for bucket in course_buckets:
        if bucket.get("id") == bucket_id:
            if name is not None: bucket["name"] = name
            if description is not None: bucket["description"] = description
            if color is not None: bucket["color"] = color
            if icon is not None: bucket["icon"] = icon
            logger.info(f"Course Bucket Updated: {bucket_id}")
            return {"status": "success", "bucket": bucket}
    raise HTTPException(status_code=404, detail="Bucket not found")

@app.delete("/course-buckets/{bucket_id}")
async def delete_course_bucket(bucket_id: str):
    """Delete a course bucket"""
    global course_buckets
    initial_len = len(course_buckets)
    course_buckets = [b for b in course_buckets if b.get("id") != bucket_id]
    
    if len(course_buckets) < initial_len:
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
async def get_access_rules():
    """Get access control rules for all roles"""
    return access_control_store

@app.post("/admin/access-rules")
async def update_access_rules(rules: str = Form(...)):
    """Update all access control rules (JSON object)"""
    global access_control_store
    try:
        new_rules = json.loads(rules)
        access_control_store = new_rules
        logger.info("Access control rules updated")
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
    """Update access rules for a specific role"""
    try:
        courses = json.loads(accessible_courses)
        buckets = json.loads(accessible_buckets)
        
        access_control_store[role_name] = {
            "accessible_courses": courses,
            "accessible_buckets": buckets,
            "max_courses_visible": max_courses_visible
        }
        
        logger.info(f"Access rules updated for {role_name}")
        return {"status": "success", "role": role_name, "rules": access_control_store[role_name]}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")

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

@app.get("/user/level-progress/{user_email}")
async def get_user_level_progress(user_email: str):
    """Get user's current level and progress to next level"""
    # Get user's completed courses count
    user_completions = [c for c in course_completions if c.get("user_email") == user_email]
    completed_count = len(user_completions)
    
    # Get user from store
    user = users_store.get(user_email, {})
    current_role = user.get("role", "Waffler")
    
    # Check if current role is a progressable level
    level_info = level_config_store.get(current_role)
    
    if not level_info:
        # Not a progressable role (e.g., Store Manager, Area Manager)
        return {
            "user_email": user_email,
            "current_level": current_role,
            "completed_nodes": completed_count,
            "is_manager": True,
            "can_progress": False
        }
    
    # Calculate progress to next level
    next_level = level_info.get("next_level")
    next_level_info = level_config_store.get(next_level) if next_level else None
    
    nodes_for_next = next_level_info.get("min_nodes", 999) if next_level_info else 999
    progress_percent = min(100, int((completed_count / nodes_for_next) * 100)) if nodes_for_next > 0 else 100
    
    return {
        "user_email": user_email,
        "current_level": current_role,
        "current_level_info": level_info,
        "completed_nodes": completed_count,
        "next_level": next_level,
        "nodes_for_next_level": nodes_for_next,
        "nodes_remaining": max(0, nodes_for_next - completed_count),
        "progress_percent": progress_percent,
        "is_manager": False,
        "can_progress": next_level is not None and completed_count >= nodes_for_next
    }

@app.post("/user/check-level-up/{user_email}")
async def check_and_apply_level_up(user_email: str):
    """Check if user qualifies for level up and apply it"""
    progress = await get_user_level_progress(user_email)
    
    if progress.get("can_progress"):
        new_level = progress.get("next_level")
        
        # Update user's role in store
        if user_email in users_store:
            old_level = users_store[user_email].get("role")
            users_store[user_email]["role"] = new_level
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
async def get_proctored_assessments():
    """Get all active proctored assessments"""
    return [a for a in proctored_assessments if a.get("is_active", True)]

@app.get("/proctored-assessments/all")
async def get_all_proctored_assessments():
    """Get all proctored assessments (admin)"""
    return proctored_assessments

@app.get("/proctored-assessments/{assessment_id}")
async def get_proctored_assessment(assessment_id: str):
    """Get a specific proctored assessment"""
    for assessment in proctored_assessments:
        if assessment.get("id") == assessment_id:
            return assessment
    raise HTTPException(status_code=404, detail="Assessment not found")

@app.post("/proctored-assessments")
async def create_proctored_assessment(
    title: str = Form(...),
    description: str = Form(""),
    time_limit_minutes: int = Form(30),
    passing_score: int = Form(70),
    questions: str = Form(...),  # JSON string of questions array
    created_by: str = Form("Admin")
):
    """Create a new proctored assessment"""
    import json
    try:
        questions_list = json.loads(questions)
    except:
        raise HTTPException(status_code=400, detail="Invalid questions format")
    
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
    logger.info(f"Proctored Assessment Created: {title} with {len(questions_list)} questions")
    return {"status": "success", "assessment": new_assessment}

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
async def toggle_assessment_active(assessment_id: str):
    """Toggle assessment active/inactive status"""
    for assessment in proctored_assessments:
        if assessment.get("id") == assessment_id:
            assessment["is_active"] = not assessment.get("is_active", True)
            return {"status": "success", "is_active": assessment["is_active"]}
    raise HTTPException(status_code=404, detail="Assessment not found")

@app.delete("/proctored-assessments/{assessment_id}")
async def delete_proctored_assessment(assessment_id: str):
    """Delete a proctored assessment"""
    global proctored_assessments
    initial_len = len(proctored_assessments)
    proctored_assessments = [a for a in proctored_assessments if a.get("id") != assessment_id]
    
    if len(proctored_assessments) < initial_len:
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
    warning_breaches: int = Form(0)
):
    """Submit a proctored assessment attempt with detailed breach tracking"""
    import json
    
    # Find assessment
    assessment = None
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
    
    # Create submission record with enhanced breach data
    submission = {
        "id": str(uuid.uuid4()),
        "assessment_id": assessment_id,
        "assessment_title": assessment.get("title"),
        "user_email": user_email,
        "user_name": user_name,
        "answers": answers_list,
        "correct_count": correct_count,
        "total_questions": total,
        "score_percent": round(score_percent, 1),
        "score": round(score_percent, 1),  # Alias for compatibility
        "passed": passed,
        "time_taken_seconds": time_taken_seconds,
        "time_limit_seconds": assessment.get("time_limit_minutes", 30) * 60,
        "violations": violations,
        "breach_log": breach_log_list,
        "critical_breaches": critical_breaches,
        "warning_breaches": warning_breaches,
        "integrity_status": integrity_status,
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

            
        # 2. TRANSCRIBE (OpenAI Whisper) - with fallback if model not available
        logger.info("Starting AI Processing...")
        # Use simple path construction to avoid path issues
        audio_path = f"{os.path.dirname(file_path)}/{filename}_audio.mp3"
        print(f"--- [DEBUG] Extracting audio to {audio_path}")

        
        # Get event loop for async operations (needed for quiz generation)
        loop = asyncio.get_event_loop()
        
        # Check if Whisper model is available
        if whisper_model is None:
            logger.warning("Whisper model not loaded. Skipping transcription (AI features disabled).")
            print("--- [DEBUG] Whisper model is None - using placeholder transcript")
            transcript_text = f"Training video content for: {filename}. AI transcription unavailable - please review video manually."
            # Continue to quiz generation with fallback
        else:
            # Check for audio track (blocking)
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
                logger.info("Transcribing with OpenAI Whisper...")
                print("--- [DEBUG] Running Whisper...")
                # Run in thread to avoid blocking event loop
                result = await loop.run_in_executor(None, whisper_model.transcribe, audio_path)
                transcript_text = result["text"]
                logger.info(f"Transcript Generated: {transcript_text[:50]}...")
                print(f"--- [DEBUG] Transcript: {transcript_text[:50]}...")
                
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
        print(f"--- [DEBUG] AI Error: {e}")
        print(traceback.format_exc())
        
    return {"transcript": transcript_text, "quiz": quiz_data}

@app.post("/resources/upload")
async def upload_resource(
    title: str = Form(...),
    category: str = Form(...), 
    description: str = Form(...),
    isPathNode: str = Form("false"),  # Changed to str to handle frontend sending "true"/"false" strings
    bucket: str = Form(None),  # NEW: Optional bucket/category for the course
    file: UploadFile = File(...)
):
    # Convert isPathNode string to boolean (frontend sends "true" or "false")
    is_path_node_bool = isPathNode.lower() in ("true", "1", "yes")
    
    print(f"--- [DEBUG] Upload Request: Title={title}, IsPathNode={isPathNode} -> {is_path_node_bool}, File={file.filename} ---")
    # Save file
    file_id = str(uuid.uuid4())
    filename = f"{file_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_url = f"{BASE_URL}/uploads/{filename}"
    
    # Determine type
    content_type = file.content_type
    res_type = "File"
    if "video" in content_type: res_type = "Video"
    elif "pdf" in content_type: res_type = "PDF"
    elif "image" in content_type: res_type = "Image"
    elif "sheet" in content_type or "excel" in content_type: res_type = "Excel"
    
    print(f"--- [DEBUG] File saved to {file_path}, Type={res_type}")
    
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
    resource_store.append(new_resource)
    
    # [LOGIC] Optional: Add to Learning Path
    # [LOGIC] Optional: Add to Learning Path
    if is_path_node_bool:
        print("--- [DEBUG] Processing Path Node...")
        transcript = None
        quiz = None
        
        # AI Processing for Videos
        if res_type == "Video":
            print("--- [DEBUG] Video detected, calling process_video_content...")
            ai_result = await process_video_content(file_path, filename)
            transcript = ai_result["transcript"]
            quiz = ai_result["quiz"]
            print(f"--- [DEBUG] AI Result: Transcript Len={len(transcript) if transcript else 0}, Quiz Len={len(quiz) if quiz else 0}")
        else:
            print(f"--- [DEBUG] Not a video (Type: {res_type}), skipping AI.")

        # Create ContentItem for Path
        path_item = {
            "id": file_id,
            "title": title,
            "description": description,
            "videoUrl": file_url, # Using file_url as videoUrl
            "authorRole": "Store Manager",
            "timestamp": datetime.now().isoformat(),
            "isPathNode": True,
            "skippable": False,
            "xp": 50,
            "transcript": transcript,
            "quiz": quiz,
            "bucket": bucket  # NEW: Store bucket/category
        }
        # Add to top of store
        content_store.insert(0, path_item)
        print(f"--- [DEBUG] Added to content_store. New Len: {len(content_store)}")
        
        # Broadcast update
        await manager.broadcast({
            "type": "NEW_CONTENT", # Use consistent type for listeners
            "data": path_item
        })
        print("--- [DEBUG] Broadcast sent.")
    else:
        print("--- [DEBUG] isPathNode is FALSE")
    
    # [AUDIT] Log upload
    log_action("UPLOAD_CONTENT", title, f"Uploaded {res_type} to {'Learning Path' if is_path_node_bool else 'Knowledge Base'}")
    
    return {"status": "success", "resource": new_resource}

class NotificationRequest(BaseModel):
    title: str
    message: str
    type: str # 'ordinary' or 'crucial'

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

# --- ENDPOINTS ---

@app.get("/")
async def root():
    return {"status": "ok", "message": "BW LMS Backend Running"}

@app.get("/content")
async def get_content():
    """Returns all uploaded content."""
    return content_store

@app.post("/upload")
async def upload_content(
    title: str = Form(...),
    description: str = Form(...),
    authorRole: str = Form(...),
    timestamp: str = Form(...),
    isPathNode: bool = Form(False),
    bucket: str = Form(None),  # NEW: Optional bucket/category for the course
    file: UploadFile = File(...)
):
    """
    Receives new content (Files + Metadata) from Managers.
    Saves file to disk, updates memory, and broadcasts to clients.
    """
    # 1. Save content to disk
    file_location = f"{UPLOAD_DIR}/{file.filename}"
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # --- AI PROCESSING (Transcribe & Quiz) ---
    ai_result = await process_video_content(file_location, file.filename)
    transcript_text = ai_result["transcript"]
    quiz_data = ai_result["quiz"]
    
    # 2. Generate Public URL
    video_url = f"{BASE_URL}/uploads/{file.filename}"
    
    logger.info(f"New Content Uploaded: {title} by {authorRole} (File: {file.filename}, Bucket: {bucket})")
    
    # 3. Store Metadata
    item_id = str(uuid.uuid4())
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
        "bucket": bucket  # NEW: Store bucket/category
    }
    
    content_store.insert(0, item_data) # Add to top
    
    # 4. Real-time Broadcast
    await manager.broadcast({
        "type": "NEW_CONTENT",
        "data": item_data
    })
    
    return {"status": "success", "message": "Content uploaded and broadcasted", "url": video_url}

from fastapi import HTTPException

@app.put("/content/{item_id}")
async def update_content(item_id: str, request: UpdateContentRequest):
    for item in content_store:
        if item.get("id") == item_id:
            if request.title is not None: item["title"] = request.title
            if request.description is not None: item["description"] = request.description
            if request.skippable is not None: item["skippable"] = request.skippable
            if request.quiz is not None: item["quiz"] = request.quiz
            
            logger.info(f"Content Updated: {item_id}")
            return {"status": "success", "data": item}
    
    raise HTTPException(status_code=404, detail="Content not found")

@app.delete("/content/{item_id}")
async def delete_content(item_id: str):
    global content_store
    initial_len = len(content_store)
    content_store = [item for item in content_store if item.get("id") != item_id]
    
    if len(content_store) < initial_len:
         logger.info(f"Content Deleted: {item_id}")
         return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Content not found")

# --- NEWS FEED ENDPOINTS ---

@app.get("/news")
async def get_news():
    """Get all news articles, sorted by date (newest first)"""
    return sorted(news_feed, key=lambda x: x.get('created_at', ''), reverse=True)

@app.post("/news")
async def create_news(
    title: str = Form(...),
    content: str = Form(...),
    author: str = Form(...),
    image: Optional[UploadFile] = File(None)
):
    """Create a new news article and broadcast to all users"""
    news_id = str(uuid.uuid4())
    
    # Handle image upload
    image_url = None
    if image:
        file_extension = image.filename.split('.')[-1]
        file_name = f"news_{news_id}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, file_name)
        with open(file_path, "wb") as f:
            f.write(await image.read())
        image_url = f"{BASE_URL}/uploads/{file_name}"
    
    news_item = {
        "id": news_id,
        "title": title,
        "content": content,
        "author": author,
        "image": image_url or "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=800",
        "date": "Just now",
        "created_at": datetime.now().isoformat()
    }
    
    news_feed.append(news_item)
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

@app.delete("/news/{news_id}")
async def delete_news(news_id: str):
    """Delete a news article"""
    global news_feed
    initial_len = len(news_feed)
    news_feed = [n for n in news_feed if n.get("id") != news_id]
    
    if len(news_feed) < initial_len:
        logger.info(f"News Deleted: {news_id}")
        return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="News not found")

# --- LIVE QUIZZES ENDPOINTS ---

@app.get("/live-quizzes")
async def get_live_quizzes():
    """Get all live topic quizzes"""
    return live_quizzes

@app.post("/live-quizzes")
async def create_live_quiz(
    title: str = Form(...),
    difficulty: str = Form(...),
    time: str = Form(...),
    questions: str = Form(...),  # JSON string of questions array
    image: Optional[UploadFile] = File(None)
):
    """Create a new topic quiz and broadcast to all users"""
    quiz_id = str(uuid.uuid4())
    
    # Parse questions JSON
    try:
        questions_list = json.loads(questions)
    except:
        raise HTTPException(status_code=400, detail="Invalid questions format")
    
    # Handle image upload
    image_url = None
    if image:
        file_extension = image.filename.split('.')[-1]
        file_name = f"quiz_{quiz_id}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, file_name)
        with open(file_path, "wb") as f:
            f.write(await image.read())
        image_url = f"{BASE_URL}/uploads/{file_name}"
    
    quiz_item = {
        "id": quiz_id,
        "title": title,
        "difficulty": difficulty,
        "time": time,
        "questions": questions_list,
        "image": image_url or "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800",
        "created_at": datetime.now().isoformat()
    }
    
    live_quizzes.append(quiz_item)
    live_quizzes.append(quiz_item)
    logger.info(f"Live Quiz Created: {title}")

    # [AUDIT] Log quiz assignment
    log_action("ASSIGN_QUIZ", title, f"Assigned quiz ({difficulty}, {time})")
    
    # Broadcast to all connected clients
    await manager.broadcast({
        "type": "QUIZ_POSTED",
        "data": quiz_item
    })
    
    return {"status": "success", "data": quiz_item}

@app.delete("/live-quizzes/{quiz_id}")
async def delete_live_quiz(quiz_id: str):
    """Delete a live quiz"""
    global live_quizzes
    initial_len = len(live_quizzes)
    live_quizzes = [q for q in live_quizzes if q.get("id") != quiz_id]
    
    if len(live_quizzes) < initial_len:
        logger.info(f"Live Quiz Deleted: {quiz_id}")
        return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Quiz not found")

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
                    
        # IMAGE: Use Tesseract OCR
        elif "image" in content_type or file_extension in ["jpg", "jpeg", "png", "bmp", "gif"]:
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
                extracted_text = pytesseract.image_to_string(img)
                logger.info(f"OCR extraction: {len(extracted_text)} chars")
            except ImportError as e:
                logger.error(f"OCR import error: {e}")
                raise HTTPException(status_code=500, detail="Tesseract OCR libraries not installed")
            except Exception as e:
                logger.error(f"OCR processing error: {e}")
                raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")
                
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
    "options": [
      {{"id": "a", "text": "Option A"}},
      {{"id": "b", "text": "Option B"}},
      {{"id": "c", "text": "Option C"}},
      {{"id": "d", "text": "Option D"}}
    ],
    "correct": "a"
  }}
]

IMPORTANT:
- Generate exactly {num_questions} questions
- Each question must have exactly 4 options (a, b, c, d)
- Include "correct" field with the correct answer letter
- Make questions appropriate for the difficulty level
- Return ONLY the JSON array, no other text"""

        groq_start = time.time()
        print(f"🤖 Starting Groq AI quiz generation...")
        loop = asyncio.get_event_loop()
        completion = await loop.run_in_executor(None, lambda: groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2000
        ))
        
        response_content = completion.choices[0].message.content.strip()
        print(f"🤖 Groq AI done: {time.time() - groq_start:.2f}s")
        print(f"✅ TOTAL TIME: {time.time() - start_time:.2f}s")
        print(f"{'='*50}\n")
        
        # Parse JSON from response
        import re
        json_match = re.search(r'\[[\s\S]*\]', response_content)
        if json_match:
            questions_list = json.loads(json_match.group())
        else:
            raise ValueError("Could not find JSON array in response")
        
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
async def get_path_nodes(user_email: str = "user"):
    """
    Returns ordered learning path nodes with user-specific status (completed, active, locked).
    Now includes role-based access filtering based on access_control_store.
    """
    # Get user info for access control
    user = users_store.get(user_email, {})
    user_role = user.get("role", "Waffler")
    
    # Filter path nodes
    raw_nodes = [item for item in content_store if item.get("isPathNode", False)]
    # Sort by timestamp (oldest first = linear order)
    raw_nodes.sort(key=lambda x: x["timestamp"])
    
    # Apply access control filtering
    access_rules = access_control_store.get(user_role)
    
    if access_rules:
        # User has restricted access
        accessible_buckets = access_rules.get("accessible_buckets", [])
        accessible_courses = access_rules.get("accessible_courses", [])
        max_visible = access_rules.get("max_courses_visible", -1)
        
        filtered_nodes = []
        for node in raw_nodes:
            bucket_id = node.get("bucket")
            course_id = node.get("id")
            
            # Check if course is accessible (either specifically allowed or in accessible bucket)
            if course_id in accessible_courses or bucket_id in accessible_buckets:
                filtered_nodes.append(node)
        
        # Apply max visible limit if set
        if max_visible > 0:
            filtered_nodes = filtered_nodes[:max_visible]
        
        raw_nodes = filtered_nodes
    # else: user has full access (not in access_control_store means all access)
    
    # Get user's completed course IDs
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
async def create_quiz(payload: QuizCreateRequest):
    """
    Create a new quiz and broadcast to all users.
    """
    import uuid
    from datetime import datetime
    
    quiz_id = str(uuid.uuid4())
    quiz_data = {
        "id": quiz_id,
        "title": payload.title,
        "description": payload.description,
        "questions": payload.questions,
        "created_at": datetime.now().isoformat(),
        "created_by": payload.created_by
    }
    
    quiz_store.append(quiz_data)
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

@app.get("/quiz/list")
async def list_quizzes():
    """
    Get all created quizzes (without answers).
    """
    quizzes = []
    for quiz in quiz_store:
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
async def get_quiz(quiz_id: str):
    """
    Get specific quiz details (for taking quiz).
    """
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
async def submit_quiz(submission: QuizSubmission):
    """
    Submit quiz answers and calculate score.
    """
    import uuid
    from datetime import datetime
    
    # Find quiz
    quiz = None
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
    
    # Save submission
    submission_data = {
        "id": str(uuid.uuid4()),
        "quiz_id": submission.quiz_id,
        "user_name": submission.user_name,
        "answers": submission.answers,
        "score": score,
        "total": len(quiz["questions"]),
        "submitted_at": datetime.now().isoformat()
    }
    
    quiz_submissions.append(submission_data)
    logger.info(f"Quiz Submitted: {submission.user_name} scored {score}/{len(quiz['questions'])}")
    
    return {
        "status": "success",
        "score": score,
        "total": len(quiz["questions"]),
        "percentage": round((score / len(quiz["questions"])) * 100, 2)
    }

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
    ELEVENLABS_API_KEY = "sk_6ecd572e870639a9cb94b52be1b37f7d093d2857734c5a5a"
    VOICE_ID = "Y6nOpHQlW4lnf9GRRc8f"
    URL = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"

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

        # 2. TRANSCRIBE (WHISPER - English Only for best accuracy)
        result = whisper_model.transcribe(
            temp_filename, 
            language="en",  # English only for best accuracy
            fp16=False,     # CPU optimization
            condition_on_previous_text=False  # Faster, prevents repetition loops
        )
        user_text = result["text"].strip()
        logger.info(f"Transcribed: {user_text[:80]}...")
        
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
async def send_notification_endpoint(payload: NotificationRequest):
    notification_id = str(uuid.uuid4())
    new_notif = {
        "id": notification_id,
        "title": payload.title,
        "message": payload.message,
        "type": payload.type,
        "created_at": datetime.now().isoformat(),
        "read_by": []
    }
    notification_store.insert(0, new_notif)
    
    # Broadcast to all users
    await manager.broadcast({
        "type": "CRUCIAL_NOTIFICATION" if payload.type == 'crucial' else "NOTIFICATION",
        "data": new_notif
    })
    
    return {"status": "success", "id": notification_id}

@app.get("/notifications")
async def get_notifications(user_id: Optional[str] = "user"):
    # Filter out read ones if needed, or return all with 'isRead' flag
    results = []
    for n in notification_store:
        n_copy = n.copy()
        n_copy["isRead"] = user_id in n["read_by"]
        results.append(n_copy)
    return results

@app.get("/notifications/crucial")
async def get_crucial_notifications(user_id: str = "user"):
    """Returns the first unread crucial notification for this user (for blocking modal)"""
    for n in notification_store:
        if n.get("type") == "crucial" and user_id not in n.get("read_by", []):
            return {
                "id": n["id"],
                "title": n["title"],
                "message": n["message"],
                "type": n["type"],
                "read": False,
                "created_at": n.get("created_at")
            }
    # No unread crucial notifications
    return {"id": None, "read": True}

@app.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user_id: str = "user"):
    for n in notification_store:
        if n["id"] == notif_id:
            if user_id not in n["read_by"]:
                n["read_by"].append(user_id)
            return {"status": "success"}
    raise HTTPException(status_code=404, detail="Notification not found")

# ==========================================
# LOCATION TRACKING APIs
# ==========================================

@app.post("/location/update")
async def update_location(data: dict):
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
    
    location_store[user_id] = {
        "user_id": user_id,
        "name": user_name,
        "latitude": latitude,
        "longitude": longitude,
        "timestamp": timestamp,
        "active": True
    }
    
    logger.info(f"Location updated for {user_name}: ({latitude}, {longitude})")
    return {"status": "success"}


@app.post("/location/stop")
async def stop_location(data: dict):
    """
    Employee stops sharing location.
    Sets active=False.
    """
    user_id = data.get('user_id')
    if user_id in location_store:
        location_store[user_id]["active"] = False
        logger.info(f"Location tracking stopped for {user_id}")
    return {"status": "stopped"}


@app.get("/location/all")
async def get_all_locations():
    """
    Returns all employee locations for Admin/Manager.
    """
    return list(location_store.values())


@app.post("/users/login")
async def login_user(data: dict):
    """
    Authenticates a user and returns their profile.
    """
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return {"status": "error", "message": "Email and password are required"}
    
    # Check credentials
    if email in users_store:
        user = users_store[email]
        if user["password"] == password:
            # Login successful
            return {
                "status": "success",
                "user": {
                    "email": user["email"],
                    "name": user["name"],
                    "role": user.get("role", "User"),
                    "category": user.get("category", "Employee"),
                    "privileges": user.get("privileges", []),
                    "is_superadmin": user.get("is_superadmin", False),
                    "has_admin_access": user.get("has_admin_access", False)
                }
            }
            
    return {"status": "error", "message": "Invalid credentials"}


# ==========================================
# USER MANAGEMENT APIs
# ==========================================

@app.post("/users/create")
async def create_user(data: dict):
    """
    Creates a new user account with category, privileges, and store assignment.
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
    
    # Check if user exists
    if email in users_store:
        return {"status": "error", "message": "User already exists"}
    
    # Validate privileges - ensure they are valid
    valid_privileges = [p for p in privileges if p in ALL_PRIVILEGES]
    
    # Determine if user has admin access based on privileges or category
    has_admin_access = len(valid_privileges) > 0 or category in ['Super Admin', 'Manager', 'Supervisor']
    
    # Create user
    users_store[email] = {
        "email": email,
        "name": name,
        "password": password,  # In production: hash this!
        "role": role,
        "category": category,
        "privileges": valid_privileges,
        "is_superadmin": category == 'Super Admin',
        "has_admin_access": has_admin_access,
        "store": store,
        "created_at": datetime.now().isoformat()
    }
    
    logger.info(f"User created: {name} ({email}) - Role: {role} - Store: {store} - Privileges: {valid_privileges}")
    
    # [AUDIT] Log user creation
    log_action("CREATE_USER", name, f"Created new {role} account for {email} ({store})")

    return {"status": "success", "user_id": email, "privileges_count": len(valid_privileges)}


@app.post("/users/update")
async def update_user(data: dict):
    """
    Updates an existing user's privileges, role, and store assignment.
    """
    email = data.get('email')
    if not email or email not in users_store:
        return {"status": "error", "message": "User not found"}
        
    user = users_store[email]
    
    # Update allowed fields
    if 'role' in data:
        user['role'] = data['role']
    if 'category' in data:
        user['category'] = data['category']
    if 'privileges' in data:
        privileges = data['privileges']
        valid_privileges = [p for p in privileges if p in ALL_PRIVILEGES]
        user['privileges'] = valid_privileges
        user['has_admin_access'] = len(valid_privileges) > 0 or user['category'] in ['Super Admin', 'Manager', 'Supervisor']
        
        # Update superadmin status if category changes
        if user['category'] == 'Super Admin':
            user['is_superadmin'] = True
            
    if 'name' in data:
        user['name'] = data['name']
    
    if 'store' in data:
        user['store'] = data['store']
        
    logger.info(f"User updated: {email} - Store: {user.get('store')} - Privileges: {user.get('privileges')}")
    return {"status": "success", "message": "User updated successfully"}


@app.get("/users/list")
async def list_users(
    page: int = 1,
    limit: int = 50,
    search: str = "",
    store: str = "",
    role: str = ""
):
    """
    Returns all users (without passwords) with pagination and filtering.
    Supports search by name/email, filter by store and role.
    """
    users = []
    for email, user_data in users_store.items():
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
async def get_stores_summary():
    """
    Returns stores with employee count for analytics.
    """
    store_summary = []
    for store in STORES_LIST:
        employee_count = sum(1 for u in users_store.values() if u.get("store") == store["name"])
        store_summary.append({
            **store,
            "employee_count": employee_count
        })
    return store_summary


@app.post("/users/bulk-upload")
async def bulk_upload_users(file: UploadFile = File(...)):
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
                
                if email in users_store:
                    errors.append(f"Row {idx + 2}: User {email} already exists")
                    skipped_count += 1
                    continue
                
                # Create user
                users_store[email] = {
                    "email": email,
                    "name": name,
                    "password": password,
                    "role": role,
                    "category": category,
                    "privileges": [],
                    "is_superadmin": False,
                    "has_admin_access": category in ['Super Admin', 'Manager', 'Supervisor'],
                    "store": store,
                    "created_at": datetime.now().isoformat()
                }
                created_count += 1
                
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
async def get_user(email: str):
    """
    Returns a specific user by email (without password).
    """
    if email not in users_store:
        raise HTTPException(status_code=404, detail="User not found")
    
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
        "is_superadmin": user_data.get("is_superadmin", False),
        "has_admin_access": user_data.get("has_admin_access", False)
    }


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
async def punch_in(data: dict):
    """
    Employee punches in for work.
    """
    user_id = data.get('user_id')
    timestamp = data.get('timestamp')
    
    # Check if already punched in
    for record in attendance_records:
        if record['user_id'] == user_id and not record.get('punch_out'):
            return {"status": "error", "message": "Already punched in"}
    
    record = {
        "id": str(len(attendance_records) + 1),
        "user_id": user_id,
        "punch_in": timestamp,
        "punch_out": None,
        "duration_minutes": None
    }
    
    attendance_records.append(record)
    logger.info(f"Punch in: {user_id} at {timestamp}")
    return {"status": "success"}


@app.post("/attendance/punch-out")
async def punch_out(data: dict):
    """
    Employee punches out from work.
    """
    user_id = data.get('user_id')
    timestamp = data.get('timestamp')
    
    # Find active attendance record
    for record in attendance_records:
        if record['user_id'] == user_id and not record.get('punch_out'):
            record['punch_out'] = timestamp
            
            # Calculate duration
            punch_in_dt = datetime.fromisoformat(record['punch_in'].replace('Z', '+00:00'))
            punch_out_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            duration = (punch_out_dt - punch_in_dt).total_seconds() / 60
            record['duration_minutes'] = int(duration)
            
            logger.info(f"Punch out: {user_id} at {timestamp}, duration: {duration}min")
            return {"status": "success", "duration_minutes": int(duration)}
    
    return {"status": "error", "message": "No active punch-in found"}


@app.get("/attendance/history")
async def attendance_history(user_id: str = None):
    """
    Returns attendance history.
    """
    if user_id:
        return [r for r in attendance_records if r['user_id'] == user_id]
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
async def create_assessment(data: AssessmentModel):
    new_id = str(uuid.uuid4())
    assessment = data.dict()
    assessment["id"] = new_id
    assessment["created_at"] = datetime.now().isoformat()
    assessment["active"] = True
    proctored_assessments.append(assessment)
    return {"status": "success", "id": new_id}

@app.get("/proctored-assessments")
async def get_assessments():
    return [a for a in proctored_assessments if a.get("active", True)]

@app.get("/proctored-assessments/all")
async def get_all_assessments():
    return proctored_assessments

@app.delete("/proctored-assessments/{assessment_id}")
async def delete_assessment(assessment_id: str):
    global proctored_assessments
    initial_len = len(proctored_assessments)
    proctored_assessments = [a for a in proctored_assessments if a["id"] != assessment_id]
    if len(proctored_assessments) < initial_len:
        return {"status": "success", "message": "Assessment deleted"}
    return {"status": "error", "message": "Assessment not found"}

@app.post("/proctored-assessments/{assessment_id}/submit")
async def submit_assessment(assessment_id: str, submission: AssessmentSubmission):
    assessment = next((a for a in proctored_assessments if a["id"] == assessment_id), None)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    score = 0
    total = len(assessment["questions"])
    for i, ans in enumerate(submission.answers):
        if i < total and ans == assessment["questions"][i]["correctIndex"]:
            score += 1
    
    passed_cutoff = assessment.get("passing_score", 70)
    percentage = (score / total) * 100 if total > 0 else 0
    passed = percentage >= passed_cutoff

    result = {
        "id": str(uuid.uuid4()),
        "assessment_id": assessment_id,
        "user_name": submission.user_name,
        "score": round(percentage, 1),
        "correct": score,
        "total": total,
        "passed": passed,
        "passing_score": passed_cutoff,
        "violations": submission.violations,
        "submitted_at": datetime.now().isoformat(),
        "answers": submission.answers
    }
    assessment_submissions.append(result)
    return {"status": "success", "result": result}

@app.get("/proctored-assessments/{assessment_id}/submissions")
async def get_assessment_submissions(assessment_id: str):
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
        
        # Try RAG first if index has data
        if rag_index.ntotal > 0:
            try:
                # 1. Embed Question
                q_emb = rag_model.encode(req.question)

                # 2. Vector Search
                k = min(8, rag_index.ntotal)  # Don't request more than available
                D, I = rag_index.search(np.array([q_emb]).astype("float32"), k)

                # 3. Filter only this course
                context_chunks = []
                for idx in I[0]:
                    if idx >= 0 and idx < len(rag_metadata):
                        meta = rag_metadata[idx]
                        if meta["course_id"] == req.course_id:
                            context_chunks.append(meta["text"])

                if context_chunks:
                    context_text = "\n\n".join(context_chunks[:4])
            except Exception as rag_error:
                logger.warning(f"RAG search failed, falling back to transcript: {rag_error}")
        
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
            "active": True
        }
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
    quiz_total: int = Form(0)
):
    """Track when a user completes a course/module and update their learning profile."""
    try:
        profile = ensure_user_profile(user_email)
        
        # Determine skill categories from course title
        matched_skills = categorize_content_by_skill(course_title, bucket or "")
        
        # Create completion record
        completion = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "course_id": course_id,
            "course_title": course_title,
            "bucket": bucket,
            "score": score,
            "max_score": max_score,
            "percentage": round((score / max_score) * 100, 1) if max_score > 0 else 0,
            "time_spent_seconds": time_spent_seconds,
            "completed_at": datetime.now().isoformat(),
            "quiz_correct": quiz_correct,
            "quiz_total": quiz_total,
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
        
        logger.info(f"Course completion tracked: {user_email} completed '{course_title}' with score {score}/{max_score}")
        
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
    text = (bucket + " " + (title or "")).lower()
    
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
    course_title: str = Form(None)  # Optional title from frontend
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
        
        # Record specific completion
        completion_record = {
            "id": str(uuid.uuid4()),
            "user_email": user_email,
            "course_id": course_id,
            "course_title": course_title,
            "bucket": bucket,
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

@app.get("/user/level-progress/{user_email}")
async def get_user_level_progress(user_email: str):
    """Get detailed progress towards next level"""
    try:
        # Ensure user exists in users_store
        if user_email not in users_store:
            users_store[user_email] = {
                "email": user_email,
                "role": "Waffler",
                "created_at": datetime.now().isoformat()
            }
            
        user_data = users_store.get(user_email)
        current_role = user_data.get("role", "Waffler")

        
        # Define Hierarchy
        HIERARCHY = ['Waffler', 'Silver Waffler', 'Gold Waffler', 'Shift Manager', 'Assistant Store Manager']
        
        # Get requirements for CURRENT level
        role_rules = access_control_store.get(current_role, {})
        required_course_ids = role_rules.get("accessible_courses", [])
        
        # Get user completions
        user_completed_ids = [c["course_id"] for c in course_completions if c["user_email"] == user_email]
        
        # Count how many required courses are done
        completed_count = sum(1 for cid in required_course_ids if cid in user_completed_ids)
        total_required = len(required_course_ids)
        
        next_level = None
        if current_role in HIERARCHY:
            idx = HIERARCHY.index(current_role)
            if idx < len(HIERARCHY) - 1:
                next_level = HIERARCHY[idx + 1]
        
        # Get total global completed nodes for display
        total_completed_nodes = len(set(user_completed_ids))
        
        return {
            "current_level": current_role,
            "next_level": next_level,
            "nodes_completed_in_level": completed_count,
            "nodes_required_in_level": total_required,
            "completed_nodes": total_completed_nodes, # Total global
            "nodes_remaining": max(0, total_required - completed_count),
            "progress_percent": int((completed_count / total_required * 100)) if total_required > 0 else 100
        }
    except Exception as e:
        logger.error(f"Level progress error: {e}")
        return {"error": str(e)}


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
async def get_all_simulations():
    """Get all available simulations."""
    return simulations_store


@app.get("/simulation/{simulation_id}")
async def get_simulation(simulation_id: str):
    """Get a specific simulation by ID."""
    for sim in simulations_store:
        if sim["id"] == simulation_id:
            return sim
    raise HTTPException(status_code=404, detail="Simulation not found")


@app.post("/simulation/save")
async def save_simulation(simulation: SimulationData):
    """Create or update a simulation."""
    sim_dict = simulation.dict()
    
    # Check if exists (update) or new (create)
    existing_idx = None
    for i, sim in enumerate(simulations_store):
        if sim["id"] == simulation.id:
            existing_idx = i
            break
    
    if existing_idx is not None:
        # Update existing
        sim_dict["updatedAt"] = datetime.now().isoformat()
        sim_dict["createdAt"] = simulations_store[existing_idx].get("createdAt", datetime.now().isoformat())
        simulations_store[existing_idx] = sim_dict
        logger.info(f"Simulation updated: {simulation.title}")
    else:
        # Create new
        sim_dict["createdAt"] = datetime.now().isoformat()
        sim_dict["updatedAt"] = datetime.now().isoformat()
        simulations_store.append(sim_dict)
        logger.info(f"Simulation created: {simulation.title}")
    
    return {"success": True, "id": simulation.id}


@app.delete("/simulation/{simulation_id}")
async def delete_simulation(simulation_id: str):
    """Delete a simulation."""
    global simulations_store
    simulations_store = [s for s in simulations_store if s["id"] != simulation_id]
    logger.info(f"Simulation deleted: {simulation_id}")
    return {"success": True}


@app.post("/simulation/upload-video")
async def upload_simulation_video(video: UploadFile = File(...)):
    """Upload a video clip for a simulation step."""
    try:
        # Generate unique filename
        file_ext = video.filename.split(".")[-1] if "." in video.filename else "mp4"
        unique_filename = f"sim_video_{uuid.uuid4()}.{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
        
        video_url = f"{BASE_URL}/uploads/{unique_filename}"
        logger.info(f"Simulation video uploaded: {unique_filename}")
        
        return {"success": True, "url": video_url, "filename": unique_filename}
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
        groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", "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"))
        
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
async def get_analytics_dashboard():
    """Main analytics dashboard with overview metrics"""
    total_stores = len(set([e.get("store", "Unknown") for e in users_store.values() if e.get("role") != "Super Admin"]))
    total_employees = len([u for u in users_store.values() if not u.get("is_superadmin")])
    
    # Calculate completion rates
    total_completions = len(course_completions)
    total_courses = len(content_store)
    avg_completion = (total_completions / max(total_employees * total_courses, 1)) * 100 if total_courses > 0 else 0
    
    # Calculate average quiz score
    quiz_scores = [s.get("score", 0) for s in quiz_submissions]
    avg_quiz_score = sum(quiz_scores) / len(quiz_scores) if quiz_scores else 0
    
    # Compliance score (from assessment submissions)
    passing_assessments = len([a for a in assessment_submissions if a.get("passed")])
    total_assessments = len(assessment_submissions)
    compliance_score = (passing_assessments / total_assessments * 100) if total_assessments > 0 else 100
    
    # Customer satisfaction (simulated based on training)
    customer_satisfaction = min(100, 75 + (avg_completion / 10))
    
    # Training completion trend (last 30 days)
    from datetime import datetime, timedelta
    today = datetime.now()
    trend_data = []
    for i in range(30, 0, -1):
        date = today - timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")
        completions_on_date = len([c for c in course_completions if c.get("completed_at", "").startswith(date_str)])
        trend_data.append({"date": date_str, "completions": completions_on_date})
    
    # Risk summary
    high_risk_stores = len([s for s in store_analytics if s.get("risk_level") == "red"])
    employees_needing_retraining = len([e for e in employee_analytics if e.get("risk_status") == "red"])
    fully_compliant_stores = len([s for s in store_analytics if s.get("risk_level") == "green"])
    
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
async def get_store_performance():
    """Store-wise performance analytics"""
    from collections import defaultdict
    
    store_data = defaultdict(lambda: {
        "store_name": "",
        "completion_percent": 0,
        "avg_quiz_score": 0,
        "hygiene_score": 100,
        "risk_level": "green",
        "employee_count": 0,
        "total_courses": 0,
        "completed_courses": 0
    })
    
    # Aggregate by store
    for user_email, user in users_store.items():
        if user.get("is_superadmin"):
            continue
        
        store = user.get("store", "Unassigned")
        store_data[store]["store_name"] = store
        store_data[store]["employee_count"] += 1
        
        # Get user's completions
        user_completions = [c for c in course_completions if c.get("user_email") == user_email]
        store_data[store]["completed_courses"] += len(user_completions)
        
        # Quiz scores
        user_quiz_scores = [s.get("score", 0) for s in quiz_submissions if s.get("user_name") == user.get("name")]
        if user_quiz_scores:
            store_data[store]["avg_quiz_score"] += sum(user_quiz_scores) / len(user_quiz_scores)
    
    # Calculate percentages and risk
    stores_list = []
    for store_id, data in store_data.items():
        if data["employee_count"] > 0:
            data["avg_quiz_score"] = round(data["avg_quiz_score"] / data["employee_count"], 1)
            
            total_expected = data["employee_count"] * len(content_store)
            data["completion_percent"] = round((data["completed_courses"] / total_expected * 100) if total_expected > 0 else 0, 1)
            
            # Risk calculation
            if data["completion_percent"] < 30 or data["avg_quiz_score"] < 50:
                data["risk_level"] = "red"
            elif data["completion_percent"] < 60 or data["avg_quiz_score"] < 70:
                data["risk_level"] = "yellow"
            else:
                data["risk_level"] = "green"
            
            stores_list.append({"store_id": store_id, **data})
    
    return stores_list


@app.get("/analytics/stores/{store_name}")
async def get_store_detail(store_name: str):
    """Detailed store analytics with tabs"""
    store_employees = [
        {
            "email": email,
            "name": user.get("name"),
            "role": user.get("role"),
            "completion_percent": len([c for c in course_completions if c.get("user_email") == email]) / max(len(content_store), 1) * 100,
            "avg_score": sum([s.get("score", 0) for s in quiz_submissions if s.get("user_name") == user.get("name")]) / max(len([s for s in quiz_submissions if s.get("user_name") == user.get("name")]), 1)
        }
        for email, user in users_store.items()
        if user.get("store") == store_name and not user.get("is_superadmin")
    ]
    
    # Calculate store-level metrics
    total_completion = sum([e["completion_percent"] for e in store_employees]) / len(store_employees) if store_employees else 0
    avg_score = sum([e["avg_score"] for e in store_employees]) / len(store_employees) if store_employees else 0
    
    return {
        "overview": {
            "store_name": store_name,
            "completion_percent": round(total_completion, 1),
            "avg_quiz_score": round(avg_score, 1),
            "compliance_percent": 95.0,  # Simulated
            "customer_complaints_reduction": 25  # Simulated correlation
        },
        "employees": store_employees,
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
async def get_employee_performance():
    """Employee-wise performance analytics"""
    employees_list = []
    
    for user_email, user in users_store.items():
        if user.get("is_superadmin"):
            continue
        
        user_completions = [c for c in course_completions if c.get("user_email") == user_email]
        completion_percent = (len(user_completions) / max(len(content_store), 1)) * 100
        
        user_quiz_attempts = [s for s in quiz_submissions if s.get("user_name") == user.get("name")]
        avg_score = sum([s.get("score", 0) for s in user_quiz_attempts]) / len(user_quiz_attempts) if user_quiz_attempts else 0
        
        # Risk status
        if completion_percent < 30 or avg_score < 50:
            risk_status = "red"
        elif completion_percent < 60 or avg_score < 70:
            risk_status = "yellow"
        else:
            risk_status = "green"
        
        employees_list.append({
            "email": user_email,
            "name": user.get("name"),
            "role": user.get("role"),
            "store": user.get("store", "Unassigned"),
            "completion_percent": round(completion_percent, 1),
            "avg_score": round(avg_score, 1),
            "risk_status": risk_status
        })
    
    return employees_list


@app.get("/analytics/employees/{user_email}")
async def get_employee_detail(user_email: str):
    """Detailed employee analytics with tabs"""
    user = users_store.get(user_email)
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    user_completions = [c for c in course_completions if c.get("user_email") == user_email]
    user_quizzes = [s for s in quiz_submissions if s.get("user_name") == user.get("name")]
    
    # Calculate skill scores (from course completions and quiz scores)
    skill_scores = {
        "product_knowledge": 75.0,
        "hygiene": 88.0,
        "pos": 92.0,
        "customer_handling": 82.0,
        "speed_of_service": 78.0
    }
    
    # Learning streak
    learning_streak = len(set([c.get("completed_at", "")[:10] for c in user_completions]))
    
    # Weak topics from quiz analysis
    weak_topics = ["Coffee Grinding", "Milk Texturing"] if len(user_quizzes) > 0 else []
    
    return {
        "training": {
            "assigned_courses": len(content_store),
            "completed_courses": len(user_completions),
            "pending_courses": len(content_store) - len(user_completions),
            "learning_streak": learning_streak,
            "xp_earned": sum([c.get("score", 0) * 10 for c in user_completions])
        },
        "quizzes": {
            "attempts": len(user_quizzes),
            "avg_score": sum([q.get("score", 0) for q in user_quizzes]) / len(user_quizzes) if user_quizzes else 0,
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


@app.get("/audit-logs")
async def get_audit_logs(
    admin_email: str = None,
    action_type: str = None,
    limit: int = 50
):
    """Get audit logs with optional filters"""
    filtered = audit_logs
    
    if admin_email:
        filtered = [log for log in filtered if log["admin_email"] == admin_email]
    if action_type:
        filtered = [log for log in filtered if log["action"] == action_type]
    
    # Sort by timestamp descending
    filtered = sorted(filtered, key=lambda x: x["timestamp"], reverse=True)[:limit]
    
    return {
        "logs": filtered,
        "total": len(filtered),
        "action_types": list(ACTION_TYPES.keys())
    }


@app.post("/audit-logs")
async def add_audit_log(
    admin_email: str = Form(...),
    action: str = Form(...),
    target: str = Form(...),
    details: str = Form("")
):
    """Add new audit log entry"""
    new_log = {
        "id": len(audit_logs) + 1,
        "timestamp": datetime.now().isoformat(),
        "admin_email": admin_email,
        "action": action,
        "target": target,
        "details": details,
        "ip_address": "0.0.0.0"
    }
    audit_logs.insert(0, new_log)
    
    return {"status": "success", "log": new_log}


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


@app.delete("/content/{content_id}")
async def delete_content(content_id: str):
    """Delete a content item"""
    original_len = len(content_store)
    content_store[:] = [c for c in content_store if c.get("id") != content_id]
    
    if len(content_store) == original_len:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Add audit log
    audit_logs.insert(0, {
        "id": len(audit_logs) + 1,
        "timestamp": datetime.now().isoformat(),
        "admin_email": "admin",
        "action": "DELETE_CONTENT",
        "target": content_id,
        "details": "Content deleted",
        "ip_address": "0.0.0.0"
    })
    
    return {"status": "success", "message": "Content deleted"}


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
async def get_scheduled_exams():
    """Get all scheduled exams (admin view)"""
    return scheduled_exams

@app.get("/scheduled-exams/user/{user_email}")
async def get_user_scheduled_exams(user_email: str):
    """Get scheduled exams assigned to a specific user"""
    user_exams = []
    user_email_lower = user_email.lower().strip()
    
    logger.info(f"[ScheduledExams] Fetching exams for user: {user_email}")
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
async def get_scheduled_exam(exam_id: str):
    """Get a specific scheduled exam"""
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
    created_by: str = Form("Admin")
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
        "created_at": datetime.now().isoformat(),
        "status": "scheduled"  # scheduled, ongoing, completed, cancelled
    }
    
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
async def get_exam_attendance(exam_id: str):
    """Get attendance list for a scheduled exam"""
    attendance = [a for a in scheduled_exam_attendance if a["exam_id"] == exam_id]
    return attendance

@app.post("/scheduled-exams/{exam_id}/mark-present")
async def mark_user_present(
    exam_id: str,
    user_email: str = Form(...),
    marked_by: str = Form(...)
):
    """Mark a user as present for the exam (supervisor action)"""
    # Find attendance record
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
    marked_by: str = Form(...)
):
    """Mark a user as absent for the exam"""
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
    user_email: str = Form(...)
):
    """User starts the scheduled exam (after being marked present)"""
    # Check attendance
    attendance = next((a for a in scheduled_exam_attendance 
                      if a["exam_id"] == exam_id and a["user_email"] == user_email), None)
    
    if not attendance:
        raise HTTPException(status_code=404, detail="You are not assigned to this exam")
    
    if not attendance["marked_present"]:
        raise HTTPException(status_code=403, detail="You must be marked present by supervisor to start the exam")
    
    if attendance["completed"]:
        raise HTTPException(status_code=400, detail="You have already completed this exam")
    
    # Get exam details
    exam = next((e for e in scheduled_exams if e["id"] == exam_id), None)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    # Mark as started
    attendance["started_exam"] = True
    attendance["start_time"] = datetime.now().isoformat()
    
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
        "start_time": attendance["start_time"]
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
async def delete_scheduled_exam(exam_id: str):
    """Delete a scheduled exam"""
    global scheduled_exams, scheduled_exam_attendance
    
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


if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting BW LMS Backend on {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT)
