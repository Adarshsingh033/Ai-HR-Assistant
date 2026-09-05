"""
Router: Candidate Comparison
  - GET  /api/comparison/candidates-by-job  — List candidates for a specific job vacancy
  - POST /api/comparison/compare            — Compare 2 candidates side-by-side against Job Vacancy JD criteria
"""

import re
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from app.database import get_db_connection
from app.models.schemas import CompareCandidatesRequest
from app.services.ai_service import compare_two_candidates_with_llm
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/comparison", tags=["comparison"])


@router.get("/candidates-by-job")
def get_candidates_by_job(job_id: str, org_id: Optional[str] = None):
    """
    Fetch candidates whose resumes have been uploaded for a specific job vacancy.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = (
                "SELECT c.id, c.name, c.email, c.phone, c.address, c.total_experience, "
                "c.skills, c.qualification, c.match_percentage, c.created_at "
                "FROM candidates c "
                "WHERE c.job_id = %s"
            )
            params = [job_id]
            if org_id:
                query += " AND c.org_id = %s"
                params.append(org_id)
            query += " ORDER BY c.match_percentage DESC, c.created_at ASC"

            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            return {
                "job_id": job_id,
                "candidates": [
                    {
                        "candidate_id": str(r[0]),
                        "name": r[1] or "Unknown Candidate",
                        "email": r[2] or "",
                        "phone": r[3] or "",
                        "address": r[4] or "",
                        "total_experience": r[5] or "0",
                        "skills": [s.strip() for s in (r[6] or "").split(",") if s.strip()],
                        "qualification": r[7] or "",
                        "match_percentage": r[8] or 0,
                        "created_at": str(r[9]) if r[9] else "",
                    }
                    for r in rows
                ]
            }


@router.post("/compare")
def compare_candidates(req: CompareCandidatesRequest):
    """
    Compare two candidates side-by-side against a Job Vacancy.
    Returns category breakdown (Location, Skills, Education, Experience), match scores,
    and a structured recommendation with comparison explanation.
    """
    if req.candidate1_id == req.candidate2_id:
        raise HTTPException(status_code=400, detail="Please select two different candidates for comparison.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Fetch Job Vacancy Details
            cur.execute(
                """
                SELECT id, job_title, department, location, employment_type,
                       experience_required, qualification, skills_required, job_description
                FROM job_vacancies WHERE id = %s
                """,
                (req.job_id,),
            )
            job_row = cur.fetchone()
            if not job_row:
                raise HTTPException(status_code=404, detail="Selected job vacancy not found.")

            job_data = {
                "job_id": str(job_row[0]),
                "job_title": job_row[1] or "Job Vacancy",
                "department": job_row[2] or "General",
                "location": job_row[3] or "Not specified",
                "employment_type": job_row[4] or "Full-time",
                "experience_required": job_row[5] or "0 years",
                "qualification": job_row[6] or "Bachelor's Degree",
                "skills_required": [s.strip() for s in (job_row[7] or "").split(",") if s.strip()] if isinstance(job_row[7], str) else (job_row[7] or []),
                "job_description": job_row[8] or "",
            }

            # 2. Fetch Candidates Details
            cur.execute(
                """
                SELECT id, name, email, phone, gender, address, total_experience,
                       skills, education, qualification, match_percentage, match_explanation, filename
                FROM candidates WHERE id IN (%s, %s)
                """,
                (req.candidate1_id, req.candidate2_id),
            )
            cand_rows = cur.fetchall()
            cand_dict = {str(r[0]): r for r in cand_rows}

            if req.candidate1_id not in cand_dict or req.candidate2_id not in cand_dict:
                raise HTTPException(status_code=404, detail="One or both candidates could not be found.")

            c1_raw = cand_dict[req.candidate1_id]
            c2_raw = cand_dict[req.candidate2_id]

            c1 = _parse_candidate_obj(c1_raw)
            c2 = _parse_candidate_obj(c2_raw)

            # 3. Call LLM for candidate comparison (Ollama primary, Groq fallback)
            try:
                llm_res = compare_two_candidates_with_llm(job_data, c1, c2)
                if llm_res:
                    llm_res["job_info"] = job_data
                    logger.info("Successfully completed LLM candidate comparison.")
                    return llm_res
            except Exception as e:
                logger.warning("LLM candidate comparison failed: %s. Falling back to rule-based evaluation.", e)

            # 4. Rule-based evaluation fallback if LLM unavailable
            c1_eval = _evaluate_candidate_against_jd(c1, job_data)
            c2_eval = _evaluate_candidate_against_jd(c2, job_data)

            # Determine Recommended Candidate
            c1_score = c1_eval["overall_score"]
            c2_score = c2_eval["overall_score"]

            if c1_score >= c2_score:
                better_id = c1["candidate_id"]
                better_name = c1["name"]
                other_name = c2["name"]
                winner_eval = c1_eval
                other_eval = c2_eval
            else:
                better_id = c2["candidate_id"]
                better_name = c2["name"]
                other_name = c1["name"]
                winner_eval = c2_eval
                other_eval = c1_eval

            # Build detailed recommendation explanation
            recommendation_reason = _build_recommendation_reason(
                job_data["job_title"],
                winner_eval,
                other_eval,
                job_data
            )

            return {
                "job_info": job_data,
                "candidate1": {
                    "candidate_id": c1["candidate_id"],
                    "name": c1["name"],
                    "email": c1["email"],
                    "phone": c1["phone"],
                    "filename": c1["filename"],
                    "overall_score": c1_score,
                    "is_recommended": (c1["candidate_id"] == better_id),
                    "criteria": c1_eval["criteria"],
                },
                "candidate2": {
                    "candidate_id": c2["candidate_id"],
                    "name": c2["name"],
                    "email": c2["email"],
                    "phone": c2["phone"],
                    "filename": c2["filename"],
                    "overall_score": c2_score,
                    "is_recommended": (c2["candidate_id"] == better_id),
                    "criteria": c2_eval["criteria"],
                },
                "recommendation": {
                    "recommended_candidate_id": better_id,
                    "recommended_candidate_name": better_name,
                    "recommendation_title": f"{better_name} is recommended for {job_data['job_title']}",
                    "score_difference": abs(c1_score - c2_score),
                    "reason": recommendation_reason,
                }
            }


def _parse_candidate_obj(r) -> dict:
    return {
        "candidate_id": str(r[0]),
        "name": r[1] or "Unknown Candidate",
        "email": r[2] or "",
        "phone": r[3] or "",
        "gender": r[4] or "",
        "address": r[5] or "",
        "total_experience": str(r[6] or "0"),
        "skills": [s.strip() for s in (r[7] or "").split(",") if s.strip()],
        "education": r[8] or "",
        "qualification": r[9] or "",
        "match_percentage": r[10] or 0,
        "match_explanation": r[11] or "",
        "filename": r[12] or "",
    }


def _evaluate_candidate_against_jd(candidate: dict, job: dict) -> dict:
    """
    Evaluates Candidate against 4 criteria: Location, Skills, Education, Experience.
    """
    # ── Category 01: Location Evaluation ────────────────────────────────────
    cand_loc = (candidate["address"] or "").strip().lower()
    job_loc = (job["location"] or "").strip().lower()

    if not job_loc or job_loc == "not specified" or job_loc == "remote":
        loc_score = 90
        loc_status = "Remote / Flexible"
        loc_desc = f"Job location is flexible ({job['location'] or 'Remote'}). Candidate is based in {candidate['address'] or 'unspecified location'}."
    elif cand_loc and (job_loc in cand_loc or cand_loc in job_loc):
        loc_score = 95
        loc_status = "Exact Local Match"
        loc_desc = f"Candidate is located in {candidate['address']}, matching job location ({job['location']})."
    elif cand_loc:
        loc_score = 65
        loc_status = "Relocation Needed"
        loc_desc = f"Candidate is located in {candidate['address']}. May require relocation to {job['location']}."
    else:
        loc_score = 50
        loc_status = "Location Unspecified"
        loc_desc = f"Location not specified in candidate's resume for target location ({job['location']})."

    # ── Category 02: Skills Evaluation ──────────────────────────────────────
    cand_skills_set = set(s.lower() for s in candidate["skills"])
    req_skills_list = job["skills_required"]
    req_skills_set = set(s.lower() for s in req_skills_list)

    if req_skills_set:
        matched_skills = [s for s in req_skills_list if s.lower() in cand_skills_set]
        missing_skills = [s for s in req_skills_list if s.lower() not in cand_skills_set]
        overlap_pct = len(matched_skills) / len(req_skills_set)
        skills_score = min(100, max(25, int(overlap_pct * 100)))

        if skills_score >= 80:
            skills_status = "Strong Match"
        elif skills_score >= 50:
            skills_status = "Moderate Match"
        else:
            skills_status = "Partial Match"

        skills_desc = f"Matches {len(matched_skills)} of {len(req_skills_set)} required skills ({', '.join(matched_skills) if matched_skills else 'None'})."
    else:
        matched_skills = candidate["skills"]
        missing_skills = []
        skills_score = 85
        skills_status = "Skills Available"
        skills_desc = f"Candidate possesses skills: {', '.join(candidate['skills'][:5]) if candidate['skills'] else 'General skills'}."

    # ── Category 03: Education & Qualification ────────────────────────────────
    cand_qual = f"{candidate['qualification']} {candidate['education']}".strip().lower()
    req_qual = (job["qualification"] or "").strip().lower()

    degree_keywords = ["b.tech", "b.e", "btech", "m.tech", "mca", "bca", "bs", "ms", "b.sc", "m.sc", "bachelor", "master", "phd", "degree", "diploma"]
    has_degree = any(k in cand_qual for k in degree_keywords)

    if req_qual in cand_qual or (has_degree and "bachelor" in req_qual or "degree" in req_qual or "b.tech" in req_qual):
        edu_score = 90
        edu_status = "Fully Qualified"
        edu_desc = f"Holds {candidate['qualification'] or candidate['education'] or 'relevant degree'}, meeting minimum JD criteria ({job['qualification']})."
    elif cand_qual:
        edu_score = 75
        edu_status = "Relevant Education"
        edu_desc = f"Holds {candidate['qualification'] or candidate['education']}."
    else:
        edu_score = 55
        edu_status = "Not Specified"
        edu_desc = "Education details not specified in resume."

    # ── Category 04: Experience Evaluation ────────────────────────────────────
    cand_exp_nums = re.findall(r'\d+', str(candidate["total_experience"]))
    cand_exp_years = float(cand_exp_nums[0]) if cand_exp_nums else 0.0

    req_exp_nums = re.findall(r'\d+', str(job["experience_required"]))
    req_exp_years = float(req_exp_nums[0]) if req_exp_nums else 0.0

    if req_exp_years > 0:
        if cand_exp_years >= req_exp_years:
            exp_score = min(100, int(85 + min(15, (cand_exp_years - req_exp_years) * 3)))
            exp_status = "Exceeds Requirement" if cand_exp_years > req_exp_years else "Meets Requirement"
            exp_desc = f"Has {cand_exp_years:.1f} years of experience vs {req_exp_years:.1f} years required by JD."
        else:
            exp_score = max(30, int((cand_exp_years / req_exp_years) * 75))
            exp_status = "Below Requirement"
            exp_desc = f"Has {cand_exp_years:.1f} years of experience vs {req_exp_years:.1f} years required by JD."
    else:
        exp_score = 85
        exp_status = "Experienced"
        exp_desc = f"Candidate has {cand_exp_years:.1f} years of professional experience."

    # ── Calculate Overall Score (Weighted) ──────────────────────────────────
    # Weighted average: Skills (40%), Experience (25%), Education (20%), Location (15%)
    raw_calc_score = int(skills_score * 0.40 + exp_score * 0.25 + edu_score * 0.20 + loc_score * 0.15)
    # Blend with candidate's AI match score if available
    db_match = candidate["match_percentage"] or raw_calc_score
    overall_score = max(1, min(99, int(0.6 * raw_calc_score + 0.4 * db_match)))

    return {
        "candidate_id": candidate["candidate_id"],
        "name": candidate["name"],
        "overall_score": overall_score,
        "criteria": {
            "location": {
                "title": "Location",
                "score": loc_score,
                "status": loc_status,
                "details": loc_desc,
                "value": candidate["address"] or "Not specified",
            },
            "skills": {
                "title": "Skills",
                "score": skills_score,
                "status": skills_status,
                "details": skills_desc,
                "value": candidate["skills"],
                "matched_skills": matched_skills,
                "missing_skills": missing_skills,
            },
            "education": {
                "title": "Education / Qualification",
                "score": edu_score,
                "status": edu_status,
                "details": edu_desc,
                "value": candidate["qualification"] or candidate["education"] or "Not specified",
            },
            "experience": {
                "title": "Experience",
                "score": exp_score,
                "status": exp_status,
                "details": exp_desc,
                "value": f"{candidate['total_experience']} years",
            },
        }
    }


def _build_recommendation_reason(job_title: str, winner: dict, other: dict, job: dict) -> str:
    """Builds a human-readable, professional recommendation explanation comparing the two candidates."""
    w_name = winner["name"]
    o_name = other["name"]
    w_score = winner["overall_score"]
    o_score = other["overall_score"]

    w_crit = winner["criteria"]
    o_crit = other["criteria"]

    highlights = []

    # Skills comparison
    if w_crit["skills"]["score"] > o_crit["skills"]["score"]:
        highlights.append(f"{w_name} possesses stronger technical skills alignment ({w_crit['skills']['status']}) for {job_title}.")
    elif o_crit["skills"]["score"] > w_crit["skills"]["score"]:
        highlights.append(f"{w_name} holds an edge in overall experience despite {o_name} having solid skills.")

    # Experience comparison
    if w_crit["experience"]["score"] > o_crit["experience"]["score"]:
        highlights.append(f"{w_name} brings more relevant professional experience ({w_crit['experience']['details']}) compared to {o_name} ({o_crit['experience']['details']}).")

    # Location comparison
    if w_crit["location"]["score"] > o_crit["location"]["score"]:
        highlights.append(f"{w_name} satisfies the job location requirement ({w_crit['location']['details']}), eliminating relocation delays.")

    # Education comparison
    if w_crit["education"]["score"] > o_crit["education"]["score"]:
        highlights.append(f"{w_name} meets the target qualification criteria ({w_crit['education']['value']}).")

    if not highlights:
        highlights.append(f"{w_name} demonstrates a higher overall alignment with the key requirements specified in the {job_title} job description.")

    reason_str = (
        f"{w_name} is recommended for the {job_title} vacancy with an overall match score of {w_score}% compared to {o_score}% for {o_name}. "
        + " ".join(highlights) + " "
        + f"Overall, {w_name} presents a lower hiring risk and a stronger fit against the required JD criteria."
    )

    return reason_str
