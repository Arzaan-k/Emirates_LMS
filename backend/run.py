"""
BW LMS Backend Startup Script

This script serves as the main entry point for running the modular backend.
It imports and runs the FastAPI application from the app module.
"""

import os
import sys
import uvicorn

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app

if __name__ == "__main__":
    # Get port from environment or use default
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    # Run with uvicorn
    uvicorn.run(
        "run:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
