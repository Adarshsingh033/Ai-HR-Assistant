"""
AI service — LLM-powered functions for job descriptions, resume extraction, and candidate matching.

Primary LLM  : Ollama (local, zero-cost)
Fallback LLM : Groq – model: compound-beta-mini
               Retries up to 5 times with a 5-second delay between attempts
               to gracefully handle Groq's rate-limit responses.
"""

import os
import time
from typing import Optional, Callable, TypeVar, List

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
    skills: str = Field(..., description="Comma-separated list of all technical and soft skills")
    education: str = Field(..., description="Education qualifications summary (degree, institution, year)")
    gender: str = Field(..., description="Gender of the candidate (Male / Female / Other)")
    address: Optional[str] = Field(
        None,
        description="Full or partial address / location of the candidate from the resume.",
    )
    linkedin_url: Optional[str] = Field(
        None,
        description="LinkedIn profile URL if present in the resume.",
    )
    github_url: Optional[str] = Field(
        None,
        description="GitHub profile URL if present in the resume.",
    )


class IsResumeSchema(BaseModel):
    is_resume: bool = Field(
        ...,
        description="True if the text belongs to a professional resume or CV, False otherwise.",
    )
    reason: str = Field(
        ...,
        description="Brief reason explaining why it is or is not a resume.",
    )


class MatchResultSchema(BaseModel):
    match_percentage: int = Field(
        ..., description="Percentage match between 0 and 100", ge=0, le=100
    )
    match_explanation: str = Field(
        ..., description="Explanation of why the candidate matches or doesn't match"
    )


class CategoryEvalItem(BaseModel):
    category: str = Field(..., description="Category name: 'location', 'skills', 'education', or 'experience'")
    score: int = Field(..., description="Score 0-100 for candidate match in this category", ge=0, le=100)
    status: str = Field(..., description="Short status tag e.g. 'Strong Match', 'Relocation Needed', 'Fully Qualified'")
    details: str = Field(..., description="Detailed explanation sentence comparing candidate value against job requirement.")
    value: str = Field(..., description="Extracted candidate value for this category")


class CandidateComparisonEval(BaseModel):
    candidate_id: str = Field(..., description="ID of candidate being evaluated")
    overall_score: int = Field(..., description="Overall match percentage score 0-100", ge=0, le=100)
    location: CategoryEvalItem = Field(..., description="Location category evaluation")
    skills: CategoryEvalItem = Field(..., description="Skills category evaluation")
    education: CategoryEvalItem = Field(..., description="Education category evaluation")
    experience: CategoryEvalItem = Field(..., description="Experience category evaluation")
    matched_skills: List[str] = Field(default_factory=list, description="List of skills matching the JD requirements")
    missing_skills: List[str] = Field(default_factory=list, description="List of required JD skills missing in candidate")


class CompareCandidatesLLMSchema(BaseModel):
    cand1_eval: CandidateComparisonEval = Field(..., description="Evaluation for candidate 1")
    cand2_eval: CandidateComparisonEval = Field(..., description="Evaluation for candidate 2")
    better_candidate_id: str = Field(..., description="ID of the candidate who is the better match overall")
    better_candidate_name: str = Field(..., description="Name of the candidate who is the better match overall")
    comparison_summary_reason: str = Field(
        ...,
        description="Comprehensive and clear summary paragraph explaining why one candidate is a better fit compared to the other for this specific job vacancy."
    )


# ── LLM Clients Initialization ───────────────────────────────────────────────

logger.info("Initializing Ollama primary LLM client with model: %s", OLLAMA_MODEL)
ollama_client = ChatOllama(model=OLLAMA_MODEL, temperature=0.0, num_gpu=1)
llm_resume_data_extractor = ollama_client.with_structured_output(schema=ExtractResumeDataSchema)
llm_matcher = ollama_client.with_structured_output(schema=MatchResultSchema)
llm_is_resume_checker = ollama_client.with_structured_output(schema=IsResumeSchema)
llm_comparator = ollama_client.with_structured_output(schema=CompareCandidatesLLMSchema)

