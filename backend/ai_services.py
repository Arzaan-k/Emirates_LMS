"""
AI Services for LMS Backend
Centralized AI operations using Groq API
Replaces local Whisper and Sentence-Transformer models
"""

import os
import json
import logging
import base64
from typing import Optional, List, Dict, Any
from groq import Groq

logger = logging.getLogger("BW_LMS_AI")

# Groq Configuration
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

# Models
CHAT_MODEL = "llama-3.3-70b-versatile"  # For quiz generation, translation, etc.
WHISPER_MODEL = "whisper-large-v3"  # For audio transcription


def get_groq_client() -> Groq:
    """Get Groq client instance."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable is not set")
    return Groq(api_key=GROQ_API_KEY)


# ==========================================
# AUDIO TRANSCRIPTION (Replaces Local Whisper)
# ==========================================

def transcribe_audio(audio_file_path: str, language: str = "en") -> Dict[str, Any]:
    """
    Transcribe audio file using Groq's Whisper API.

    Args:
        audio_file_path: Path to audio file (mp3, wav, m4a, etc.)
        language: Language code (default: "en")

    Returns:
        Dict with 'text' (transcript) and 'segments' (if available)
    """
    try:
        client = get_groq_client()

        with open(audio_file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=audio_file,
                model=WHISPER_MODEL,
                language=language,
                response_format="verbose_json"
            )

        result = {
            "text": transcription.text,
            "language": transcription.language if hasattr(transcription, 'language') else language,
            "duration": transcription.duration if hasattr(transcription, 'duration') else None,
            "segments": []
        }

        # Extract segments if available
        if hasattr(transcription, 'segments') and transcription.segments:
            result["segments"] = [
                {
                    "start": seg.start if hasattr(seg, 'start') else 0,
                    "end": seg.end if hasattr(seg, 'end') else 0,
                    "text": seg.text if hasattr(seg, 'text') else ""
                }
                for seg in transcription.segments
            ]

        logger.info(f"Transcription completed: {len(result['text'])} characters")
        return result

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise


def transcribe_audio_bytes(audio_bytes: bytes, filename: str = "audio.mp3", language: str = "en") -> Dict[str, Any]:
    """
    Transcribe audio from bytes using Groq's Whisper API.

    Args:
        audio_bytes: Audio file content as bytes
        filename: Original filename (for format detection)
        language: Language code

    Returns:
        Dict with 'text' (transcript) and 'segments'
    """
    try:
        client = get_groq_client()

        # Create a file-like object from bytes
        import io
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename

        transcription = client.audio.transcriptions.create(
            file=(filename, audio_file),
            model=WHISPER_MODEL,
            language=language,
            response_format="verbose_json"
        )

        result = {
            "text": transcription.text,
            "language": transcription.language if hasattr(transcription, 'language') else language,
            "duration": transcription.duration if hasattr(transcription, 'duration') else None,
        }

        logger.info(f"Transcription completed: {len(result['text'])} characters")
        return result

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise


# ==========================================
# QUIZ GENERATION
# ==========================================

def generate_quiz_from_transcript(
    transcript: str,
    num_questions: int = 5,
    difficulty: str = "medium"
) -> List[Dict[str, Any]]:
    """
    Generate quiz questions from a transcript using Groq.

    Args:
        transcript: Text content to generate quiz from
        num_questions: Number of questions to generate
        difficulty: 'easy', 'medium', or 'hard'

    Returns:
        List of question dictionaries with 'question', 'options', 'correctIndex'
    """
    try:
        client = get_groq_client()

        prompt = f"""Based on the following transcript, generate {num_questions} multiple-choice quiz questions.
Difficulty level: {difficulty}

TRANSCRIPT:
{transcript[:8000]}  # Limit to avoid token limits

REQUIREMENTS:
1. Each question should test understanding of the content
2. Provide exactly 4 options for each question
3. Options should be plausible but only one correct
4. Vary the position of correct answers (0, 1, 2, or 3)

RESPONSE FORMAT (JSON array only, no markdown):
[
  {{
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0
  }}
]

