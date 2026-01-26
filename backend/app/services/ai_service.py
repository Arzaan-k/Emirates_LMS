"""
AI Service
Business logic for AI-powered features using Groq API
"""

import logging
import json
import re
from typing import Any, Dict, List, Optional

from groq import Groq

from app.config.settings import settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)


class AIService:
    """Service for AI-powered features."""

    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = settings.GROQ_MODEL
        self.whisper_model = settings.GROQ_WHISPER_MODEL

    # ===========================================
    # TRANSCRIPTION
    # ===========================================

    def transcribe_audio(self, audio_file_path: str) -> str:
        """
        Transcribe audio file using Groq's Whisper.

        Args:
            audio_file_path: Path to the audio file

        Returns:
            Transcribed text
        """
        try:
            with open(audio_file_path, "rb") as audio_file:
                response = self.client.audio.transcriptions.create(
                    model=self.whisper_model,
                    file=audio_file,
                    response_format="text",
                )
            return response
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            raise ExternalServiceError(
                service="Groq Whisper",
                detail="Failed to transcribe audio",
                original_error=str(e)
            )

    # ===========================================
    # QUIZ GENERATION
    # ===========================================

    def generate_quiz_from_transcript(
        self,
        transcript: str,
        num_questions: int = 5,
        difficulty: str = "medium"
    ) -> List[Dict[str, Any]]:
        """
        Generate quiz questions from a transcript.

        Args:
            transcript: Text transcript
            num_questions: Number of questions to generate
            difficulty: easy, medium, or hard

        Returns:
            List of question objects
        """
        difficulty_guidance = {
            "easy": "basic understanding and recall",
            "medium": "comprehension and application",
            "hard": "analysis, synthesis, and critical thinking"
        }

        prompt = f"""Generate exactly {num_questions} multiple-choice quiz questions based on the following content.
The questions should test {difficulty_guidance.get(difficulty, 'comprehension')}.

Content:
{transcript[:4000]}

Return ONLY a valid JSON array with this exact structure:
[
  {{
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Brief explanation of the correct answer"
  }}
]

Important:
- Generate exactly {num_questions} questions
- Each question must have exactly 4 options
- correctIndex is 0-indexed (0, 1, 2, or 3)
- Questions should be clear and unambiguous
- Return ONLY the JSON array, no other text
"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional quiz creator. Generate high-quality multiple-choice questions. Always return valid JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                max_tokens=2000,
            )

            content = response.choices[0].message.content.strip()

            # Extract JSON from response
            questions = self._parse_json_response(content)

            # Validate and fix questions
            validated_questions = []
            for q in questions[:num_questions]:
                if self._validate_question(q):
                    validated_questions.append(q)

            if not validated_questions:
                raise ValueError("No valid questions generated")

            logger.info(f"Generated {len(validated_questions)} quiz questions")
            return validated_questions

        except Exception as e:
            logger.error(f"Quiz generation error: {e}")
            raise ExternalServiceError(
                service="Groq LLM",
                detail="Failed to generate quiz questions",
                original_error=str(e)
            )

    def generate_quiz_from_topic(
        self,
        topic: str,
        num_questions: int = 5,
        difficulty: str = "medium"
    ) -> List[Dict[str, Any]]:
        """Generate quiz questions from a topic."""
        prompt = f"""Generate {num_questions} multiple-choice quiz questions about: {topic}

Return ONLY a valid JSON array with this exact structure:
[
  {{
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Brief explanation of the correct answer"
  }}
]

