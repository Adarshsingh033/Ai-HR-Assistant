"""Router: Emails — AI email drafting, sending, and sent email logs."""

import re
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import GenerateEmailRequest, SendEmailRequest, EmailResponse, DraftResponse, SaveDraftRequest, ToggleStarRequest
from app.services.email_service import draft_email_content, send_and_save_email, get_emails, save_email_draft, toggle_email_star
from app.services.task_service import create_task
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/emails", tags=["Emails"])


@router.post("/draft")
def draft_email(request: GenerateEmailRequest, hr_id: str):
    """
    Queue an async AI email draft generation task.
    Returns { task_id, status: 'pending' } immediately.
    The client polls GET /api/ai-tasks/{task_id} for subject + body.
    """
    if not hr_id:
        raise HTTPException(status_code=401, detail="Unauthorized. Need hr_id.")

    try:
        task_id = create_task(
            task_type="email_draft",
            input_data={
                "hr_id": hr_id,
                "prompt": request.prompt,
                "candidate_id": request.candidate_id,
            },
            created_by=hr_id,
        )
        logger.info("Email draft task queued: %s for hr_id=%s", task_id, hr_id)
        return {"task_id": task_id, "status": "pending"}
    except Exception as e:
        logger.error("Failed to queue email draft task: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to queue email draft: {str(e)}")



@router.post("/send")
def send_email(request: SendEmailRequest, hr_id: str):
    """Sends an email and records it in the database."""
    if not hr_id:
        raise HTTPException(status_code=401, detail="Unauthorized. Need hr_id.")
        
    success = send_and_save_email(
        hr_id=hr_id,
        to_email=request.to_email,
        subject=request.subject,
        body=request.body,
        candidate_id=request.candidate_id,
        cc_emails=request.cc_emails,
        bcc_emails=request.bcc_emails,
        draft_id=request.draft_id
    )
    
    if success:
        return {"success": True, "message": "Email sent and recorded successfully."}
    else:
        logger.error("Failed to send email to %s", request.to_email)
        raise HTTPException(status_code=500, detail="Failed to send email.")


@router.get("", response_model=List[EmailResponse])
def get_all_emails(hr_id: str, folder: Optional[str] = Query(None)):
    """Retrieves emails for the HR dashboard, optionally filtered by folder."""
    if not hr_id:
        raise HTTPException(status_code=401, detail="Unauthorized. Need hr_id.")
        
    emails = get_emails(hr_id, folder)
    return emails

@router.post("/save_draft")
def save_draft(request: SaveDraftRequest, hr_id: str):
    """Saves an email as draft."""
    if not hr_id:
        raise HTTPException(status_code=401, detail="Unauthorized. Need hr_id.")
        
    return save_email_draft(
        hr_id=hr_id,
        subject=request.subject,
        body=request.body,
        to_email=request.to_email,
        cc_emails=request.cc_emails,
        bcc_emails=request.bcc_emails,
        candidate_id=request.candidate_id
    )

@router.put("/{email_id}/star")
def toggle_star(email_id: str, request: ToggleStarRequest, hr_id: str):
    """Toggles the star status of an email."""
    if not hr_id:
        raise HTTPException(status_code=401, detail="Unauthorized. Need hr_id.")
        
    success = toggle_email_star(hr_id, email_id, request.is_starred)
    if not success:
        raise HTTPException(status_code=404, detail="Email not found")
        
    return {"success": True, "message": "Star status updated."}
