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
BASE_URL = f"http://192.168.0.136:{PORT}" # UPDATE THIS IP IF IT CHANGES

# --- LOGGING ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BW_LMS_Backend")

# --- LOAD AI MODELS ---
import whisper
logger.info("Loading OpenAI Whisper Model...")
# Run on CPU
whisper_model = whisper.load_model("base")
logger.info("OpenAI Whisper Model Loaded.")

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

@app.post("/resources/upload")
async def upload_resource(
    title: str = Form(...),
    category: str = Form(...), 
    description: str = Form(...),
    isPathNode: bool = Form(False), # New param
    file: UploadFile = File(...)
):
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
    if isPathNode:
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
            "transcript": None,
            "quiz": None
        }
        content_store.append(path_item)
    
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
        
    transcript_text = "Transcription Unavailable"
    quiz_data = []

    # --- AUTO-CROP LOGIC (Max 30s) ---
    try:
        from moviepy.editor import VideoFileClip
        clip = VideoFileClip(file_location)
        if clip.duration > 30:
            logger.info(f"Video is too long ({clip.duration}s). Trimming to 30s...")
            trimmed_clip = clip.subclip(0, 30)
            temp_output = f"{UPLOAD_DIR}/trimmed_{file.filename}"
            trimmed_clip.write_videofile(temp_output, codec="libx264", audio_codec="aac", logger=None)
            clip.close()
            trimmed_clip.close()
            os.remove(file_location)
            os.rename(temp_output, file_location)
            logger.info("Video trimmed successfully.")
        else:
            clip.close()
            
        # --- AI PROCESSING (Transcribe & Quiz) ---
        logger.info("Starting AI Processing...")
        
        # 1. Extract Audio
        audio_path = f"{UPLOAD_DIR}/{file.filename}_audio.mp3"
        video = VideoFileClip(file_location)
        
        if video.audio:
            video.audio.write_audiofile(audio_path, logger=None)
            video.close()
            
            # 2. Transcribe with OpenAI Whisper
            logger.info("Transcribing with OpenAI Whisper...")
            result = whisper_model.transcribe(audio_path)
            transcript_text = result["text"]
            logger.info(f"Transcript Generated: {transcript_text[:50]}...")
            
            # Cleanup Audio
            if os.path.exists(audio_path):
                os.remove(audio_path)
        else:
            logger.warning("Video has no audio track. Skipping transcription.")
            video.close()
        
            
        # 3. Generate Quiz with Groq (Llama 3)
        from groq import Groq
        # Fixed Key (New User Key)
        groq_client = Groq(api_key="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") 
        
        # ... (Rest of Quiz Logic)
        prompt = f"""
        Based on this training video transcript, generate 3 multiple-choice quiz questions.
        Format purely as a JSON array of objects with keys: 'question', 'options' (array of 4 strings), 'correctIndex' (0-3).
        
        Transcript: "{transcript_text}"
        """
        
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.5
        )
        
        # Parse JSON from response
        try:
             # Flexible parsing if model wraps in key
            raw_json = json.loads(completion.choices[0].message.content)
            if "questions" in raw_json:
                quiz_data = raw_json["questions"]
            elif isinstance(raw_json, list):
                quiz_data = raw_json
            else:
                 # Last ditch effort if wrapped in another key
                quiz_data = list(raw_json.values())[0]
                
            logger.info(f"Quiz Generated: {len(quiz_data)} questions")
        except Exception as json_err:
            logger.error(f"Quiz JSON Parse Error: {json_err}")

    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        logger.error(f"Error processing AI tasks: {e}")
        logger.error(error_msg)
        with open("server_error.log", "a") as f:
            f.write(f"\n--- Error at {datetime.now()} ---\n")
            f.write(error_msg)
            f.write("\n----------------------------\n")
        # Proceed even if AI fails
    
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

@app.post("/notify")
async def send_notification(payload: dict):
    """
    Broadcasts a system-wide notification AND stores it.
    """
    import uuid
    from datetime import datetime
    
    # 1. Create Notification Object
    notif_id = str(uuid.uuid4())
    notification_data = {
        "id": notif_id,
        "title": payload.get("title", "Notification"),
        "message": payload.get("message", ""),
        "type": payload.get("type", "info"),
        "data": payload.get("data", {}),
        "created_at": datetime.now().isoformat(),
        "read_by": [] # List of user IDs who read it
    }
    
    # 2. Store in Memory
    notification_store.insert(0, notification_data)
    
    # 3. Broadcast
    logger.info(f"Broadcasting Notification: {payload}")
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
        You are an Indian customer calling customer support. The user is the support agent.
        
        TASK:
        1.  Analyze the User's response for empathy, politeness, and problem solving.
        2.  Generate a Score (0-100) based on their performance.
        3.  Provide a short, constructive TIP on how they could improve (max 10 words).
        4.  Continue the roleplay conversation as the customer. Speak naturally in Hinglish.
        
        OUTPUT FORMAT (JSON ONLY):
        {
            "customer_response": "Arre why are you late? ...",
            "mood_score": 20,
            "user_score": 75,
            "improvement_tip": "Be more apologetic."
        }
        """
        
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history[-5:]: # Context
            # Filter only text content for simplicity in prompt context
             messages.append({"role": "user" if msg['sender'] == 'user' else "assistant", "content": msg['text']})
             
        messages.append({"role": "user", "content": user_text})

        logger.info("Sending request to Groq...")
        
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
        "angry": {"prompt": "You are ANGRY because your food arrived cold. Start the partial conversation complaining loudly in Hinglish.", "mood": 20},
        "happy": {"prompt": "You are HAPPY because the service was super fast. Start by praising the agent in Hinglish.", "mood": 90},
        "confused": {"prompt": "You are CONFUSED about a charge on your bill. Start by asking politely but worriedly in Hinglish.", "mood": 50},
        "default": {"prompt": "You are a customer calling support. Start with a generic issue.", "mood": 50}
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
        
        # 2. TRANSCRIBE (WHISPER)
        segments, info = whisper_model.transcribe(temp_filename, beam_size=5, language="en")
        user_text = "".join([s.text for s in segments]).strip()
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

if __name__ == "__main__":
    import uvicorn
    # Run with: python server.py
    print(f"Server starting on http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT)
