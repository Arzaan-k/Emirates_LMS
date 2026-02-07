"""
Centralized Configuration Settings
All environment variables and application settings in one place
"""

import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field, validator
from functools import lru_cache


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    Uses pydantic-settings for validation and type coercion.
    """

    # ===========================================
    # APPLICATION
    # ===========================================
    APP_NAME: str = "BW LMS Backend"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = Field(default=False, env="DEBUG")
    ENVIRONMENT: str = Field(default="development", env="ENVIRONMENT")

    # ===========================================
    # SERVER
    # ===========================================
    HOST: str = Field(default="0.0.0.0", env="HOST")
    PORT: int = Field(default=8000, env="PORT")
    BASE_URL: str = Field(default="http://10.47.14.1:8000", env="RENDER_EXTERNAL_URL")

    # ===========================================
    # DATABASE
    # ===========================================
    DATABASE_URL: str = Field(..., env="DATABASE_URL")
    DB_POOL_SIZE: int = Field(default=10, env="DB_POOL_SIZE")
    DB_MAX_OVERFLOW: int = Field(default=20, env="DB_MAX_OVERFLOW")
    DB_POOL_TIMEOUT: int = Field(default=30, env="DB_POOL_TIMEOUT")
    USE_SERVERLESS: bool = Field(default=False, env="USE_SERVERLESS")

    # ===========================================
    # AUTHENTICATION
    # ===========================================
    JWT_SECRET: str = Field(..., env="JWT_SECRET")
    JWT_ALGORITHM: str = Field(default="HS256", env="JWT_ALGORITHM")
    JWT_EXPIRATION_HOURS: int = Field(default=24, env="JWT_EXPIRATION_HOURS")
    JWT_REFRESH_EXPIRATION_DAYS: int = Field(default=7, env="JWT_REFRESH_EXPIRATION_DAYS")

    # ===========================================
    # SECURITY
    # ===========================================
    ALLOWED_ORIGINS: str = Field(default="http://localhost:8081,http://localhost:8000,http://192.168.29.119:8000,http://192.168.29.119:8081,*", env="ALLOWED_ORIGINS")
    RATE_LIMIT_DEFAULT: str = Field(default="100/minute", env="RATE_LIMIT_DEFAULT")
    RATE_LIMIT_LOGIN: str = Field(default="5/minute", env="RATE_LIMIT_LOGIN")
    RATE_LIMIT_REGISTER: str = Field(default="10/hour", env="RATE_LIMIT_REGISTER")
    RATE_LIMIT_AI: str = Field(default="20/minute", env="RATE_LIMIT_AI")
    RATE_LIMIT_UPLOAD: str = Field(default="10/minute", env="RATE_LIMIT_UPLOAD")

    # ===========================================
    # FILE UPLOADS
    # ===========================================
    UPLOAD_DIR: str = Field(default="uploads", env="UPLOAD_DIR")
    MAX_FILE_SIZE_MB: int = Field(default=100, env="MAX_FILE_SIZE_MB")
    MAX_VIDEO_SIZE_MB: int = Field(default=500, env="MAX_VIDEO_SIZE_MB")
    ALLOWED_EXTENSIONS: List[str] = [
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        ".mp4", ".mp3", ".wav", ".webm", ".mov", ".avi",
        ".png", ".jpg", ".jpeg", ".gif", ".webp",
        ".txt", ".csv", ".json"
    ]

    # ===========================================
    # AI SERVICES
    # ===========================================
    GROQ_API_KEY: str = Field(..., env="GROQ_API_KEY")
    GROQ_MODEL: str = Field(default="llama-3.3-70b-versatile", env="GROQ_MODEL")
    GROQ_WHISPER_MODEL: str = Field(default="whisper-large-v3", env="GROQ_WHISPER_MODEL")

    # ===========================================
    # ELEVENLABS TTS
    # ===========================================
    ELEVENLABS_API_KEY: str = Field(..., env="ELEVENLABS_API_KEY")
    ELEVENLABS_VOICE_ID: str = Field(default="3AMU7jXQuQa3oRvRqUmb", env="ELEVENLABS_VOICE_ID")

    # ===========================================
    # HUGGINGFACE (Free embeddings - no billing required)
    # ===========================================
    # Optional: Adding a token helps with rate limits but is NOT required
    # Get free token at: https://huggingface.co/settings/tokens
    HUGGINGFACE_API_KEY: Optional[str] = Field(default=None, env="HUGGINGFACE_API_KEY")

    # ===========================================
    # OPENAI (DEPRECATED - replaced with HuggingFace free embeddings)
    # ===========================================
    OPENAI_API_KEY: Optional[str] = Field(default=None, env="OPENAI_API_KEY")

    # ===========================================
    # CLOUDFLARE R2 CDN
    # ===========================================
    CLOUDFLARE_ACCOUNT_ID: Optional[str] = Field(default=None, env="CLOUDFLARE_ACCOUNT_ID")
    R2_ACCESS_KEY_ID: Optional[str] = Field(default=None, env="R2_ACCESS_KEY_ID")
    R2_SECRET_ACCESS_KEY: Optional[str] = Field(default=None, env="R2_SECRET_ACCESS_KEY")
    R2_BUCKET_NAME: str = Field(default="lms-videos", env="R2_BUCKET_NAME")
    R2_PUBLIC_URL: Optional[str] = Field(default=None, env="R2_PUBLIC_URL")

    # ===========================================
    # LOGGING
    # ===========================================
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    LOG_FORMAT: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        env="LOG_FORMAT"
    )

    # ===========================================
    # EMAIL (SMTP)
    # ===========================================
    SMTP_SERVER: Optional[str] = Field(default="smtp.gmail.com", env="SMTP_SERVER")
    SMTP_PORT: int = Field(default=587, env="SMTP_PORT")
    SMTP_USERNAME: Optional[str] = Field(default=None, env="SMTP_USERNAME")
    SMTP_PASSWORD: Optional[str] = Field(default=None, env="SMTP_PASSWORD")
    EMAIL_FROM: str = Field(default="noreply@belgianwaffle.com", env="EMAIL_FROM")
    EMAIL_FROM_NAME: str = Field(default="BWC LMS Support", env="EMAIL_FROM_NAME")
    USE_TLS: bool = Field(default=True, env="USE_TLS")

    # ===========================================
    # REDIS (Optional - for caching/token blacklist)
    # ===========================================
    REDIS_URL: Optional[str] = Field(default=None, env="REDIS_URL")

    # ===========================================
    # COMPUTED PROPERTIES
    # ===========================================

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse ALLOWED_ORIGINS into a list."""
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.ENVIRONMENT.lower() == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.ENVIRONMENT.lower() == "development"

    @property
    def cdn_enabled(self) -> bool:
        """Check if CDN is configured."""
        return bool(
            self.CLOUDFLARE_ACCOUNT_ID and
            self.R2_ACCESS_KEY_ID and
            self.R2_SECRET_ACCESS_KEY
        )

    @property
    def max_file_size_bytes(self) -> int:
        """Max file size in bytes."""
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def max_video_size_bytes(self) -> int:
        """Max video size in bytes."""
        return self.MAX_VIDEO_SIZE_MB * 1024 * 1024

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Using lru_cache to ensure settings are loaded only once.
    """
    return Settings()


# Global settings instance
settings = get_settings()