Return ONLY the JSON array, no other text."""

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=4000
        )

        content = response.choices[0].message.content.strip()

        # Clean up response (remove markdown if present)
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()

        questions = json.loads(content)

        # Validate structure
        validated_questions = []
        for q in questions:
            if all(k in q for k in ["question", "options", "correctIndex"]):
                if len(q["options"]) == 4 and 0 <= q["correctIndex"] <= 3:
                    validated_questions.append({
                        "question": str(q["question"]),
                        "options": [str(o) for o in q["options"]],
                        "correctIndex": int(q["correctIndex"])
                    })

        logger.info(f"Generated {len(validated_questions)} quiz questions")
        return validated_questions[:num_questions]

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse quiz JSON: {e}")
        return []
    except Exception as e:
        logger.error(f"Quiz generation error: {e}")
        raise


# ==========================================
# TEXT EMBEDDINGS (For RAG)
# ==========================================

# Simple in-memory embedding cache
_embedding_cache: Dict[str, List[float]] = {}


def get_text_embedding(text: str, use_cache: bool = True) -> List[float]:
    """
    Get embedding vector for text using Groq.

    Note: Groq doesn't have a dedicated embedding API, so we use a workaround
    with the chat model to generate semantic representations.
    For production, consider using OpenAI embeddings or dedicated embedding services.

    Args:
        text: Text to embed
        use_cache: Whether to use cached embeddings

    Returns:
        List of floats representing the embedding vector
    """
    # Check cache
    cache_key = text[:500]  # Use first 500 chars as key
    if use_cache and cache_key in _embedding_cache:
        return _embedding_cache[cache_key]

    try:
        client = get_groq_client()

        # Use a prompt to extract key concepts (pseudo-embedding)
        prompt = f"""Extract the 10 most important semantic keywords/concepts from this text.
Return ONLY a JSON array of strings, no other text.

Text: {text[:2000]}

Example response: ["keyword1", "keyword2", ...]"""

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=500
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()

        keywords = json.loads(content)

        # Create a simple hash-based embedding (for demonstration)
        # In production, use a proper embedding service
        embedding = create_simple_embedding(keywords, text)

        # Cache result
        if use_cache:
            _embedding_cache[cache_key] = embedding

        return embedding

    except Exception as e:
        logger.error(f"Embedding error: {e}")
        # Return a default embedding on error
        return [0.0] * 384


def create_simple_embedding(keywords: List[str], text: str) -> List[float]:
    """
    Create a simple embedding vector from keywords.
    This is a placeholder - for production, use a proper embedding model.
    """
    import hashlib

    # Create 384-dimensional vector (matches all-MiniLM-L6-v2)
    embedding = [0.0] * 384

    # Hash-based approach for each keyword
    for i, keyword in enumerate(keywords[:10]):
        hash_val = int(hashlib.md5(keyword.encode()).hexdigest(), 16)
        for j in range(38):  # Fill ~38 dimensions per keyword
            idx = (i * 38 + j) % 384
            embedding[idx] = ((hash_val >> j) & 1) * 2 - 1  # -1 or 1

    # Normalize
    import math
    norm = math.sqrt(sum(x*x for x in embedding)) or 1
    embedding = [x / norm for x in embedding]

    return embedding


# ==========================================
# TEXT TRANSLATION
# ==========================================

def translate_text(text: str, target_language: str) -> str:
    """
    Translate text to target language using Groq.

    Args:
        text: Text to translate
        target_language: Target language (e.g., "Hindi", "Spanish")

    Returns:
        Translated text
    """
    try:
        client = get_groq_client()

        prompt = f"""Translate the following text into {target_language}.
Preserve the original meaning and tone.
Return ONLY the translated text, no preamble or explanation.

Text to translate:
{text}"""

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=4000
        )

        translated = response.choices[0].message.content.strip()
        logger.info(f"Translated {len(text)} chars to {target_language}")
        return translated

    except Exception as e:
        logger.error(f"Translation error: {e}")
        raise


# ==========================================
# CONTENT SUMMARIZATION
# ==========================================

def summarize_text(text: str, max_sentences: int = 5) -> str:
    """
    Summarize text using Groq.

    Args:
        text: Text to summarize
        max_sentences: Maximum sentences in summary

    Returns:
        Summary text
    """
    try:
        client = get_groq_client()

        prompt = f"""Summarize the following text in {max_sentences} sentences or less.
