from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import json
import os
import uuid
import base64
import requests
import logging
import shutil
from datetime import datetime
from groq import Groq
from app.config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/roleplay", tags=["Roleplay"])

# --- MODELS ---
class StartRequest(BaseModel):
    scenario_id: str

class RoleplayRequest(BaseModel):
    user_text: str
    history: List[dict] = []

# --- IN-MEMORY STORAGE (Matches legacy implementation) ---
simulation_history = []

# --- HELPER: Process Roleplay Logic ---
async def process_roleplay_logic(user_text: str, history: List[dict]):
    # 1. TEXT GENERATION (GROQ)
    try:
        # Use settings
        api_key = settings.GROQ_API_KEY
        if not api_key:
             # Fallback to logger if key missing and return mock
             logger.error("GROQ_API_KEY not set")
             return {
                "customer_response": "System Error: AI Key missing.",
                "mood_score": 0,
                "user_score": 0,
                "improvement_tip": "Check server config."
            }

        groq_client = Groq(api_key=api_key)
        
        system_prompt = """
        You are an angry Indian customer at 'The Belgian Waffle Co.'.
        The user is the store manager or support agent trying to resolve your complaint.

        CONTEXT:
        - You ordered a 'Triple Chocolate Waffle' 45 minutes ago via Swiggy/Zomato.
        - The delivery arrived VERY LATE, and the waffle was COLD and SOGGY.
        - You are extremely frustrated, hungry, and considering leaving a bad review.
        - You speak naturally in Hinglish (Hindi + English mix), using colloquial terms like "Arre yaar", "Bhai", "Matlab", etc.
        
        TASK:
        1. Act like a real person in a chat. Keep responses CONCISE (1-3 sentences).
        2. Analyze the User's response for: EMPATHY, POLITENESS, PROBLEM-SOLVING, and PROFESSIONALISM.
        3. Generate a Score (0-100) based on their overall performance.
        4. MEASURE EMPATHY (0-100): Did they acknowledge your feelings?
        5. RESOLUTION PROGRESS (0-100):
           - 0-20: No resolution
           - 21-50: Acknowledged but no fix
           - 51-80: Partial fix
           - 81-100: Full resolution (refund/replace)
        6. Provide a short TIP (max 10 words).
        7. Continue the roleplay naturally. If they fix it, calm down. If bureaucratic, get annoyed.
        
        OUTPUT FORMAT (JSON ONLY):
        {
            "customer_response": "Arre yaar, this is too much! I am waiting since 1 hour!",
            "mood_score": 20,
            "user_score": 75,
            "empathy_score": 60,
            "resolution_progress": 30,
            "improvement_tip": "Offer immediate refund."
        }
        """
        
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history[-5:]: # Context
            # Filter only text content for simplicity in prompt context
             sender = "user" if msg.get('sender', 'ai') == 'user' else "assistant"
             content = msg.get('text', '')
             if content:
                messages.append({"role": sender, "content": content})
             
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
        
        # 2. GENERATE AUDIO (Edge TTS - Free & Lightweight)
        if "customer_response" in result_json:
            audio_b64 = await generate_edge_tts_audio(result_json["customer_response"])
            result_json["audio_base64"] = audio_b64
            
        return result_json

    except Exception as e:
        logger.error(f"Roleplay Logic Error: {e}")
        return {
            "customer_response": "Check internet connection or server logs...",
            "mood_score": 0,
            "user_score": 0,
            "improvement_tip": "Error"
        }

async def generate_edge_tts_audio(text):
    """
    Generate audio from text using edge-tts (Free, Neural, Lightweight).
    Replaces ElevenLabs to avoid payment/limits.
    """
    import edge_tts
    import tempfile

    # Use a high-quality Indian English voice. 
    # Options: en-IN-PrabhatNeural (Male), en-IN-NeerjaNeural (Female)
    VOICE = "en-IN-PrabhatNeural" 
    
    try:
        # Rate adjusted to +15% for faster, more natural speed
        communicate = edge_tts.Communicate(text, VOICE, rate="+15%")
        
        # Save to a temporary file first (edge-tts requires this or stream handling)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_file:
            temp_path = tmp_file.name
            
        await communicate.save(temp_path)
        
        # Read back and convert to base64
        with open(temp_path, "rb") as f:
            audio_content = f.read()
            
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        return base64.b64encode(audio_content).decode('utf-8')

    except Exception as e:
        logger.error(f"EdgeTTS Generation Error: {e}")
        return None


# --- ENDPOINTS ---

@router.post("/start")
async def start_roleplay(request: StartRequest):
    logger.info(f"--- START SIMULATION ({request.scenario_id}) ---")
    
    scenarios = {
        "late_order": {"prompt": "Start by complaining loudly in Hinglish about your late waffle order.", "mood": 20},
        "wrong_item": {"prompt": "Start by saying you received a plain waffle instead of chocolate. Be annoyed.", "mood": 30},
        "default": {"prompt": "Start by complaining about cold waffles delivered late.", "mood": 20}
    }
    
    scenario = scenarios.get(request.scenario_id, scenarios["default"])
    
    # Generate Opening Line
    result = await process_roleplay_logic(scenario["prompt"], []) 
    result["mood"] = scenario["mood"] # Force initial mood
    return result

@router.post("/")
async def roleplay_text(request: RoleplayRequest):
    logger.info(f"--- TEXT RQ ---")
    return await process_roleplay_logic(request.user_text, request.history)

@router.post("/voice")
async def roleplay_voice(file: UploadFile = File(...), history: str = Form("[]")):
    logger.info(f"--- VOICE RQ ---")
    
    # 1. SAVE TEMP FILE
    temp_filename = f"temp_{uuid.uuid4()}.m4a"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 2. TRANSCRIBE (Using Groq Whisper API)
        # Import here to avoid circular imports if ai_services is used elsewhere
        from app.services.ai_service import AIService
        ai_service = AIService()
        
        try:
            # Reusing the existing service logic from new backend if available
            # Note: AIService.transcribe_audio takes audio_bytes or path?
            # Let's check AIService in new backend quickly.
            # Assuming similar interface or valid implementation.
            # If not available, we use logic similar to old backend inline.
            
            # Use Groq client directly for consistency with old logic reference
            client = Groq(api_key=settings.GROQ_API_KEY)
            with open(temp_filename, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-large-v3",
                    language="en", 
                    prompt="Hindi code-switching, restaurant operations context.",
                    response_format="verbose_json"
                )
            user_text = transcription.text.strip()
            logger.info(f"Transcribed: {user_text[:80]}...")
            
        except Exception as transcribe_err:
            logger.error(f"Transcription error: {transcribe_err}")
            user_text = ""
        
        # Cleanup
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

        if not user_text:
            return {"error": "Could not understand audio"}

        # 3. PROCESS
        try:
            history_list = json.loads(history)
        except:
            history_list = []
            
        ai_result = await process_roleplay_logic(user_text, history_list)
        ai_result["user_transcription"] = user_text
        return ai_result

    except Exception as e:
        logger.error(f"Voice Processing Error: {e}")
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return {"error": f"Voice Processing Failed: {str(e)}"}

@router.get("/history")
async def get_simulation_history():
    return simulation_history[::-1] # Newest first
