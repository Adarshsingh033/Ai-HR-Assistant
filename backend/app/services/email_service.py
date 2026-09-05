"""
Email service — AI-powered email drafting, SMTP sending, and email record management.
"""

import smtplib
import uuid
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List

from langchain_core.prompts import ChatPromptTemplate

from app.database import get_db_connection
from app.services.ai_service import ollama_client
from app.config import SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
from app.logger import get_logger

logger = get_logger(__name__)


def get_candidate_context(candidate_id: str) -> str:
    """Fetches candidate details for email context."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT name, email, phone, skills, total_experience FROM candidates WHERE id = %s",
                (candidate_id,),
            )
            candidate = cur.fetchone()
            if candidate:
                return (
                    f"Candidate Name: {candidate[0]}\n"
                    f"Email: {candidate[1]}\n"
                    f"Phone: {candidate[2]}\n"
                    f"Skills: {candidate[3]}\n"
                    f"Experience: {candidate[4]}"
                )
    return "No specific candidate context provided."


def get_hr_and_org_context(hr_id: str) -> dict:
    """Fetches HR name and organization name for email signatures."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # First check organization_members
            cur.execute("""
                SELECT m.full_name, o.company_name, o.id 
                FROM organization_members m
                JOIN organization o ON m.organization_id = o.id
                WHERE m.id = %s
            """, (hr_id,))
            result = cur.fetchone()
            if result:
                return {
                    "hr_name": result[0],
                    "org_name": result[1],
                    "org_id": result[2],
                }
                
            # Fallback to legacy hr table
            cur.execute("""
                SELECT h.full_name, o.company_name, o.id 
                FROM hr h
                JOIN organization o ON h.org_id = o.id
                WHERE h.id = %s
            """, (hr_id,))
            result = cur.fetchone()
            if result:
                return {
                    "hr_name": result[0],
                    "org_name": result[1],
                    "org_id": result[2],
                }
    return {"hr_name": "HR Professional", "org_name": "Our Company", "org_id": None}


def draft_email_content(
    hr_id: str, prompt: str, candidate_id: Optional[str] = None
) -> str:
    """Uses LLM to draft an email based on prompt and context."""
    hr_info = get_hr_and_org_context(hr_id)

    system_prompt = ChatPromptTemplate.from_messages([
        ("system", """
            You are an expert HR Assistant. Your task is to write a professional email based on the user's instructions.
            

            IMPORTANT STRUCTURAL RULES:
            - Write clear, professional, and convincing content.
            - Do not include any placeholder brackets like [Your Name] or [Company Name].
            - DO NOT include markers like "Dear Candidate" if you don't know the name; use professional greetings.
            - MUST conclude the email with exactly this signature:
            Best Regards,
            {hr_name}
            {org_name}
            
            Make sure to return ONLY the email subject and body. STRICTLY follow this format:
            SUBJECT: <the subject>
            BODY:
            <the body>
        """),
        ("human", "{prompt}"),
    ])

    try:
        logger.info("Drafting email for HR '%s'.", hr_id)
        chain = system_prompt | ollama_client
        response = chain.invoke(input={
            "hr_name": hr_info["hr_name"],
            "org_name": hr_info["org_name"],
            "prompt": prompt,
        })
        return response.content
    except Exception as e:
        logger.warning("Ollama email drafting failed: %s. Attempting Groq fallback...", e)
        from app.services.ai_service import _build_groq_client, _invoke_groq_with_retry
        try:
            groq = _build_groq_client()
            chain = system_prompt | groq
            def _call() -> str:
                res = chain.invoke(input={
                    "hr_name": hr_info["hr_name"],
                    "org_name": hr_info["org_name"],
                    "prompt": prompt,
                })
                if res and res.content:
                    return res.content
                raise RuntimeError("Groq returned empty response.")
            return _invoke_groq_with_retry(_call, context="Email drafting")
        except Exception as groq_e:
            logger.error("Groq fallback also failed for email drafting: %s", groq_e)
            return (
                f"SUBJECT: Communication from {hr_info['org_name']}\n"
                f"BODY:\n"
                f"Dear Candidate,\n\n"
                f"We are writing to provide an update regarding your application. Please feel free to reach out if you have any questions.\n\n"
                f"Best Regards,\n"
                f"{hr_info['hr_name']}\n"
                f"{hr_info['org_name']}"
            )


