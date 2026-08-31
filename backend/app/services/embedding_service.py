"""
Embedding service — singleton HuggingFace embeddings model.

Loads the model lazily on first use to avoid unnecessary startup cost.
"""

from typing import Optional
from langchain_community.embeddings import HuggingFaceEmbeddings
from app.logger import get_logger

logger = get_logger(__name__)

_embedding_model: Optional[HuggingFaceEmbeddings] = None


def get_embedding_model() -> HuggingFaceEmbeddings:
    """Return the singleton embedding model instance, initializing on first call."""
    global _embedding_model
    if _embedding_model is None:
        logger.info("Loading HuggingFace embedding model: all-MiniLM-L6-v2")
        _embedding_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        logger.info("Embedding model loaded successfully.")
    return _embedding_model


def get_embedding(text: str) -> list[float]:
    """Generate a vector embedding for the given text."""
    model = get_embedding_model()
    return model.embed_query(text)
