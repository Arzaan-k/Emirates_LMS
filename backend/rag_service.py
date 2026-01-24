"""
RAG Service - Production Vector Search for LMS
Uses OpenAI Embeddings API (industry standard, extremely low cost)
Cost: ~$0.02 per 1 million tokens (essentially free)
"""

import os
import json
import logging
import hashlib
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger("RAG_Service")

# OpenAI API Key
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

# Embedding model - best price/performance ratio
EMBEDDING_MODEL = "text-embedding-3-small"  # $0.02/1M tokens
EMBEDDING_DIM = 1536

# In-memory vector store
# Format: { "course_id": str, "text": str, "embedding": List[float] }
_vector_store: List[Dict] = []

# Cache for embeddings
_embedding_cache: Dict[str, List[float]] = {}


def get_embedding(text: str, use_cache: bool = True) -> List[float]:
    """
    Get embedding vector using OpenAI API.
    Cost: ~$0.00002 per request (extremely cheap).
    
    Args:
        text: Text to embed
        use_cache: Use cached embeddings
    
    Returns:
        1536-dimensional embedding vector
    """
    cache_key = hashlib.md5(text[:1000].encode()).hexdigest()
    
    if use_cache and cache_key in _embedding_cache:
        return _embedding_cache[cache_key]
    
    if not OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set, using fallback")
        return _fallback_embedding(text)
    
    try:
        response = httpx.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "input": text[:8000],
                "model": EMBEDDING_MODEL
            },
            timeout=30.0
        )
        
        if response.status_code == 200:
            embedding = response.json()["data"][0]["embedding"]
            
            if use_cache:
                _embedding_cache[cache_key] = embedding
            
            return embedding
        else:
            logger.error(f"OpenAI error: {response.status_code}")
            return _fallback_embedding(text)
            
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        return _fallback_embedding(text)


def _fallback_embedding(text: str) -> List[float]:
    """Fallback when API unavailable."""
    embedding = [0.0] * EMBEDDING_DIM
    words = text.lower().split()[:100]
    
    for word in words:
        h = int(hashlib.sha256(word.encode()).hexdigest(), 16)
        for i in range(10):
            pos = (h >> (i * 8)) % EMBEDDING_DIM
            embedding[pos] += 0.1
    
    norm = (sum(x*x for x in embedding) ** 0.5) or 1.0
    return [x / norm for x in embedding]


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity."""
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = (sum(a * a for a in vec1) ** 0.5) or 1.0
    norm2 = (sum(b * b for b in vec2) ** 0.5) or 1.0
    return dot / (norm1 * norm2)


def chunk_text(text: str, chunk_size: int = 200, overlap: int = 40) -> List[str]:
    """Split text into overlapping chunks."""
    words = text.split()
    chunks = []
    
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if len(chunk.strip()) > 20:
            chunks.append(chunk)
    
    return chunks


def add_to_rag(course_id: str, transcript: str) -> int:
    """
    Add course to RAG index.
    
    Args:
        course_id: Course ID
        transcript: Full transcript
    
    Returns:
        Number of chunks indexed
    """
    if not transcript or len(transcript.strip()) < 50:
        return 0
    
    global _vector_store
    _vector_store = [v for v in _vector_store if v["course_id"] != course_id]
    
    chunks = chunk_text(transcript)
    added = 0
    
    for chunk in chunks:
        try:
            embedding = get_embedding(chunk)
            _vector_store.append({
                "course_id": course_id,
                "text": chunk,
                "embedding": embedding
            })
            added += 1
        except Exception as e:
            logger.error(f"Error indexing chunk: {e}")
    
    logger.info(f"Indexed {added} chunks for course {course_id}")
    return added


def search_rag(query: str, course_id: Optional[str] = None, top_k: int = 5) -> List[Dict]:
    """
    Search RAG for relevant context.
    
    Args:
        query: Search query
        course_id: Filter by course (optional)
        top_k: Number of results
    
    Returns:
        List of {course_id, text, score}
    """
    if not _vector_store:
        return []
    
    try:
        query_embedding = get_embedding(query, use_cache=False)
        
        results = []
        for item in _vector_store:
            if course_id and item["course_id"] != course_id:
                continue
            
            score = cosine_similarity(query_embedding, item["embedding"])
            results.append({
                "course_id": item["course_id"],
                "text": item["text"],
                "score": score
            })
        
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        return []


def get_context_for_question(question: str, course_id: str, max_chunks: int = 4) -> str:
    """Get relevant context for a question."""
    results = search_rag(question, course_id=course_id, top_k=max_chunks)
    
    if not results:
        return ""
    
    relevant = [r for r in results if r["score"] > 0.3]
    if not relevant:
        relevant = results[:2]
    
    return "\n\n".join([r["text"] for r in relevant])


def get_rag_stats() -> Dict[str, Any]:
    """Get RAG statistics."""
    courses = set(v["course_id"] for v in _vector_store)
    return {
        "total_chunks": len(_vector_store),
        "courses_indexed": len(courses),
        "cache_size": len(_embedding_cache),
        "model": EMBEDDING_MODEL,
        "cost": "$0.02 per 1M tokens"
    }


def clear_rag_for_course(course_id: str) -> int:
    """Clear RAG entries for a course."""
    global _vector_store
    before = len(_vector_store)
    _vector_store = [v for v in _vector_store if v["course_id"] != course_id]
    return before - len(_vector_store)


def clear_all_rag() -> int:
    """Clear all RAG data."""
    global _vector_store, _embedding_cache
    count = len(_vector_store)
    _vector_store = []
    _embedding_cache = {}
    return count