Make questions informative and educational. Return ONLY the JSON array.
"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional educator creating quiz questions."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                max_tokens=2000,
            )

            content = response.choices[0].message.content.strip()
            questions = self._parse_json_response(content)

            validated = [q for q in questions[:num_questions] if self._validate_question(q)]

            logger.info(f"Generated {len(validated)} questions for topic: {topic}")
            return validated

        except Exception as e:
            logger.error(f"Topic quiz generation error: {e}")
            raise ExternalServiceError(
                service="Groq LLM",
                detail="Failed to generate quiz questions",
                original_error=str(e)
            )

    # ===========================================
    # CHATBOT / Q&A
    # ===========================================

    def answer_question(
        self,
        question: str,
        context: Optional[str] = None,
        conversation_history: Optional[List[Dict]] = None
    ) -> str:
        """
        Answer a question, optionally with context.

        Args:
            question: User's question
            context: Optional context (e.g., course transcript)
            conversation_history: Previous messages

        Returns:
            Answer text
        """
        messages = [
            {
                "role": "system",
                "content": """You are a helpful learning assistant for a corporate training platform.
Provide clear, concise, and accurate answers.
If you're given context, base your answer on that context.
If you don't know the answer, say so honestly."""
            }
        ]

        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history[-10:])  # Last 10 messages

        # Add context if provided
        if context:
            messages.append({
                "role": "user",
                "content": f"Context: {context[:3000]}\n\nQuestion: {question}"
            })
        else:
            messages.append({
                "role": "user",
                "content": question
            })

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=1000,
            )

            answer = response.choices[0].message.content.strip()
            return answer

        except Exception as e:
            logger.error(f"Chatbot error: {e}")
            raise ExternalServiceError(
                service="Groq LLM",
                detail="Failed to generate response",
                original_error=str(e)
            )

    # ===========================================
    # TRANSLATION
    # ===========================================

    def translate_text(self, text: str, target_language: str) -> str:
        """
        Translate text to target language.

        Args:
            text: Text to translate
            target_language: Target language (e.g., "Hindi", "Spanish")

        Returns:
            Translated text
        """
        prompt = f"""Translate the following text to {target_language}.
Return ONLY the translation, no explanations.

Text:
{text[:3000]}
"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional translator. Provide accurate translations."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,
                max_tokens=3000,
            )

            translation = response.choices[0].message.content.strip()
            return translation

        except Exception as e:
            logger.error(f"Translation error: {e}")
            raise ExternalServiceError(
                service="Groq LLM",
                detail="Failed to translate text",
                original_error=str(e)
            )

    def detect_language(self, text: str) -> str:
        """Detect the language of text."""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": f"What language is this text? Return only the language name:\n{text[:500]}"
                    }
                ],
                temperature=0.1,
                max_tokens=20,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Language detection error: {e}")
            return "Unknown"

    # ===========================================
    # CONTENT SUMMARIZATION
    # ===========================================

    def summarize_text(
        self,
        text: str,
        max_length: int = 200,
        style: str = "paragraph"
    ) -> str:
        """
        Summarize text.

        Args:
            text: Text to summarize
            max_length: Approximate max length in words
            style: "paragraph" or "bullets"

        Returns:
            Summary text
        """
        style_instruction = (
            "as a concise paragraph" if style == "paragraph"
            else "as bullet points"
        )

        prompt = f"""Summarize the following text {style_instruction} in approximately {max_length} words:

{text[:4000]}
"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You create clear, informative summaries."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.5,
                max_tokens=500,
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            logger.error(f"Summarization error: {e}")
            raise ExternalServiceError(
                service="Groq LLM",
                detail="Failed to summarize text",
                original_error=str(e)
            )

    # ===========================================
    # HELPER METHODS
    # ===========================================

    def _parse_json_response(self, content: str) -> List[Dict]:
        """Parse JSON from LLM response."""
        # Try direct JSON parse
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON array from response
        json_match = re.search(r'\[[\s\S]*\]', content)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        # Try to extract JSON object
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            try:
                result = json.loads(json_match.group())
                if isinstance(result, dict):
                    return [result]
                return result
            except json.JSONDecodeError:
                pass

        logger.warning(f"Could not parse JSON from response: {content[:200]}")
        return []

    def _validate_question(self, question: Dict) -> bool:
        """Validate a question object."""
        required_fields = ["question", "options", "correctIndex"]

        for field in required_fields:
            if field not in question:
                return False

        if not isinstance(question["options"], list):
            return False

        if len(question["options"]) < 2:
            return False

        if not isinstance(question["correctIndex"], int):
            return False

        if question["correctIndex"] < 0 or question["correctIndex"] >= len(question["options"]):
            return False

        return True

    def get_rag_status(self) -> Dict[str, Any]:
        """Get RAG system status."""
        return {
            "status": "active",
            "model": self.model,
            "whisper_model": self.whisper_model,
            "rag_enabled": False,
            "message": "RAG system is not enabled"
        }

    async def generate_quiz_from_text(
        self,
        text: str,
        num_questions: int = 5,
        difficulty: str = "medium"
    ) -> List[Dict[str, Any]]:
        """Generate quiz questions from text (async wrapper)."""
        return self.generate_quiz_from_transcript(text, num_questions, difficulty)

    async def extract_text_from_file(
        self,
        file_content: bytes,
        filename: str
    ) -> str:
        """Extract text from an uploaded file."""
        import tempfile
        import os

        extension = filename.split('.')[-1].lower() if '.' in filename else ''

        if extension in ['txt', 'md']:
            return file_content.decode('utf-8', errors='ignore')

        if extension == 'pdf':
            try:
                import PyPDF2
                import io
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
                text_parts = []
                for page in pdf_reader.pages:
                    text_parts.append(page.extract_text())
                return '\n'.join(text_parts)
            except Exception as e:
                logger.warning(f"PDF extraction failed: {e}")
                return ""

        if extension in ['mp4', 'mp3', 'wav', 'm4a', 'webm']:
            # Save to temp file and transcribe
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{extension}') as f:
                    f.write(file_content)
                    temp_path = f.name

                transcript = self.transcribe_audio(temp_path)
                os.unlink(temp_path)
                return transcript
            except Exception as e:
                logger.warning(f"Audio transcription failed: {e}")
                return ""

        return file_content.decode('utf-8', errors='ignore')
