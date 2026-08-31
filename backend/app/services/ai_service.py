"""
AI service — LLM-powered functions for job descriptions, resume extraction, and candidate matching.

Uses Ollama (via LangChain) with structured output schemas.
"""

try:
    from langchain_ollama import ChatOllama
except ModuleNotFoundError:
    from langchain_community.chat_models import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing import Optional

from app.config import OLLAMA_MODEL
from app.logger import get_logger

logger = get_logger(__name__)


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


# ── LLM Client Initialization ───────────────────────────────────────────────

logger.info("Initializing Ollama LLM client with model: %s", OLLAMA_MODEL)
ollama_client = ChatOllama(model=OLLAMA_MODEL, temperature=0.0, num_gpu=1)
llm_resume_data_extractor = ollama_client.with_structured_output(schema=ExtractResumeDataSchema)
llm_matcher = ollama_client.with_structured_output(schema=MatchResultSchema)


# ── Job Description Generation ───────────────────────────────────────────────

def generate_job_description(
    title: str,
    department: str,
    location: str,
    job_type: str,
    experience_required: str,
    skills_required: list[str],
) -> str:
    """Generate a professional job description using the LLM."""
    skills_str = ", ".join(skills_required) if skills_required else "Not specified"

    prompt = f"""
You are an experienced HR professional responsible for creating high-quality job descriptions.

Generate a clear, structured, and professional job description using the following information:

Job Title: {title}
Department: {department}
Location: {location}
Job Type: {job_type}
Experience Required: {experience_required}
Required Skills: {skills_str}

Structure the response with the following sections:

## Role Overview
Write 2-3 concise sentences describing the purpose of the role.

## Key Responsibilities
Provide 5-7 bullet points describing the main responsibilities.

## Required Qualifications
Provide 4-5 bullet points describing mandatory qualifications and skills.

## What We Offer
Provide 3-4 bullet points describing benefits, work culture, or opportunities.

Ensure the description is professional, engaging, and suitable for a company careers page.
"""

    try:
        logger.info("Generating job description for: %s", title)
        response = ollama_client.invoke(prompt)
        return response.content
    except Exception as e:
        logger.error("Failed to generate job description for '%s': %s", title, e, exc_info=True)
        raise


# ── Resume Data Extraction ───────────────────────────────────────────────────

def extract_candidate_info(text: str) -> dict:
    """Uses Ollama via LangChain to extract structured data from resume text."""
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

    try:
        logger.info("Extracting candidate info from resume text.")
        data_extraction_chain = analysis_prompt | llm_resume_data_extractor
        result = data_extraction_chain.invoke(input={"resume_data": text})

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
    except Exception as e:
        logger.error("Failed to extract candidate info: %s", e, exc_info=True)
        raise


# ── Candidate–JD Matching ────────────────────────────────────────────────────

def match_candidate_with_jd(candidate_data: dict, jd_text: str) -> dict:
    """Uses Ollama to calculate match percentage and explanation."""
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

    try:
        matcher_chain = match_prompt | llm_matcher
        candidate_summary = f"""
    Experience: {candidate_data.get('total_experience')} years
    Skills: {candidate_data.get('skills')}
    """
        result = matcher_chain.invoke(input={
            "candidate_data": candidate_summary,
            "jd_text": jd_text,
        })
        logger.info(
            "Candidate match score: %d%% for candidate data.",
            result.match_percentage,
        )
        return {
            "match_percentage": result.match_percentage,
            "match_explanation": result.match_explanation,
        }
    except Exception as e:
        logger.error("Failed to match candidate with JD: %s", e, exc_info=True)
        raise
