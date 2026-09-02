"""
AI service — LLM-powered functions for job descriptions, resume extraction, and candidate matching.

Primary LLM  : Ollama (local, zero-cost)
Fallback LLM : Groq – model: compound-beta-mini
               Retries up to 5 times with a 5-second delay between attempts
               to gracefully handle Groq's rate-limit responses.
"""

import os
import time
from typing import Optional, Callable, TypeVar

try:
    from langchain_ollama import ChatOllama
except (ModuleNotFoundError, ImportError):
    try:
        from langchain_community.chat_models.ollama import ChatOllama
    except (ModuleNotFoundError, ImportError):
        from langchain_community.chat_models import ChatOllama

try:
    from langchain_groq import ChatGroq
except (ModuleNotFoundError, ImportError):
    ChatGroq = None

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from dotenv import dotenv_values

from app.config import OLLAMA_MODEL, GROQ_API_KEY, GROQ_MODEL
from app.logger import get_logger

logger = get_logger(__name__)

# ── Groq configuration ───────────────────────────────────────────────────────

GROQ_MODEL_NAME = "compound-beta-mini"   # Single production model
GROQ_MAX_RETRIES = 5                     # Max attempts on rate-limit / transient errors
GROQ_RETRY_DELAY = 5                     # Seconds to wait between retries

T = TypeVar("T")


# ── Structured Output Schemas ────────────────────────────────────────────────

class ExtractResumeDataSchema(BaseModel):
    candidate_name: str = Field(
        ...,
        description="Name of the candidate, usually at the top of the resume.",
    )
    contact_number: Optional[str] = Field(
        None,
        description="Any phone or mobile number found in the resume.",
    )
    email_address: Optional[str] = Field(
        None,
        description="Email address mentioned in the resume.",
    )
    total_experience: int = Field(
        ...,
        description="Total full years of professional experience calculated from work history.",
        ge=0,
    )
    skills: str = Field(..., description="List of all skills")
    education: str = Field(..., description="Education summaries")
    gender: str = Field(..., description="Gender of the candidates (Ex: Male or Female)")


class MatchResultSchema(BaseModel):
    match_percentage: int = Field(
        ..., description="Percentage match between 0 and 100", ge=0, le=100
    )
    match_explanation: str = Field(
        ..., description="Explanation of why the candidate matches or doesn't match"
    )


# ── LLM Clients Initialization ───────────────────────────────────────────────

logger.info("Initializing Ollama primary LLM client with model: %s", OLLAMA_MODEL)
ollama_client = ChatOllama(model=OLLAMA_MODEL, temperature=0.0, num_gpu=1)
llm_resume_data_extractor = ollama_client.with_structured_output(schema=ExtractResumeDataSchema)
llm_matcher = ollama_client.with_structured_output(schema=MatchResultSchema)

_groq_client: Optional["ChatGroq"] = None
_groq_resume_data_extractor = None
_groq_matcher = None


# ── Groq helpers ─────────────────────────────────────────────────────────────

def _get_groq_api_key() -> str:
    """Return GROQ_API_KEY from env, falling back to direct .env file read."""
    api_key = (os.getenv("GROQ_API_KEY") or GROQ_API_KEY or "").strip()
    if not api_key:
        env_file = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "..", ".env")
        )
        if os.path.exists(env_file):
            vals = dotenv_values(env_file)
            api_key = (vals.get("GROQ_API_KEY") or "").strip()
            if api_key:
                os.environ["GROQ_API_KEY"] = api_key
    return api_key


def _build_groq_client() -> "ChatGroq":
    """Create a fresh ChatGroq client using the single production model."""
    api_key = _get_groq_api_key()
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set in backend/.env — "
            "Groq fallback cannot be used."
        )
    if ChatGroq is None:
        raise RuntimeError(
            "langchain_groq is not installed — run: pip install langchain-groq"
        )
    return ChatGroq(
        groq_api_key=api_key,
        model_name=GROQ_MODEL_NAME,
        temperature=0.2,
    )


