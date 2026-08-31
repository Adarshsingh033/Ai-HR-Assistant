"""
Resume parser — extracts text from PDF/DOCX files and uses AI for structured data extraction.
"""

import io
import fitz  # PyMuPDF
from docx import Document as DocxDocument

from app.services import ai_service
from app.logger import get_logger

logger = get_logger(__name__)


def _extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text content from a PDF file."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text = "\n".join(page.get_text() for page in doc)
    return text


def _extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text content from a DOCX file."""
    doc = DocxDocument(io.BytesIO(file_bytes))
    return "\n".join(para.text for para in doc.paragraphs)


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract raw text from a resume file based on its extension."""
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        return _extract_text_from_pdf(file_bytes)
    elif ext in ("docx", "doc"):
        return _extract_text_from_docx(file_bytes)
    else:
        return file_bytes.decode("utf-8", errors="ignore")


def parse_resume(file_bytes: bytes, filename: str) -> dict:
    """
    Parse a resume file and extract structured candidate information.

    Uses AI extraction first; falls back to an empty structure on failure.
    """
    try:
        text = extract_text(file_bytes, filename)
        logger.info("Extracted text from resume: %s (%d chars)", filename, len(text))

        ai_parsed = ai_service.extract_candidate_info(text)
        if ai_parsed:
            logger.info("AI extraction successful for: %s", filename)
            return ai_parsed

    except Exception as e:
        logger.error("Failed to parse resume '%s': %s", filename, e, exc_info=True)

    # Fallback empty structure
    logger.warning("Returning empty fallback for resume: %s", filename)
    return {
        "candidate_name": "",
        "contact_number": "",
        "email_address": "",
        "total_experience": "",
        "skills": "",
        "education": "",
        "gender": "",
        "raw_text": "",
    }