def send_and_save_email(
    hr_id: str,
    to_email: str,
    subject: str,
    body: str,
    candidate_id: Optional[str] = None,
    cc_emails: Optional[str] = None,
    bcc_emails: Optional[str] = None,
    draft_id: Optional[str] = None,
) -> bool:
    """Sends email via SMTP (if configured) and saves the record to the database."""
    sent_successfully = False

    if SMTP_SERVER and SMTP_USER and SMTP_PASSWORD:
        try:
            msg = MIMEMultipart()
            msg["From"] = SMTP_USER
            msg["To"] = to_email
            msg["Subject"] = subject
            if cc_emails:
                msg["Cc"] = cc_emails
            if bcc_emails:
                msg["Bcc"] = bcc_emails

            msg.attach(MIMEText(body, "plain"))

            all_recipients = [to_email]
            if cc_emails:
                all_recipients.extend([e.strip() for e in cc_emails.split(",") if e.strip()])
            if bcc_emails:
                all_recipients.extend([e.strip() for e in bcc_emails.split(",") if e.strip()])

            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, all_recipients, msg.as_string())
            server.quit()
            sent_successfully = True
            logger.info("Email sent via SMTP to %s.", to_email)
        except Exception as e:
            logger.error("Failed to send email via SMTP to %s: %s", to_email, e, exc_info=True)
    else:
        logger.info(
            "No SMTP credentials configured — simulating email send. TO: %s | SUBJECT: %s",
            to_email, subject,
        )
        sent_successfully = True  # Assume success in simulation

    # Save email record to database
    hr_info = get_hr_and_org_context(hr_id)
    org_id = hr_info.get("org_id")

    if org_id:
        if not candidate_id:
            candidate_id = None
            
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    email_id = str(uuid.uuid4())
                    cur.execute("""
                        INSERT INTO emails (id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, folder, is_starred, from_email, sent_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'sent', FALSE, %s, CURRENT_TIMESTAMP)
                    """, (email_id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, SMTP_USER or 'noreply@hrms.com'))
                    if candidate_id:
                        cur.execute("UPDATE candidates SET reached = TRUE WHERE id = %s", (candidate_id,))
                    if draft_id:
                        cur.execute("DELETE FROM emails WHERE id = %s AND hr_id = %s", (draft_id, hr_id))
                conn.commit()
                logger.info("Email record saved to database (id=%s).", email_id)
        except Exception as e:
            logger.error("Failed to save email record: %s", e, exc_info=True)

    return sent_successfully


def get_emails(hr_id: str, folder: Optional[str] = None) -> List[dict]:
    """Retrieves emails for a specific HR user, optionally filtered by folder."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if folder == 'starred':
                query = """
                    SELECT id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, sent_at, folder, is_starred, from_email, updated_at
                    FROM emails
                    WHERE hr_id = %s AND is_starred = TRUE
                    ORDER BY COALESCE(sent_at, updated_at) DESC NULLS LAST
                """
                cur.execute(query, (hr_id,))
            elif folder == 'inbox':
                query = """
                    SELECT id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, sent_at, folder, is_starred, from_email, updated_at
                    FROM emails
                    WHERE hr_id = %s AND folder IN ('inbox', 'sent')
                    ORDER BY COALESCE(sent_at, updated_at) DESC NULLS LAST
                """
                cur.execute(query, (hr_id,))
            elif folder:
                query = """
                    SELECT id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, sent_at, folder, is_starred, from_email, updated_at
                    FROM emails
                    WHERE hr_id = %s AND folder = %s
                    ORDER BY COALESCE(sent_at, updated_at) DESC NULLS LAST
                """
                cur.execute(query, (hr_id, folder))
            else:
                query = """
                    SELECT id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, sent_at, folder, is_starred, from_email, updated_at
                    FROM emails
                    WHERE hr_id = %s
                    ORDER BY COALESCE(sent_at, updated_at) DESC NULLS LAST
                """
                cur.execute(query, (hr_id,))
            
            rows = cur.fetchall()

            emails = []
            for row in rows:
                emails.append({
                    "id": str(row[0]),
                    "hr_id": str(row[1]),
                    "org_id": str(row[2]),
                    "candidate_id": str(row[3]) if row[3] else None,
                    "to_email": row[4] or "",
                    "cc_emails": row[5] or "",
                    "bcc_emails": row[6] or "",
                    "subject": row[7] or "",
                    "body": row[8] or "",
                    "sent_at": row[9].isoformat() if row[9] else None,
                    "folder": row[10],
                    "is_starred": bool(row[11]),
                    "from_email": row[12] or "",
                    "updated_at": row[13].isoformat() if row[13] else None,
                })
            return emails

def save_email_draft(
    hr_id: str,
    subject: str,
    body: str,
    to_email: str = "",
    cc_emails: str = "",
    bcc_emails: str = "",
    candidate_id: Optional[str] = None
) -> dict:
    hr_info = get_hr_and_org_context(hr_id)
    org_id = hr_info.get("org_id")
    email_id = str(uuid.uuid4())
    
    if not candidate_id:
        candidate_id = None
        
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO emails (id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, folder, is_starred, from_email, sent_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'drafts', FALSE, %s, NULL)
            """, (email_id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, SMTP_USER or 'noreply@hrms.com'))
        conn.commit()
        
    return {"success": True, "id": email_id, "message": "Draft saved."}

def toggle_email_star(hr_id: str, email_id: str, is_starred: bool) -> bool:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE emails SET is_starred = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND hr_id = %s
            """, (is_starred, email_id, hr_id))
            affected = cur.rowcount
        conn.commit()
        return affected > 0
