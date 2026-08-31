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
        logger.error("Failed to draft email: %s", e, exc_info=True)
        raise


def send_and_save_email(
    hr_id: str,
    to_email: str,
    subject: str,
    body: str,
    candidate_id: Optional[str] = None,
    cc_emails: Optional[str] = None,
    bcc_emails: Optional[str] = None,
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
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    email_id = str(uuid.uuid4())
                    cur.execute("""
                        INSERT INTO sent_emails (id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (email_id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body))
                conn.commit()
                logger.info("Email record saved to database (id=%s).", email_id)
        except Exception as e:
            logger.error("Failed to save email record: %s", e, exc_info=True)

    return sent_successfully


def get_sent_emails(hr_id: str) -> List[dict]:
    """Retrieves all emails sent by a specific HR user."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, hr_id, org_id, candidate_id, to_email, cc_emails, bcc_emails, subject, body, sent_at
                FROM sent_emails
                WHERE hr_id = %s
                ORDER BY sent_at DESC
            """, (hr_id,))
            rows = cur.fetchall()

            emails = []
            for row in rows:
                emails.append({
                    "id": str(row[0]),
                    "hr_id": str(row[1]),
                    "org_id": str(row[2]),
                    "candidate_id": str(row[3]) if row[3] else None,
                    "to_email": row[4],
                    "cc_emails": row[5],
                    "bcc_emails": row[6],
                    "subject": row[7],
                    "body": row[8],
                    "sent_at": row[9].isoformat() if row[9] else None,
                })
            return emails
