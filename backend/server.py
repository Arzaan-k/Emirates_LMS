import os
import shutil
import asyncio
import json
import logging
from typing import List, Optional
import uuid
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# --- CONFIGURATION ---
PORT = 8000
HOST = "0.0.0.0"
BASE_URL = "http://192.168.0.136:8000"  # Local network IP for physical device

# --- LOGGING ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BW_LMS_Backend")

# --- ELEVENLABS CONFIG ---
ELEVENLABS_API_KEY = "sk_6ecd572e870639a9cb94b52be1b37f7d093d2857734c5a5a"
VOICE_ID = "Y6nOpHQlW4lnf9GRRc8f" # Best emotive Hindi voice

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
logger.info("Loading OpenAI Whisper Model...")
# Run on CPU
whisper_model = whisper.load_model("small")
logger.info("OpenAI Whisper Model Loaded (Small).")

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
# Whisper requires 'ffmpeg' to be in the PATH. MoviePy finds it via imageio, but Whisper doesn't.
try:
    import imageio_ffmpeg
    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_dir = os.path.dirname(ffmpeg_path)
    if ffmpeg_dir not in os.environ["PATH"]:
        os.environ["PATH"] += os.pathsep + ffmpeg_dir
    logger.info(f"FFmpeg Path configured for Whisper: {ffmpeg_dir}")
except Exception as e:
    logger.warning(f"Could not configuring FFmpeg for Whisper automatically: {e}")

# --- STATIC FILES ---
# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# --- DATA MODELS ---
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
users_store: dict = {
    "user": {"email": "user", "name": "Aditya User", "password": "user@123", "role": "User"},
    "store.manager": {"email": "store.manager", "name": "Store Manager", "password": "bw_store@2025", "role": "Store Manager"},
}

# ATTENDANCE/PUNCH IN-OUT STORE
attendance_records: List[dict] = []  # {id, user_id, punch_in, punch_out, duration_minutes}

# NEWS FEED STORE
news_feed: List[dict] = []  # {id, title, content, author, image, date, created_at}

# LIVE QUIZZES STORE (Topic Quizzes for Home Screen)
live_quizzes: List[dict] = []  # {id, title, questions, time, difficulty, image}