Focus on the key points and main ideas.
Write in clear, professional language.

Text:
{text[:8000]}

Summary:"""

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=1000
        )

        summary = response.choices[0].message.content.strip()
        logger.info(f"Summarized {len(text)} chars to {len(summary)} chars")
        return summary

    except Exception as e:
        logger.error(f"Summarization error: {e}")
        raise


# ==========================================
# AI CHAT/Q&A
# ==========================================

def answer_question(question: str, context: str) -> str:
    """
    Answer a question based on provided context using Groq.

    Args:
        question: User's question
        context: Relevant context/transcript

    Returns:
        Answer text
    """
    try:
        client = get_groq_client()

        prompt = f"""Based on the following context, answer the user's question.
If the answer is not in the context, say "I don't have enough information to answer that."

CONTEXT:
{context[:6000]}

QUESTION: {question}

ANSWER:"""

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=1000
        )

        answer = response.choices[0].message.content.strip()
        return answer

    except Exception as e:
        logger.error(f"Q&A error: {e}")
        raise


# ==========================================
# ASSESSMENT QUESTION GENERATION
# ==========================================

def generate_assessment_questions(
    topic: str,
    num_questions: int = 10,
    difficulty: str = "medium",
    question_types: List[str] = None
) -> List[Dict[str, Any]]:
    """
    Generate assessment questions on a topic using Groq.

    Args:
        topic: Topic/subject for questions
        num_questions: Number of questions
        difficulty: 'easy', 'medium', or 'hard'
        question_types: List of types ('mcq', 'true_false', 'fill_blank')

    Returns:
        List of question dictionaries
    """
    if question_types is None:
        question_types = ["mcq"]

    try:
        client = get_groq_client()

        prompt = f"""Generate {num_questions} assessment questions about: {topic}

Difficulty: {difficulty}
Question types: {', '.join(question_types)}

REQUIREMENTS:
1. Questions should test understanding, not just memorization
2. For MCQ: provide 4 options with only one correct answer
3. Vary the difficulty within the specified level
4. Make questions clear and unambiguous

RESPONSE FORMAT (JSON array only):
[
  {{
    "question": "Question text here?",
    "type": "mcq",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Brief explanation of the correct answer"
  }}
]

Return ONLY the JSON array."""

        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=4000
        )

        content = response.choices[0].message.content.strip()

        # Clean up response
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()

        questions = json.loads(content)

        logger.info(f"Generated {len(questions)} assessment questions")
        return questions[:num_questions]

    except Exception as e:
        logger.error(f"Assessment generation error: {e}")
        raise


# ==========================================
# VOICE QUERY PROCESSING
# ==========================================

async def process_voice_query(audio_bytes: bytes, context: str = "") -> Dict[str, Any]:
    """
    Process a voice query: transcribe and answer.

    Args:
        audio_bytes: Audio data
        context: Optional context for answering

    Returns:
        Dict with 'transcription' and 'answer'
    """
    try:
        # Transcribe
        transcription = transcribe_audio_bytes(audio_bytes)

        # Answer if context provided
        answer = ""
        if context and transcription.get("text"):
            answer = answer_question(transcription["text"], context)

        return {
            "transcription": transcription.get("text", ""),
            "answer": answer
        }

    except Exception as e:
        logger.error(f"Voice query error: {e}")
        raise


# ==========================================
# HEALTH CHECK
# ==========================================

def check_ai_services_health() -> Dict[str, Any]:
    """
    Check if AI services are operational.

    Returns:
        Dict with service status
    """
    status = {
        "groq_api": False,
        "transcription": False,
        "chat": False,
        "error": None
    }

    try:
        client = get_groq_client()

        # Test chat completion
        response = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": "Say 'OK' only."}],
            max_tokens=10
        )

        if response.choices[0].message.content:
            status["groq_api"] = True
            status["chat"] = True
            status["transcription"] = True  # Same API

    except Exception as e:
        status["error"] = str(e)

    return status
