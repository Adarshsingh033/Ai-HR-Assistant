"""Router: Emails — AI email drafting, sending, and sent email logs."""

import re
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import GenerateEmailRequest, SendEmailRequest, EmailResponse, DraftResponse, SaveDraftRequest, ToggleStarRequest
from app.services.email_service import draft_email_content, send_and_save_email, get_emails, save_email_draft, toggle_email_star
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/emails", tags=["Emails"])


@router.post("/draft", response_model=DraftResponse)
def draft_email(request: GenerateEmailRequest, hr_id: str):
    """Drafts an email using AI based on the HR's prompt."""
    if not hr_id:
        raise HTTPException(status_code=401, detail="Unauthorized. Need hr_id.")
    
    raw_draft = draft_email_content(hr_id, request.prompt, request.candidate_id)
    
    subject = "No Subject"
    body = raw_draft
    
    subject_match = re.search(r'SUBJECT:\s*(.*)', raw_draft, re.IGNORECASE)
    if subject_match:
        subject = subject_match.group(1).strip()
    
    body_match = re.search(r'BODY:\s*(.*)', raw_draft, re.IGNORECASE | re.DOTALL)
    if body_match:
        body = body_match.group(1).strip()
    elif "BODY:" in raw_draft.upper():
        parts = re.split(r'BODY:', raw_draft, flags=re.IGNORECASE)
        if len(parts) > 1:
            body = parts[1].strip()
    
    return DraftResponse(subject=subject, body=body)


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
