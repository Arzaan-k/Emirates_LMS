"""
BW LMS Backend Startup Script

This script serves as the main entry point for running the modular backend.
It imports and runs the FastAPI application from the app module.
"""

import os
import sys
import uvicorn
import asyncio

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# FIX for Windows asyncio bug: "An existing connection was forcibly closed by the remote host"
if sys.platform == 'win32':
    try:
        from asyncio.proactor_events import _ProactorBasePipeTransport
        
        # Store the original method
        _original_call_connection_lost = _ProactorBasePipeTransport._call_connection_lost
        
        def _silenced_call_connection_lost(self, exc):
            try:
                _original_call_connection_lost(self, exc)
            except ConnectionResetError as e:
                if e.winerror == 10054:
                    pass
                else:
                    raise
                    
        _ProactorBasePipeTransport._call_connection_lost = _silenced_call_connection_lost
    except ImportError:
        pass

from app.main import app

if __name__ == "__main__":
    # Get port from environment or use default
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    print(f"Starting server on {host}:{port} with verbose logging enabled...")
    
    # Run with uvicorn
    # Note: reload=True adds overhead. Set DEV_RELOAD=true env var to enable hot reload.
    enable_reload = os.environ.get("DEV_RELOAD", "false").lower() == "true"
    uvicorn.run(
        "run:app",
        host=host,
        port=port,
        reload=enable_reload,
        log_level="info"
    )