_groq_client: Optional["ChatGroq"] = None
_groq_resume_data_extractor = None
_groq_matcher = None
_groq_is_resume_checker = None
_groq_comparator = None



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
    """Return a cached tuple of (groq_client, resume_extractor, matcher, comparator)."""
    global _groq_client, _groq_resume_data_extractor, _groq_matcher, _groq_is_resume_checker, _groq_comparator
    if _groq_client is not None:
        return _groq_client, _groq_resume_data_extractor, _groq_matcher, _groq_comparator

    try:
        _groq_client = _build_groq_client()
        _groq_resume_data_extractor = _groq_client.with_structured_output(
            schema=ExtractResumeDataSchema
        )
        _groq_matcher = _groq_client.with_structured_output(schema=MatchResultSchema)
        _groq_is_resume_checker = _groq_client.with_structured_output(schema=IsResumeSchema)
        _groq_comparator = _groq_client.with_structured_output(schema=CompareCandidatesLLMSchema)
        logger.info(
            "Groq fallback LLM client initialized with model: %s", GROQ_MODEL_NAME
        )
        return _groq_client, _groq_resume_data_extractor, _groq_matcher, _groq_comparator
    except Exception as e:
        logger.warning("Could not initialize Groq fallback LLM client: %s", e)
        return None, None, None, None


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


# ── Resume Validation (Is this a resume?) ────────────────────────────────────

