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
    context: Optional[str] = "delayed_flight"

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
        You are an angry passenger at Emirates Airlines.
        The user is the cabin crew member, ground staff or customer service agent trying to resolve your complaint.

        CONTEXT:
        - Your flight EK507 from Mumbai to Dubai was delayed by 4 hours with no clear communication.
        - You missed your connecting flight to London and now you're stranded at Dubai airport.
        - You are extremely frustrated, tired after a long journey, and considering filing a formal complaint.
        - You speak naturally, expressing frustration professionally but firmly.
        
        TASK:
        1. Act like a real frustrated premium passenger in a chat. Keep responses CONCISE (1-3 sentences).
        2. Analyze the User's response for: EMPATHY, POLITENESS, PROBLEM-SOLVING, and PROFESSIONALISM.
        3. Generate a Score (0-100) based on their overall performance.
        4. MEASURE EMPATHY (0-100): Did they acknowledge your feelings?
        5. RESOLUTION PROGRESS (0-100):
           - 0-20: No resolution
           - 21-50: Acknowledged but no fix
           - 51-80: Partial fix (rebooking offered)
           - 81-100: Full resolution (rebooking + lounge access + compensation)
        6. Provide a short TIP (max 10 words).
        7. Continue the roleplay naturally. If they fix it, calm down. If bureaucratic, get annoyed.
        
        OUTPUT FORMAT (JSON ONLY):
        {
            "customer_response": "This is unacceptable! I've been waiting for 4 hours with no information!",
            "mood_score": 20,
            "user_score": 75,
            "empathy_score": 60,
            "resolution_progress": 30,
            "improvement_tip": "Offer immediate rebooking."
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


# --- HELPER: Process Roleplay Logic with Context ---
async def process_roleplay_logic_with_context(user_text: str, history: List[dict], context: str = "delayed_flight"):
    """
    Process roleplay with scenario-specific context.
    Context options: 'delayed_flight', 'payment_trouble', 'positive_feedback'
    """
    try:
        api_key = settings.GROQ_API_KEY
        if not api_key:
            logger.error("GROQ_API_KEY not set")
            return {
                "customer_response": "System Error: AI Key missing.",
                "mood_score": 0,
                "user_score": 0,
                "improvement_tip": "Check server config."
            }

        groq_client = Groq(api_key=api_key)
        
        # Context-specific system prompts
        system_prompts = {
            "delayed_flight": """
You are an ANGRY passenger at Emirates Airlines.
The user is the cabin crew member, ground staff or customer service agent trying to resolve your complaint.

CONTEXT:
- Your flight EK507 from Mumbai to Dubai was delayed by 4 hours with no clear communication.
- You missed your connecting flight to London and now you're stranded at Dubai airport.
- You are extremely frustrated, tired after a long journey, and considering filing a formal complaint.
- You speak naturally, expressing frustration professionally but firmly.

TASK:
1. Act like a real frustrated premium passenger in a chat. Keep responses CONCISE (1-3 sentences).
2. Analyze the User's response for: EMPATHY, POLITENESS, PROBLEM-SOLVING, and PROFESSIONALISM.
3. Generate a Score (0-100) based on their overall performance.
4. RESOLUTION PROGRESS (0-100):
   - 0-20: No resolution
   - 21-50: Acknowledged but no fix
   - 51-80: Partial fix (rebooking offered)
   - 81-100: Full resolution (rebooking + lounge access + compensation)
5. Provide a short TIP (max 10 words).
6. Continue the roleplay naturally. If they fix it, calm down. If bureaucratic, get angrier!

OUTPUT FORMAT (JSON ONLY):
{
    "customer_response": "This is unacceptable! I've been waiting 4 hours with no updates!",
    "mood_score": 20,
    "user_score": 75,
    "empathy_score": 60,
    "resolution_progress": 30,
    "improvement_tip": "Offer immediate rebooking."
}
""",
            "payment_trouble": """
You are a CONFUSED passenger at Emirates Airlines having BOOKING/PAYMENT issues.
The user is the customer service agent trying to help you.

CONTEXT:
- You booked a Business Class ticket worth AED 8,500 on the Emirates app.
- The payment screen showed "failed" but money was deducted from your account!
- OR you were charged TWICE for the same booking.
- You're not angry, just confused and worried about your money.
- You speak naturally, politely asking for clarification.

TASK:
1. Act like a real confused person who needs help understanding. Keep responses CONCISE (1-3 sentences).
2. Analyze the User's response for: CLARITY, HELPFULNESS, PATIENCE, and REASSURANCE.
3. Generate a Score (0-100) based on their overall performance.
4. RESOLUTION PROGRESS (0-100):
   - 0-20: No clarity provided
   - 21-50: Acknowledged issue but no solution
   - 51-80: Explained the situation, working on fix
   - 81-100: Full resolution (refund initiated/confirmed)
5. Provide a short TIP (max 10 words).
6. Continue the roleplay naturally. If they help, show relief. If confusing, stay worried.

OUTPUT FORMAT (JSON ONLY):
{
    "customer_response": "I don't understand... my payment was deducted twice for the same flight?",
    "mood_score": 50,
    "user_score": 75,
    "empathy_score": 60,
    "resolution_progress": 30,
    "improvement_tip": "Confirm payment status clearly."
}
""",
            "positive_feedback": """
You are a HAPPY loyal passenger at Emirates Airlines giving POSITIVE FEEDBACK.
The user is the cabin crew or customer service agent receiving your appreciation.

CONTEXT:
- You are a frequent flyer who loves Emirates.
- Your flight today was AMAZING - smooth, comfortable, and the service was exceptional!
- The cabin crew was attentive and the in-flight entertainment was superb.
- You want to share your positive experience and maybe get recognized for loyalty.
- You speak naturally, expressing genuine happiness.

TASK:
1. Act like a genuinely happy passenger. Keep responses CONCISE (1-3 sentences).
2. Analyze the User's response for: GRATITUDE, ENGAGEMENT, PROFESSIONALISM, and BRAND BUILDING.
3. Generate a Score (0-100) based on their overall performance.
4. HAPPINESS LEVEL (0-100): How happy are you with their response?
5. Provide a short TIP (max 10 words).
6. Continue the roleplay naturally. If they're warm, share more love. If dismissive, be slightly disappointed.

OUTPUT FORMAT (JSON ONLY):
{
    "customer_response": "The service on EK507 was absolutely phenomenal! Best flight ever!",
    "mood_score": 85,
    "user_score": 80,
    "empathy_score": 70,
    "resolution_progress": 80,
    "improvement_tip": "Offer loyalty upgrade."
}
"""
        }
        
        system_prompt = system_prompts.get(context, system_prompts["delayed_flight"])
        
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history[-5:]:
            sender = "user" if msg.get('sender', 'ai') == 'user' else "assistant"
            content = msg.get('text', '')
            if content:
                messages.append({"role": sender, "content": content})
             
        messages.append({"role": "user", "content": user_text})

        logger.info(f"Sending request to Groq (context: {context})...")
        
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
        
        # Generate Audio
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
    
    # Scenarios mapped to frontend IDs from SimulationHub.js:
    # { id: 'angry', title: 'Delayed Flight', subtitle: 'Frustrated Passenger' }
    # { id: 'confused', title: 'Booking Issue', subtitle: 'Confused Passenger' }
    # { id: 'happy', title: 'Positive Feedback', subtitle: 'Loyal Passenger' }
    
    scenarios = {
        # Delayed Flight - Frustrated Passenger
        "angry": {
            "prompt": "You are a FRUSTRATED premium passenger. Start by complaining firmly about your Emirates flight EK507 that was delayed 4 hours, causing you to miss your connecting flight to London. You are stranded at Dubai airport. Be very frustrated. Say something like 'This is unacceptable! 4 hours delayed and I missed my connection to London!'",
            "mood": 20,
            "context": "delayed_flight"
        },
        # Booking Issue - Confused Passenger  
        "confused": {
            "prompt": "You are a CONFUSED passenger having booking/payment issues with Emirates. Start by explaining your problem - you've been charged twice for your Business Class ticket, or the payment failed but money was deducted. You're not angry, just confused and need help understanding what happened. Say something like 'I don't understand... my payment was deducted twice for the same booking?'",
            "mood": 50,
            "context": "payment_trouble"
        },
        # Positive Feedback - Loyal Passenger
        "happy": {
            "prompt": "You are a HAPPY loyal Emirates frequent flyer who wants to give positive feedback! Start by expressing your appreciation. You love Emirates, the flights are always comfortable, and you wanted to share your good experience. Say something like 'I just had the most amazing flight! The crew on EK507 were absolutely phenomenal!'",
            "mood": 85,
            "context": "positive_feedback"
        },
        # Legacy IDs (keep for backward compatibility)
        "late_order": {
            "prompt": "Start by complaining about your delayed Emirates flight.", 
            "mood": 20,
            "context": "delayed_flight"
        },
        "wrong_item": {
            "prompt": "Start by saying you received wrong seat assignment despite booking First Class. Be annoyed.", 
            "mood": 30,
            "context": "delayed_flight"
        },
        "default": {
            "prompt": "Start by complaining about a delayed Emirates flight and missed connection.", 
            "mood": 20,
            "context": "delayed_flight"
        }
    }
    
    scenario = scenarios.get(request.scenario_id, scenarios["default"])
    
    # Generate Opening Line with scenario-specific context
    result = await process_roleplay_logic_with_context(scenario["prompt"], [], scenario.get("context", "delayed_flight"))
    result["mood"] = scenario["mood"]  # Force initial mood
    return result

@router.post("/")
async def roleplay_text(request: RoleplayRequest):
    logger.info(f"--- TEXT RQ (Context: {request.context}) ---")
    return await process_roleplay_logic_with_context(request.user_text, request.history, request.context)

@router.post("/voice")
async def roleplay_voice(
    file: UploadFile = File(...), 
    history: str = Form("[]"),
    context: str = Form("delayed_flight")
):
    logger.info(f"--- VOICE RQ (Context: {context}) ---")
    
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
                    prompt="Hindi code-switching, airline operations context.",
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
            
        ai_result = await process_roleplay_logic_with_context(user_text, history_list, context)
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
