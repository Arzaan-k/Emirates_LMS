import os
import shutil
import asyncio
import json
import logging
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# --- CONFIGURATION ---
PORT = 8000
HOST = "0.0.0.0"
BASE_URL = f"http://192.168.1.35:{PORT}" # UPDATE THIS IP IF IT CHANGES

# --- LOGGING ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BW_LMS_Backend")

# --- LOAD AI MODELS ---
import whisper
logger.info("Loading Whisper Model...")
whisper_model = whisper.load_model("base")
logger.info("Whisper Model Loaded.")

# --- APP SETUP ---
app = FastAPI(title="BW LMS Realtime Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- STATIC FILES ---
# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# --- DATA MODELS ---
class ContentItem(BaseModel):
    title: str
    description: str
    videoUrl: str
    authorRole: str
    timestamp: str

# --- IN-MEMORY STORE ---
content_store: List[dict] = []

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
            trimmed_clip.write_videofile(temp_output, codec="libx264", audio_codec="aac")
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
        video.audio.write_audiofile(audio_path, logger=None)
        video.close()
        
        # 2. Transcribe with OpenAI Whisper (Local)
        logger.info("Transcribing with Whisper (Local)...")
        result = whisper_model.transcribe(audio_path)
        transcript_text = result["text"]
        logger.info(f"Transcript Generated: {transcript_text[:50]}...")
        
        # Cleanup Audio
        if os.path.exists(audio_path):
            os.remove(audio_path)
            
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
        logger.error(f"Error processing AI tasks: {e}")
        # Proceed even if AI fails
    
    # 2. Generate Public URL
    video_url = f"{BASE_URL}/uploads/{file.filename}"
    
    logger.info(f"New Content Uploaded: {title} by {authorRole} (File: {file.filename})")
    
    # 3. Create Item Object
    item_data = {
        "title": title,
        "description": description,
        "videoUrl": video_url,
        "authorRole": authorRole,
        "timestamp": timestamp,
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

@app.post("/notify")
async def send_notification(payload: dict):
    """
    Broadcasts a system-wide notification (e.g. New Quiz, Alert).
    Payload example: {"title": "New Quiz Assigned", "message": "Safety Compliance 101", "type": "quiz"}
    """
    logger.info(f"Broadcasting Notification: {payload}")
    await manager.broadcast({
        "type": "NOTIFICATION",
        "data": payload
    })
    return {"status": "success"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, maybe listen for client pings
            data = await websocket.receive_text()
            # We don't expect much input from clients in this simple version
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WS Error: {e}")
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    # Run with: python server.py
    print(f"Server starting on http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT)