def check_is_resume(text: str) -> tuple[bool, str]:
    """
    Uses LLM to determine if the extracted text is from a professional resume/CV.
    Only sends the first 800 characters + a lightweight prompt to save tokens.
    Returns (is_resume: bool, reason: str).
    """
    snippet = text[:800].strip()
    prompt = ChatPromptTemplate.from_messages([
        ("system", """
        You are a document classifier. Your only job is to determine whether a given
        text snippet comes from a professional resume or CV.

        A resume typically contains some of:
        - Candidate name at the top
        - Contact information (email, phone)
        - Work experience section
        - Education / qualifications section
        - Skills section
        - Career objective or summary

        Classify strictly. If the text is an invoice, article, book, form,
        certificate, or any non-resume document, return is_resume=false.
        """),
        ("human", """
        Classify the following document snippet:

        ---
        {snippet}
        ---

        Is this from a professional resume or CV?
        """),
    ])

    result = None

    # 1. Try Ollama
    try:
        chain = prompt | llm_is_resume_checker
        result = chain.invoke({"snippet": snippet})
    except Exception as e:
        logger.warning("Ollama resume check failed: %s. Trying Groq fallback...", e)
        _, _, _ = get_groq_client()  # ensure initialized
        if _groq_is_resume_checker is None:
            logger.warning("Groq is_resume checker not available, defaulting to True.")
            return True, "LLM unavailable — assumed resume"
        try:
            chain = prompt | _groq_is_resume_checker
            result = chain.invoke({"snippet": snippet})
        except Exception as e2:
            logger.warning("Groq resume check also failed: %s — defaulting to True.", e2)
            return True, "LLM unavailable — assumed resume"

    if result is None:
        return True, "LLM returned no result — assumed resume"

    logger.info("Resume check result: is_resume=%s, reason=%s", result.is_resume, result.reason)
    return result.is_resume, result.reason


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
    raw_text = (
        f"Contact number of {candidate_name}: {result.contact_number}\n"
        f"Email of {candidate_name}: {result.email_address}\n"
        f"Experience of {candidate_name}: {result.total_experience} years\n"
        f"Skills of {candidate_name}: {result.skills}\n"
        f"Education of {candidate_name}: {result.education}\n"
        f"Gender of {candidate_name}: {result.gender}\n"
        f"Address of {candidate_name}: {result.address or ''}\n"
        f"LinkedIn: {result.linkedin_url or ''}\n"
        f"GitHub: {result.github_url or ''}"
    )
    logger.info("Successfully extracted info for candidate: %s", candidate_name)
    return {
        "candidate_name": candidate_name,
        "contact_number": result.contact_number or "",
        "email_address": result.email_address or "",
        "total_experience": result.total_experience,
        "skills": result.skills,
        "education": result.education,
        "gender": result.gender,
        "address": result.address or "",
        "linkedin_url": result.linkedin_url or "",
        "github_url": result.github_url or "",
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


# ── Candidate Comparison with LLM ───────────────────────────────────────────

def compare_two_candidates_with_llm(job_data: dict, c1: dict, c2: dict) -> Optional[dict]:
    """
    Uses LLM (Ollama primary, Groq fallback) to compare two candidates against a Job Vacancy.
    Returns structured evaluation with category scores, overall scores, and comparison summary reason.
    """
    prompt = ChatPromptTemplate.from_messages([
        ("system", """
        You are an expert HR Talent Acquisition Specialist.
        Compare two candidates side-by-side against a Job Vacancy.

        Evaluate both candidates across 4 core categories:
        1. Location (Candidate address vs Job Location requirement)
        2. Skills (Candidate skills vs Job Required Skills)
        3. Education (Candidate degree/qualifications vs Job Minimum Qualification)
        4. Experience (Candidate total years of experience vs Job Required Experience)

        Assign appropriate percentage scores (0-100) and status tags for each category.
        Calculate an overall match percentage score (0-100) for each candidate.
        Determine which candidate is the better fit overall (`better_candidate_id` and `better_candidate_name`).
        Provide a comprehensive, professional `comparison_summary_reason` explaining clearly why the recommended candidate is a superior fit compared to the other.
        """),
        ("human", """
        # JOB VACANCY DETAILS
        Title: {job_title}
        Department: {job_department}
        Location: {job_location}
        Job Type: {job_type}
        Experience Required: {job_experience}
        Qualification Required: {job_qualification}
        Required Skills: {job_skills}
        Description: {job_description}

        ---
        # CANDIDATE 1 (ID: {c1_id})
        Name: {c1_name}
        Email: {c1_email}
        Location/Address: {c1_address}
        Total Experience: {c1_experience} years
        Skills: {c1_skills}
        Qualification / Education: {c1_education}

        ---
        # CANDIDATE 2 (ID: {c2_id})
        Name: {c2_name}
        Email: {c2_email}
        Location/Address: {c2_address}
        Total Experience: {c2_experience} years
        Skills: {c2_skills}
        Qualification / Education: {c2_education}
        """)
    ])

    job_skills_str = ", ".join(job_data.get("skills_required", [])) if isinstance(job_data.get("skills_required"), list) else str(job_data.get("skills_required", ""))
    c1_skills = c1.get("skills", [])
    c1_skills_str = ", ".join(c1_skills) if isinstance(c1_skills, list) else str(c1_skills)
    c2_skills = c2.get("skills", [])
    c2_skills_str = ", ".join(c2_skills) if isinstance(c2_skills, list) else str(c2_skills)

    input_payload = {
        "job_title": job_data.get("job_title", "Job Vacancy"),
        "job_department": job_data.get("department", ""),
        "job_location": job_data.get("location", ""),
        "job_type": job_data.get("employment_type", "Full-time"),
        "job_experience": job_data.get("experience_required", ""),
        "job_qualification": job_data.get("qualification", ""),
        "job_skills": job_skills_str,
        "job_description": job_data.get("job_description", "")[:1000],

        "c1_id": c1["candidate_id"],
        "c1_name": c1["name"],
        "c1_email": c1.get("email", ""),
        "c1_address": c1.get("address", "Not specified"),
        "c1_experience": c1.get("total_experience", "0"),
        "c1_skills": c1_skills_str,
        "c1_education": f"{c1.get('qualification', '')} {c1.get('education', '')}".strip(),

        "c2_id": c2["candidate_id"],
        "c2_name": c2["name"],
        "c2_email": c2.get("email", ""),
        "c2_address": c2.get("address", "Not specified"),
        "c2_experience": c2.get("total_experience", "0"),
        "c2_skills": c2_skills_str,
        "c2_education": f"{c2.get('qualification', '')} {c2.get('education', '')}".strip(),
    }

    result: Optional[CompareCandidatesLLMSchema] = None

    # 1. Try Ollama primary
    try:
        logger.info("Executing candidate comparison via Ollama LLM...")
        chain = prompt | llm_comparator
        result = chain.invoke(input=input_payload)
    except Exception as e:
        logger.warning("Ollama candidate comparison failed: %s. Trying Groq fallback...", e)

        # 2. Try Groq fallback
        try:
            groq_res = get_groq_client()
            g_comparator = groq_res[3] if groq_res and len(groq_res) > 3 else None
            if g_comparator is not None:
                chain = prompt | g_comparator
                def _call():
                    return chain.invoke(input=input_payload)
                result = _invoke_groq_with_retry(_call, context="Candidate comparison")
        except Exception as e2:
            logger.warning("Groq candidate comparison fallback failed: %s", e2)

    if result is None:
        logger.warning("LLM comparison returned no result.")
        return None

    c1_res = result.cand1_eval
    c2_res = result.cand2_eval

    better_id = result.better_candidate_id
    if better_id not in (c1["candidate_id"], c2["candidate_id"]):
        better_id = c1["candidate_id"] if c1_res.overall_score >= c2_res.overall_score else c2["candidate_id"]

    better_name = result.better_candidate_name or (c1["name"] if better_id == c1["candidate_id"] else c2["name"])

    req_skills_list = job_data.get("skills_required", [])
    if isinstance(req_skills_list, str):
        req_skills_list = [s.strip() for s in req_skills_list.split(",") if s.strip()]

    c1_matched = [s for s in req_skills_list if s.lower() in [sk.lower() for sk in (c1.get("skills") or [])]]
    c1_missing = [s for s in req_skills_list if s.lower() not in [sk.lower() for sk in (c1.get("skills") or [])]]

    c2_matched = [s for s in req_skills_list if s.lower() in [sk.lower() for sk in (c2.get("skills") or [])]]
    c2_missing = [s for s in req_skills_list if s.lower() not in [sk.lower() for sk in (c2.get("skills") or [])]]

    return {
        "candidate1": {
            "candidate_id": c1["candidate_id"],
            "name": c1["name"],
            "email": c1.get("email", ""),
            "phone": c1.get("phone", ""),
            "filename": c1.get("filename", ""),
            "overall_score": c1_res.overall_score,
            "is_recommended": (c1["candidate_id"] == better_id),
            "criteria": {
                "location": {
                    "title": "Location",
                    "score": c1_res.location.score,
                    "status": c1_res.location.status,
                    "details": c1_res.location.details,
                    "value": c1_res.location.value or c1.get("address", "Not specified"),
                },
                "skills": {
                    "title": "Skills",
                    "score": c1_res.skills.score,
                    "status": c1_res.skills.status,
                    "details": c1_res.skills.details,
                    "value": c1.get("skills", []),
                    "matched_skills": c1_res.matched_skills or c1_matched,
                    "missing_skills": c1_res.missing_skills or c1_missing,
                },
                "education": {
                    "title": "Education / Qualification",
                    "score": c1_res.education.score,
                    "status": c1_res.education.status,
                    "details": c1_res.education.details,
                    "value": c1_res.education.value or c1.get("qualification", "") or c1.get("education", "Not specified"),
                },
                "experience": {
                    "title": "Experience",
                    "score": c1_res.experience.score,
                    "status": c1_res.experience.status,
                    "details": c1_res.experience.details,
                    "value": c1_res.experience.value or f"{c1.get('total_experience', '0')} years",
                },
            }
        },
        "candidate2": {
            "candidate_id": c2["candidate_id"],
            "name": c2["name"],
            "email": c2.get("email", ""),
            "phone": c2.get("phone", ""),
            "filename": c2.get("filename", ""),
            "overall_score": c2_res.overall_score,
            "is_recommended": (c2["candidate_id"] == better_id),
            "criteria": {
                "location": {
                    "title": "Location",
                    "score": c2_res.location.score,
                    "status": c2_res.location.status,
                    "details": c2_res.location.details,
                    "value": c2_res.location.value or c2.get("address", "Not specified"),
                },
                "skills": {
                    "title": "Skills",
                    "score": c2_res.skills.score,
                    "status": c2_res.skills.status,
                    "details": c2_res.skills.details,
                    "value": c2.get("skills", []),
                    "matched_skills": c2_res.matched_skills or c2_matched,
                    "missing_skills": c2_res.missing_skills or c2_missing,
                },
                "education": {
                    "title": "Education / Qualification",
                    "score": c2_res.education.score,
                    "status": c2_res.education.status,
                    "details": c2_res.education.details,
                    "value": c2_res.education.value or c2.get("qualification", "") or c2.get("education", "Not specified"),
                },
                "experience": {
                    "title": "Experience",
                    "score": c2_res.experience.score,
                    "status": c2_res.experience.status,
                    "details": c2_res.experience.details,
                    "value": c2_res.experience.value or f"{c2.get('total_experience', '0')} years",
                },
            }
        },
        "recommendation": {
            "recommended_candidate_id": better_id,
            "recommended_candidate_name": better_name,
            "recommendation_title": f"{better_name} is recommended for {job_data.get('job_title', 'Job Vacancy')}",
            "score_difference": abs(c1_res.overall_score - c2_res.overall_score),
            "reason": result.comparison_summary_reason,
        }
    }

