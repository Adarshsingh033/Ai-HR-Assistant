import re
import io
import fitz          # PyMuPDF
from docx import Document as DocxDocument
from app.services import ai_service

def _extract_text_from_pdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text = "\n".join(page.get_text() for page in doc)
    return text


def _extract_text_from_docx(file_bytes: bytes) -> str:
    doc = DocxDocument(io.BytesIO(file_bytes))
    return "\n".join(para.text for para in doc.paragraphs)


def extract_text(file_bytes: bytes, filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        return _extract_text_from_pdf(file_bytes)
    elif ext in ("docx", "doc"):
        return _extract_text_from_docx(file_bytes)
    else:
        return file_bytes.decode("utf-8", errors="ignore")



def parse_resume(file_bytes: bytes, filename: str) -> dict:
    text = extract_text(file_bytes, filename)
    
    # Try AI extraction first
    ai_parsed = ai_service.extract_candidate_info(text)
    if ai_parsed:
        return ai_parsed

    # Fallback to regex
    return {
        "candidate_name" : "",
            "contact_number" : "",
            "email_address": "",   
            "total_experience": "", 
            "skills":"", 
            "education":"" ,
            "gender" :"" ,
            "raw_text" : ""
    }
