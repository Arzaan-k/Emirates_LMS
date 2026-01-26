"""
Quiz Schemas
Pydantic models for quiz-related API operations
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema


class QuizQuestionSchema(BaseSchema):
    """Schema for a quiz question."""
    question: str
    options: List[str] = Field(..., min_items=2, max_items=6)
    correctIndex: int = Field(..., ge=0)
    explanation: Optional[str] = None


class QuizBase(BaseSchema):
    """Base quiz schema."""
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    difficulty: Optional[str] = "medium"  # easy, medium, hard
    time_limit: Optional[str] = "10 mins"


class QuizCreate(QuizBase):
    """Schema for creating a quiz."""
    id: Optional[str] = None
    questions: List[Dict[str, Any]] = Field(..., min_items=1)
    time_limit_minutes: Optional[int] = None
    source: str = "manual"  # manual, ai_generated, imported
    category: Optional[str] = None
    tags: List[str] = []
    passing_score: int = 70


class QuizUpdate(BaseSchema):
    """Schema for updating a quiz."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    difficulty: Optional[str] = None
    time_limit: Optional[str] = None
    questions: Optional[List[Dict[str, Any]]] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None
    passing_score: Optional[int] = None


class QuizResponse(QuizBase):
    """Schema for quiz response."""
    id: str
    questions: List[Dict[str, Any]]
    time_limit_minutes: Optional[int] = None
    source: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = []
    is_active: bool = True
    passing_score: int = 70
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None


class QuizListResponse(BaseSchema):
    """Schema for quiz list."""
    quizzes: List[QuizResponse]
    total: int


# Quiz Submission Schemas
class QuizSubmissionCreate(BaseSchema):
    """Schema for submitting a quiz."""
    quiz_id: str
    user_name: str = Field(..., min_length=1)
    user_email: Optional[str] = None
    answers: List[int]  # List of selected answer indices
    time_taken_seconds: Optional[int] = None


class QuizSubmissionResponse(BaseSchema):
    """Schema for quiz submission response."""
    id: str
    quiz_id: str
    quiz_title: Optional[str] = None
    user_name: str
    user_email: Optional[str] = None
    score: float
    score_percent: Optional[float] = None
    passed: Optional[bool] = None
    correct_count: Optional[int] = None
    total_questions: Optional[int] = None
    time_taken_seconds: Optional[int] = None
    submitted_at: Optional[datetime] = None
    attempt_number: int = 1


# Quiz Generation Schemas
class QuizGenerateRequest(BaseSchema):
    """Schema for AI quiz generation request."""
    transcript: Optional[str] = None
    topic: Optional[str] = None
    num_questions: int = Field(default=5, ge=1, le=20)
    difficulty: str = "medium"  # easy, medium, hard
    language: str = "en"


class QuizGenerateResponse(BaseSchema):
    """Schema for AI quiz generation response."""
    questions: List[QuizQuestionSchema]
    topic: Optional[str] = None
    source: str = "ai_generated"


# Live Quiz Schemas
class LiveQuizCreate(BaseSchema):
    """Schema for creating a live quiz."""
    id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    difficulty: Optional[str] = "medium"
    time_limit: Optional[str] = "10 mins"
    time_limit_minutes: Optional[int] = None
    image: Optional[str] = None
    questions: List[Dict[str, Any]] = []
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class LiveQuizUpdate(BaseSchema):
    """Schema for updating a live quiz."""
    title: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[str] = None
    time_limit: Optional[str] = None
    image: Optional[str] = None
    questions: Optional[List[Dict[str, Any]]] = None
    status: Optional[str] = None  # draft, scheduled, live, completed
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_active: Optional[bool] = None


class LiveQuizResponse(BaseSchema):
    """Schema for live quiz response."""
    id: str
    title: str
    description: Optional[str] = None
    difficulty: Optional[str] = None
    time_limit: Optional[str] = None
    time_limit_minutes: Optional[int] = None
    image: Optional[str] = None
    questions: List[Dict[str, Any]] = []
    is_active: bool = True
    status: str = "draft"
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    participants_count: int = 0
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None


class LiveQuizJoinRequest(BaseSchema):
    """Schema for joining a live quiz."""
    quiz_id: str
    user_email: str
    user_name: str


class LiveQuizLeaderboardEntry(BaseSchema):
    """Schema for leaderboard entry."""
    rank: int
    user_email: str
    user_name: str
    score: float
    time_taken_seconds: int