def _invoke_groq_with_retry(call: Callable[[], T], context: str = "") -> T:
    """
    Execute *call* (a zero-argument callable that invokes Groq) with retry logic.

    Retries up to GROQ_MAX_RETRIES times, waiting GROQ_RETRY_DELAY seconds between
    each attempt, to handle Groq's rate-limit (429) and other transient errors.

    Args:
        call: Zero-argument callable that performs the Groq invocation.
        context: Human-readable label used in log messages (e.g. "JD generation").

    Returns:
        Whatever *call* returns on success.

    Raises:
        RuntimeError: After all retries are exhausted.
    """
    last_error: Exception | None = None

    for attempt in range(1, GROQ_MAX_RETRIES + 1):
        try:
            logger.info(
                "[Groq Fallback] %s — attempt %d/%d using model '%s'",
                context, attempt, GROQ_MAX_RETRIES, GROQ_MODEL_NAME,
            )
            result = call()
            logger.info(
                "[Groq Fallback] %s — succeeded on attempt %d",
                context, attempt,
            )
            return result
        except Exception as e:
            last_error = e
            logger.warning(
                "[Groq Fallback] %s — attempt %d/%d failed: %s",
                context, attempt, GROQ_MAX_RETRIES, e,
            )
            if attempt < GROQ_MAX_RETRIES:
                logger.info(
                    "[Groq Fallback] Waiting %ds before retry %d/%d...",
                    GROQ_RETRY_DELAY, attempt + 1, GROQ_MAX_RETRIES,
                )
                time.sleep(GROQ_RETRY_DELAY)

    raise RuntimeError(
        f"[Groq Fallback] {context} — all {GROQ_MAX_RETRIES} attempts failed. "
        f"Last error: {last_error}"
    )


def get_groq_client():
    """Return a cached tuple of (groq_client, resume_extractor, matcher)."""
    global _groq_client, _groq_resume_data_extractor, _groq_matcher
    if _groq_client is not None:
        return _groq_client, _groq_resume_data_extractor, _groq_matcher

    try:
        _groq_client = _build_groq_client()
        _groq_resume_data_extractor = _groq_client.with_structured_output(
            schema=ExtractResumeDataSchema
        )
        _groq_matcher = _groq_client.with_structured_output(schema=MatchResultSchema)
        logger.info(
            "Groq fallback LLM client initialized with model: %s", GROQ_MODEL_NAME
        )
        return _groq_client, _groq_resume_data_extractor, _groq_matcher
    except Exception as e:
        logger.warning("Could not initialize Groq fallback LLM client: %s", e)
        return None, None, None


# ── Job Description Generation ───────────────────────────────────────────────

def generate_job_description(
    title: str,
    department: str,
    location: str,
    job_type: str,
    experience_required: str,
    qualification: str,
    salary: str,
    skills_required: list[str],
) -> str:
    """Generate a professional job description using Ollama with Groq fallback."""
    skills_str = ", ".join(skills_required) if skills_required else "Not specified"

    prompt = f"""
You are an experienced HR professional responsible for creating high-quality job descriptions.

Generate a clear, structured, and professional job description using the following information:

Job Title: {title}
Department: {department}
Location: {location}
Job Type: {job_type}
Experience Required: {experience_required}
Minimum Qualification: {qualification}
Salary / Compensation: {salary}
Required Skills: {skills_str}

Structure the response with the following sections:

## Role Overview
Write 2-3 concise sentences describing the purpose of the role, mentioning the location and job type.

## Key Responsibilities
Provide 5-7 bullet points describing the main responsibilities.

## Required Qualifications
Provide 4-5 bullet points. Include:
- Minimum qualification: {qualification}
- Experience requirement: {experience_required}
- Key technical skills from: {skills_str}
- Any other relevant requirements.

## Skills & Technologies
List the required skills and tools:
{skills_str}

## Compensation & Benefits
Provide 3-4 bullet points. Include the salary/compensation ({salary}) and highlight other benefits such as growth opportunities, work culture, and flexibility.

Ensure the description is professional, engaging, and suitable for a company careers page.
Do not include any placeholder text — use the exact values provided above.
"""


    # 1. Try Primary LLM (Ollama)
    try:
        logger.info("Generating job description via Ollama (%s) for: %s", OLLAMA_MODEL, title)
        response = ollama_client.invoke(prompt)
        if response and response.content:
            return response.content
    except Exception as e:
        logger.warning(
            "Ollama LLM generation failed for '%s': %s. Attempting Groq fallback...",
            title, e,
        )

    # 2. Fallback: Groq with retry
    groq = _build_groq_client()   # raises clearly if key/package missing

    def _call() -> str:
        response = groq.invoke(prompt)
        if response and response.content:
            return response.content
        raise RuntimeError("Groq returned an empty response.")

    return _invoke_groq_with_retry(_call, context=f"JD generation for '{title}'")