resource_categories: List[dict] = [
    {"id": "1", "name": "Standard SOPs", "icon": "file-document-outline", "color": ["#3B82F6", "#2563EB"], "bg": "#DBEAFE"},
    {"id": "2", "name": "Video Tutorials", "icon": "play-circle-outline", "color": ["#F59E0B", "#D97706"], "bg": "#FEF3C7"},
    {"id": "3", "name": "Machine Manuals", "icon": "tools", "color": ["#8B5CF6", "#7C3AED"], "bg": "#EDE9FE"},
    {"id": "4", "name": "Safety Guides", "icon": "shield-check-outline", "color": ["#10B981", "#059669"], "bg": "#D1FAE5"},
]

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
        clip = VideoFileClip(file_path)
        print(f"--- [DEBUG] Clip duration: {clip.duration}")
        if clip.duration > 30:
            logger.info(f"Video is too long ({clip.duration}s). Trimming to 30s...")
            trimmed_path = f"{os.path.dirname(file_path)}/trimmed_{filename}"
            trimmed_clip = clip.subclip(0, 30)
            trimmed_clip.write_videofile(trimmed_path, codec="libx264", audio_codec="aac", logger=None)
            clip.close()
            trimmed_clip.close()
            
            # Replace original with trimmed
            os.remove(file_path)
            os.rename(trimmed_path, file_path)
            logger.info("Video trimmed successfully.")
        else:
            clip.close()
            
        # 2. TRANSCRIBE (OpenAI Whisper)
        logger.info("Starting AI Processing...")
        # Use simple path construction to avoid path issues
        audio_path = f"{os.path.dirname(file_path)}/{filename}_audio.mp3"
        print(f"--- [DEBUG] Extracting audio to {audio_path}")
        video = VideoFileClip(file_path)
        
        if video.audio:
            video.audio.write_audiofile(audio_path, logger=None)
            video.close()
            
            logger.info("Transcribing with OpenAI Whisper...")
            print("--- [DEBUG] Running Whisper...")
            # Run in thread to avoid blocking event loop
            loop = asyncio.get_event_loop()
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
            video.close()
            return {"transcript": transcript_text, "quiz": quiz_data} # Exit early if no audio

        # 3. GENERATE QUIZ (Groq)
        print("--- [DEBUG] Generating Quiz with Groq...")
        from groq import Groq
        groq_client = Groq(api_key="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") 
        
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
    isPathNode: bool = Form(False), # New param
    file: UploadFile = File(...)
):
    print(f"--- [DEBUG] Upload Request: Title={title}, IsPathNode={isPathNode}, File={file.filename} ---")
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
    if isPathNode:
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
            "quiz": quiz
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
    
    logger.info(f"New Content Uploaded: {title} by {authorRole} (File: {file.filename})")
    
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
        "quiz": quiz_data 
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
        image_url = f"/uploads/{file_name}"
    
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
    logger.info(f"News Created: {title}")
    
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
        image_url = f"/uploads/{file_name}"
    
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
    logger.info(f"Live Quiz Created: {title}")
    
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
    file: UploadFile = File(...)
):
    """
    Generate a quiz from any uploaded content (video, PDF, image, or text file).
    Uses Whisper for audio, PyMuPDF for PDF, and Groq for quiz generation.
    """
    quiz_id = str(uuid.uuid4())
    extracted_text = ""
    
    # Save uploaded file
    file_extension = file.filename.split('.')[-1].lower()
    temp_filename = f"temp_{quiz_id}.{file_extension}"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    content_type = file.content_type or ""
    logger.info(f"AI Quiz Gen: Processing {file.filename} ({content_type})")
    
    try:
        # 1. EXTRACT TEXT BASED ON FILE TYPE
        
        # VIDEO/AUDIO: Use Whisper transcription
        if any(x in content_type for x in ["video", "audio"]) or file_extension in ["mp4", "mp3", "wav", "m4a", "webm"]:
            logger.info("Extracting audio and transcribing with Whisper...")
            
            # Extract audio if video
            if "video" in content_type or file_extension in ["mp4", "webm"]:
                from moviepy.editor import VideoFileClip
                video = VideoFileClip(temp_path)
                audio_path = temp_path.replace(f".{file_extension}", ".mp3")
                video.audio.write_audiofile(audio_path, verbose=False, logger=None)
                video.close()
            else:
                audio_path = temp_path
            
            # Transcribe with Whisper
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: whisper_model.transcribe(audio_path))
            extracted_text = result.get("text", "")
            logger.info(f"Whisper transcription: {len(extracted_text)} chars")
            
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
                img = Image.open(temp_path)
                extracted_text = pytesseract.image_to_string(img)
                logger.info(f"OCR extraction: {len(extracted_text)} chars")
            except ImportError:
                raise HTTPException(status_code=500, detail="Tesseract OCR not available")
                
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
        groq_client = Groq(api_key="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")
        
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

        loop = asyncio.get_event_loop()
        completion = await loop.run_in_executor(None, lambda: groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2000
        ))
        
        response_content = completion.choices[0].message.content.strip()
        logger.info(f"Groq response: {response_content[:500]}...")
        
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
async def get_path_nodes():
    """
    Returns ordered learning path nodes.
    For now, simply returns items marked as isPathNode=True, 
    sorted by timestamp (oldest first implies linear progression).
    """
    nodes = [item for item in content_store if item.get("isPathNode", False)]
    # Sort by timestamp ascending (assuming 'timestamp' is ISO string)
    nodes.sort(key=lambda x: x["timestamp"])
    return nodes

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
        groq_client = Groq(api_key="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") 
        
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
    groq_client = Groq(api_key="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") 
    
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
        groq_client = Groq(api_key="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")
        
        system_prompt = """
        You are an angry Indian customer at 'The Belgian Waffle Co.'.
        The user is the store manager or support agent.

        CONTEXT:
        - You ordered a 'Triple Chocolate Waffle' 45 minutes ago via Swiggy/Zomato.
        - The delivery is late, and when it arrived, the waffle was COLD and SOGGY.
        - You are very frustrated and hungry.
        
        TASK:
        1.  Analyze the User's response for empathy, politeness, and problem solving.
        2.  Generate a Score (0-100) based on their performance.
        3.  Provide a short, constructive TIP on how they could improve (max 10 words).
        4.  Continue the roleplay conversation as the customer. Speak naturally in Hinglish (Hindi + English mix).
        5.  Be dramatic but realistic. If they apologize well, calm down slightly. If they are rude, get angrier.
        
        OUTPUT FORMAT (JSON ONLY):
        {
            "customer_response": "Arre bhai, kya mazaak hai? ...",
            "mood_score": 20,
            "user_score": 75,
            "improvement_tip": "Be more apologetic."
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
        groq_client = Groq(api_key="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")
        
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

        # 2. TRANSCRIBE (WHISPER - OpenAI Version)
        # OpenAI Whisper returns a dict -> result["text"]
        # Added prompt for Hinglish context
        result = whisper_model.transcribe(temp_filename, initial_prompt="Conversation in Hindi and English about food delivery and customer complaints.") 
        user_text = result["text"].strip()
        logger.info(f"Whisper Result Keys: {result.keys()}")
        logger.info(f"Detected Language: {result.get('language')}")
        logger.info(f"Transcribed: {user_text}")
        
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


# ==========================================
# USER MANAGEMENT APIs
# ==========================================

@app.post("/users/create")
async def create_user(data: dict):
    """
    Creates a new user account.
    """
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    role = data.get('role', 'Employee')
    
    # Validation
    if not name or not email or not password:
        return {"status": "error", "message": "Missing required fields"}
    
    # Check if user exists
    if email in users_store:
        return {"status": "error", "message": "User already exists"}
    
    # Create user
    users_store[email] = {
        "email": email,
        "name": name,
        "password": password,  # In production: hash this!
        "role": role,
        "created_at": datetime.now().isoformat()
    }
    
    logger.info(f"User created: {name} ({email}) - Role: {role}")
    return {"status": "success", "user_id": email}


@app.get("/users/list")
async def list_users():
    """
    Returns all users (without passwords).
    """
    users = []
    for email, user_data in users_store.items():
        users.append({
            "email": user_data["email"],
            "name": user_data["name"],
            "role": user_data["role"]
        })
    return users


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


# --- START SERVER ---
if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting BW LMS Backend on {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT)
