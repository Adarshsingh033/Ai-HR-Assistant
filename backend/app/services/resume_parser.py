"""
Resume text extractor, validator & parser — supports PDF, DOCX, DOC, TXT.

Validation Pipeline (in order):
  1. Extension check — only pdf/docx/doc/txt allowed
  2. Text extraction + length check — must have ≥ 100 chars
  3. LLM resume check — must be a professional resume/CV

Extraction Strategy:
  PDF  → PyMuPDF text layer
  DOCX → python-docx (paragraphs + tables in document order)
  TXT  → utf-8 / latin-1 / cp1252 multi-encoding decode

After extraction, text is cleaned via clean_text():
  • Collapse excessive blank lines (max 2 consecutive)
  • Strip leading/trailing whitespace per line
  • Remove null bytes / non-printable characters
  • Deduplicate repeated header/footer lines
"""

from __future__ import annotations

import io
import re

import fitz                          # PyMuPDF
from docx import Document as DocxDocument

from app.services import ai_service
from app.logger import get_logger

logger = get_logger(__name__)


# ── Custom exception for rejection ───────────────────────────────────────────

class ResumeRejected(Exception):
    """Raised when a file fails any validation stage."""
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


# ── Supported file extensions ─────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt"}

MIN_TEXT_LENGTH = 100   # Minimum chars required after extraction


# ── Text Cleaning ─────────────────────────────────────────────────────────────

def clean_text(raw: str) -> str:
    """
    Normalise extracted resume text:
    1. Remove non-printable chars (keep \\n, \\t, spaces, unicode letters).
    2. Expand tabs to spaces.
    3. Strip leading/trailing whitespace per line.
    4. Collapse multiple internal spaces to one.
    5. Collapse 3+ consecutive blank lines → max 2.
    6. Deduplicate consecutive repeated lines (page numbers / footers).
    """
    if not raw:
        return ""

    text = re.sub(r"[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]", " ", raw)
    text = text.expandtabs(4)

    lines = text.splitlines()
    cleaned: list[str] = []
    for line in lines:
        line = line.strip()
        line = re.sub(r"  +", " ", line)
        cleaned.append(line)

    # Collapse 3+ consecutive blank lines → 2
    result: list[str] = []
    blank_run = 0
    for line in cleaned:
        if line == "":
            blank_run += 1
            if blank_run <= 2:
                result.append("")
        else:
            blank_run = 0
            result.append(line)

    # Deduplicate consecutive non-empty lines
    deduped: list[str] = []
    prev = object()
    for line in result:
        if line and line == prev:
            continue
        deduped.append(line)
        prev = line

    return "\n".join(deduped).strip()


# ── PDF Extraction ────────────────────────────────────────────────────────────

def _extract_pdf_via_pymupdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    return "\n".join(page.get_text("text") for page in doc)


def _extract_text_from_pdf(file_bytes: bytes) -> str:
    text = _extract_pdf_via_pymupdf(file_bytes)
    logger.info("PDF extracted via PyMuPDF (%d chars).", len(text or ""))
    return text or ""


# ── DOCX Extraction ───────────────────────────────────────────────────────────

def _extract_text_from_docx(file_bytes: bytes) -> str:
    doc = DocxDocument(io.BytesIO(file_bytes))
    sections: list[str] = []

    for child in doc.element.body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag

        if tag == "p":
            from docx.oxml.ns import qn
            text = "".join(node.text or "" for node in child.iter(qn("w:t")))
            if text.strip():
                sections.append(text.strip())

        elif tag == "tbl":
            from docx.table import Table
            table = Table(child, doc)
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    sections.append(" | ".join(cells))

    return "\n".join(sections)


# ── TXT Extraction ────────────────────────────────────────────────────────────

def _extract_text_from_txt(file_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return file_bytes.decode(encoding)
        except (UnicodeDecodeError, ValueError):
            continue
    return file_bytes.decode("ascii", errors="replace")


# ── Core Extraction Dispatcher ────────────────────────────────────────────────

def extract_text(file_bytes: bytes, filename: str) -> str:
    """Dispatch to the correct extractor, then clean and return."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "pdf":
        raw = _extract_text_from_pdf(file_bytes)
    elif ext in ("docx", "doc"):
        try:
            raw = _extract_text_from_docx(file_bytes)
        except Exception as e:
            logger.warning("DOCX extraction failed (%s): %s", filename, e)
            raw = ""
    elif ext == "txt":
        raw = _extract_text_from_txt(file_bytes)
    else:
        raw = file_bytes.decode("utf-8", errors="replace")

    cleaned = clean_text(raw)
    logger.info("Extracted '%s': %d → %d chars", filename, len(raw), len(cleaned))
    return cleaned


# ── Validation Pipeline ───────────────────────────────────────────────────────

def validate_and_extract(file_bytes: bytes, filename: str) -> str:
    """
    3-stage validation pipeline. Returns clean extracted text on success.
    Raises ResumeRejected with a descriptive reason on any failure.

    Stage 1 — Extension check
    Stage 2 — Text length check (>= 100 chars)
    Stage 3 — LLM resume type check
    """
    # Stage 1: Extension
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ResumeRejected(
            f"Unsupported file type '.{ext}'. "
            f"Accepted formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
        )

    # Stage 2: Text extraction + length
    text = extract_text(file_bytes, filename)
    if len(text.strip()) < MIN_TEXT_LENGTH:
        raise ResumeRejected("Resume does not contain proper text.")

    # Stage 3: LLM resume type check
    try:
        is_resume, reason = ai_service.check_is_resume(text)
        if not is_resume:
            raise ResumeRejected(f"This file does not appear to be a resume. {reason}")
    except ResumeRejected:
        raise
    except Exception as e:
        logger.warning("Resume type check failed unexpectedly (%s), allowing file.", e)

    return text


# ── Public API ────────────────────────────────────────────────────────────────

def parse_resume(file_bytes: bytes, filename: str) -> dict:
    """
    Full parse: validates file → extracts text → AI-extracts structured data.
    Raises ResumeRejected if validation fails.
    Returns dict with all candidate fields + resume_text.
    """
    resume_text = validate_and_extract(file_bytes, filename)

    try:
        ai_parsed = ai_service.extract_candidate_info(resume_text)
        if ai_parsed:
            name = ai_parsed.get("candidate_name", "").strip()
            if not name:
                raise ResumeRejected("Failed to extract candidate name. Please ensure the file is a valid resume.")
            
            ai_parsed["resume_text"] = resume_text
            logger.info("AI extraction successful for '%s'.", filename)
            return ai_parsed
    except ResumeRejected:
        raise
    except Exception as e:
        logger.error("AI extraction failed for '%s': %s", filename, e, exc_info=True)
        raise ResumeRejected(f"AI extraction failed: {e}")

    # Should not reach here
    raise ResumeRejected("AI extraction returned empty result.")