# ── Resume Data Extraction ───────────────────────────────────────────────────

def extract_candidate_info(text: str) -> dict:
    """Uses LLM (Ollama with Groq fallback) to extract structured data from resume text."""
    analysis_prompt = ChatPromptTemplate.from_messages([
        ("system", """
        You are a very skilled resume data extractor.
        Rules:
        - Read the entire resume carefully.
        - Extract accurate and complete information for each field in the schema.
        - Always try to extract candidate_name from the first prominent name in the resume.
        - If a value is implied but not explicit, infer the most likely value.
        - Never leave a field empty if reasonable inference is available.
        - If multiple values exist, choose the most relevant one.
        """),
        ("human", """
        Please analyze the following resume and extract the information as per the provided schema.
        
        # CANDIDATE RESUME
        {resume_data}
        """),
    ])

    result = None

    # 1. Try Ollama primary
    try:
        logger.info("Extracting candidate info from resume text via Ollama.")
        data_extraction_chain = analysis_prompt | llm_resume_data_extractor
        result = data_extraction_chain.invoke(input={"resume_data": text})
    except Exception as e:
        logger.warning("Ollama candidate extraction failed: %s. Trying Groq fallback...", e)

        # 2. Groq fallback with retry
        _, g_extractor, _ = get_groq_client()
        if g_extractor is None:
            raise RuntimeError(
                "Ollama extraction failed and Groq client could not be initialized."
            ) from e

        chain = analysis_prompt | g_extractor

        def _call():
            return chain.invoke(input={"resume_data": text})

        result = _invoke_groq_with_retry(_call, context="Resume extraction")

    candidate_name = result.candidate_name
    raw_text = f"""
    Contact number of {candidate_name} : {result.contact_number}
    Email_address of  {candidate_name} : {result.email_address}
    total_experience of {candidate_name} : {result.total_experience}
    skills of {candidate_name} : {result.skills}
    education details of {candidate_name} : {result.education}
    gender of {candidate_name} : {result.gender}
"""
    logger.info("Successfully extracted info for candidate: %s", candidate_name)
    return {
        "candidate_name": candidate_name,
        "contact_number": result.contact_number,
        "email_address": result.email_address,
        "total_experience": result.total_experience,
        "skills": result.skills,
        "education": result.education,
        "gender": result.gender,
        "raw_text": raw_text,
    }


# ── Candidate–JD Matching ────────────────────────────────────────────────────

def match_candidate_with_jd(candidate_data: dict, jd_text: str) -> dict:
    """Uses LLM (Ollama with Groq fallback) to calculate match percentage and explanation."""
    match_prompt = ChatPromptTemplate.from_messages([
        ("system", """
        You are an expert HR recruiter. 
        Compare the candidate's extracted data with the Job Description (JD).
        Calculate a match percentage (0-100) based on:
        1. Skills overlap.
        2. Experience level vs required.
        
        Provide a clear, brief explanation of the score.
        """),
        ("human", """
        # CANDIDATE DATA
        {candidate_data}
        
        # JOB DESCRIPTION
        {jd_text}
        
        Analyze and return the match percentage and explanation.
        """),
    ])

    candidate_summary = f"""
Experience: {candidate_data.get('total_experience')} years
Skills: {candidate_data.get('skills')}
"""

    result = None

    # 1. Try Ollama primary
    try:
        matcher_chain = match_prompt | llm_matcher
        result = matcher_chain.invoke(input={
            "candidate_data": candidate_summary,
            "jd_text": jd_text,
        })
    except Exception as e:
        logger.warning("Ollama candidate matching failed: %s. Trying Groq fallback...", e)

        # 2. Groq fallback with retry
        _, _, g_matcher = get_groq_client()
        if g_matcher is None:
            raise RuntimeError(
                "Ollama matching failed and Groq client could not be initialized."
            ) from e

        chain = match_prompt | g_matcher

        def _call():
            return chain.invoke(input={
                "candidate_data": candidate_summary,
                "jd_text": jd_text,
            })

        result = _invoke_groq_with_retry(_call, context="Candidate-JD matching")

    logger.info(
        "Candidate match score: %d%% for candidate data.",
        result.match_percentage,
    )
    return {
        "match_percentage": result.match_percentage,
        "match_explanation": result.match_explanation,
    }
