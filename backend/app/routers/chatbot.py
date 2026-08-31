"""Router: Chatbot — natural language HR queries."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatResponse
from app.services.chatbot_service import process_chat_query
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


@router.post("/chat", response_model=ChatResponse)
def chatbot_query(req: ChatRequest):
    """Endpoint for chatbot queries."""
    try:
        response_text = process_chat_query(
            question=req.query,
            hr_id=req.hr_id,
        )
        return ChatResponse(response=response_text)
    except Exception as e:
        logger.error("Chatbot query error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing chatbot query.")
