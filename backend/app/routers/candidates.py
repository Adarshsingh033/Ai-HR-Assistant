"""
Router: Candidates
  POST /api/candidates/upload   — Upload & parse resume (PDF/DOCX/TXT)
  GET  /api/candidates          — List with filters (job_id, org_id, location, search)
  PUT  /api/candidates/{id}     — Edit candidate data
  PUT  /api/candidates/{id}/status — Update reached/remark
  DELETE /api/candidates/{id}   — Delete candidate
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse, Response
from app.database import get_db_connection
from app.services.resume_parser import parse_resume, ResumeRejected
from app.models.schemas import UpdateCandidateStatusRequest, UpdateCandidateRequest
from app.services.ai_service import match_candidate_with_jd
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/candidates", tags=["candidates"])

UPLOAD_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "resumes")
)
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_resume(
    job_id: str = Form(...),
    org_id: str = Form(...),
    hr_id: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Upload and process a candidate resume.
    """
    try:
        content = await file.read()
        logger.info("Resume upload: '%s' for job_id=%s", file.filename, job_id)

        # ── Parse + validate ────────────────────────────────────
        parsed = parse_resume(content, file.filename)

        # ── Fetch JD for AI matching ────────────────────────────
        jd_text = ""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT experience_required, qualification, skills_required,
                              job_description
                       FROM job_vacancies WHERE id = %s""",
                    (job_id,),
                )
                row = cur.fetchone()
                if row:
                    jd_text = (
                        f"Experience Required: {row[0] or ''}\n"
                        f"Qualification: {row[1] or ''}\n"
                        f"Skills Required: {row[2] or ''}\n"
                        f"Description: {row[3] or ''}"
                    )

        # ── AI matching ─────────────────────────────────────────
        match_data = {"match_percentage": 0, "match_explanation": "JD not found"}
        if jd_text:
            match_data = match_candidate_with_jd(parsed, jd_text)

        candidate_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # No longer saving physical resume file locally.
        # It will be stored in the database as a BYTEA BLOB.

        # ── Store in DB ─────────────────────────────────────────
        resume_text = parsed.get("resume_text", "")

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Verify hr_id exists, otherwise set to None to avoid foreign key violation
                if hr_id:
                    cur.execute("SELECT id FROM hr WHERE id = %s", (hr_id,))
                    if not cur.fetchone():
                        hr_id = None

                cur.execute(
                    """
                    INSERT INTO candidates
                        (id, name, email, phone, gender, address,
                         total_experience, skills, education, qualification,
                         linkedin_url, github_url,
                         job_id, org_id, hr_id, filename, resume_file, resume_text,
                         match_percentage, match_explanation, created_at)
                    VALUES
                        (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        candidate_id,
                        parsed.get("candidate_name", ""),
                        parsed.get("email_address", ""),
                        parsed.get("contact_number", ""),
                        parsed.get("gender", ""),
                        parsed.get("address", ""),
                        str(parsed.get("total_experience", "0")),
                        parsed.get("skills", ""),
                        parsed.get("education", ""),
                        parsed.get("qualification", ""),
                        parsed.get("linkedin_url", ""),
                        parsed.get("github_url", ""),
                        job_id, org_id, hr_id,
                        file.filename,
                        content,
                        resume_text,
                        match_data["match_percentage"],
                        match_data["match_explanation"],
                        now,
                    ),
                )
                conn.commit()

        logger.info("Candidate stored: '%s' id=%s match=%s%%",
                    parsed.get("candidate_name", ""), candidate_id,
                    match_data["match_percentage"])

        return {
            "candidate_id": candidate_id,
            "name": parsed.get("candidate_name", ""),
            "email": parsed.get("email_address", ""),
            "phone": parsed.get("contact_number", ""),
            "gender": parsed.get("gender", ""),
            "address": parsed.get("address", ""),
            "total_experience": parsed.get("total_experience", ""),
            "skills": parsed.get("skills", ""),
            "education": parsed.get("education", ""),
            "qualification": parsed.get("qualification", ""),
            "linkedin_url": parsed.get("linkedin_url", ""),
            "github_url": parsed.get("github_url", ""),
            "job_id": job_id,
            "org_id": org_id,
            "hr_id": hr_id,
            "filename": file.filename,
            "resume_text": resume_text,
            "match_percentage": match_data["match_percentage"],
            "match_explanation": match_data["match_explanation"],
            "created_at": now,
        }

    except ResumeRejected as e:
        logger.warning("Resume rejected '%s': %s", file.filename, e.reason)
        return JSONResponse(
            status_code=422,
            content={"rejected": True, "reason": e.reason, "filename": file.filename},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error for '%s': %s", file.filename, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {e}")


@router.get("")
def list_candidates(
    job_id: Optional[str] = None,
    org_id: Optional[str] = None,
    hr_id: Optional[str] = None,
    location: Optional[str] = None,
    search: Optional[str] = None,
    contacted: Optional[bool] = None,
    sort_by_match: bool = False,
    top_10: bool = False,
):
    """List candidates with optional filters and ranking order."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = (
                "SELECT id, name, email, phone, gender, address, total_experience, "
                "skills, education, qualification, linkedin_url, github_url, "
                "job_id, org_id, hr_id, filename, resume_text, "
                "match_percentage, match_explanation, reached, remark, created_at "
                "FROM candidates"
            )
            params = []
            where_clauses = []

            if job_id:
                where_clauses.append("job_id = %s")
                params.append(job_id)
            if org_id:
                where_clauses.append("org_id = %s")
                params.append(org_id)
            if hr_id:
                where_clauses.append("hr_id = %s")
                params.append(hr_id)
            if location:
                where_clauses.append("LOWER(address) LIKE LOWER(%s)")
                params.append(f"%{location}%")
            if search:
                where_clauses.append(
                    "(LOWER(name) LIKE LOWER(%s) OR LOWER(email) LIKE LOWER(%s))"
                )
                params.extend([f"%{search}%", f"%{search}%"])
            if contacted is not None:
                where_clauses.append("reached = %s")
                params.append(contacted)

            if where_clauses:
                query += " WHERE " + " AND ".join(where_clauses)

            if top_10:
                query += " ORDER BY match_percentage DESC, created_at ASC LIMIT 10"
            else:
                # Default ranking: Match Score DESC, then upload time ASC (earliest uploaded gets higher rank)
                query += " ORDER BY match_percentage DESC, created_at ASC"

            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            return {"candidates": [_row_to_dict(r) for r in rows]}


@router.get("/{candidate_id}")
def get_candidate(candidate_id: str):
    """Get a single candidate by ID."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, email, phone, gender, address, total_experience, "
                "skills, education, qualification, linkedin_url, github_url, "
                "job_id, org_id, hr_id, filename, resume_text, "
                "match_percentage, match_explanation, reached, remark, created_at "
                "FROM candidates WHERE id = %s",
                (candidate_id,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _row_to_dict(row)


@router.get("/{candidate_id}/download")
def download_candidate_resume(candidate_id: str):
    """Download original candidate resume file."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT filename, resume_text, resume_file FROM candidates WHERE id = %s", (candidate_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")

    filename = row[0] or "resume.pdf"
    resume_text = row[1] or ""
    resume_file = row[2]

    if resume_file:
        return Response(
            content=bytes(resume_file),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    file_path = os.path.join(UPLOAD_DIR, f"{candidate_id}_{filename}")
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream")

    txt_filename = filename if filename.endswith('.txt') else f"{filename}.txt"
    return Response(
        content=resume_text.encode("utf-8"),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{txt_filename}"'}
    )


@router.get("/{candidate_id}/preview")
def preview_candidate_resume(candidate_id: str):
    """Preview candidate resume file or text."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT filename, resume_text, resume_file FROM candidates WHERE id = %s", (candidate_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")

    filename = row[0] or "resume.pdf"
    resume_text = row[1] or ""
    resume_file = row[2]
    ext = filename.lower().split('.')[-1]
    media_type = "application/pdf" if ext == "pdf" else "text/plain"

    if resume_file:
        return Response(content=bytes(resume_file), media_type=media_type)

    file_path = os.path.join(UPLOAD_DIR, f"{candidate_id}_{filename}")
    if os.path.exists(file_path):
        return FileResponse(path=file_path, media_type=media_type)

    return Response(content=resume_text.encode("utf-8"), media_type="text/plain")


@router.put("/{candidate_id}")
def update_candidate(candidate_id: str, req: UpdateCandidateRequest):
    """Update candidate profile data with smart JD re-matching if criteria fields changed."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT address, total_experience, qualification, skills, job_id, name, email, phone, gender, education "
                "FROM candidates WHERE id = %s",
                (candidate_id,)
            )
            old_row = cur.fetchone()
            if not old_row:
                raise HTTPException(status_code=404, detail="Candidate not found")

            old_address, old_exp, old_qual, old_skills, job_id, old_name, old_email, old_phone, old_gender, old_edu = old_row

            addr_changed = req.address is not None and req.address.strip() != (old_address or "").strip()
            exp_changed  = req.total_experience is not None and str(req.total_experience).strip() != str(old_exp or "").strip()
            qual_changed = req.qualification is not None and req.qualification.strip() != (old_qual or "").strip()

            def _norm_skills(s):
                if isinstance(s, list): return sorted([x.strip().lower() for x in s if x.strip()])
                return sorted([x.strip().lower() for x in (s or "").split(",") if x.strip()])

            skills_changed = req.skills is not None and _norm_skills(req.skills) != _norm_skills(old_skills)

            re_matched = False
            new_match_pct = None
            new_match_exp = None

            if (addr_changed or exp_changed or qual_changed or skills_changed) and job_id:
                cur.execute(
                    "SELECT experience_required, qualification, skills_required, job_description "
                    "FROM job_vacancies WHERE id = %s",
                    (job_id,)
                )
                jd_row = cur.fetchone()
                if jd_row:
                    jd_text = (
                        f"Experience Required: {jd_row[0] or ''}\n"
                        f"Qualification: {jd_row[1] or ''}\n"
                        f"Skills Required: {jd_row[2] or ''}\n"
                        f"Description: {jd_row[3] or ''}"
                    )
                    cand_payload = {
                        "candidate_name": req.name if req.name is not None else (old_name or ""),
                        "contact_number": req.phone if req.phone is not None else (old_phone or ""),
                        "email_address": req.email if req.email is not None else (old_email or ""),
                        "total_experience": req.total_experience if req.total_experience is not None else (old_exp or "0"),
                        "skills": req.skills if req.skills is not None else (old_skills or ""),
                        "education": req.education if req.education is not None else (old_edu or ""),
                        "qualification": req.qualification if req.qualification is not None else (old_qual or ""),
                        "gender": req.gender if req.gender is not None else (old_gender or ""),
                        "address": req.address if req.address is not None else (old_address or ""),
                    }
                    try:
                        match_res = match_candidate_with_jd(cand_payload, jd_text)
                        new_match_pct = match_res.get("match_percentage", 0)
                        new_match_exp = match_res.get("match_explanation", "")
                        re_matched = True
                    except Exception as err:
                        logger.warning("Re-matching failed on edit for candidate %s: %s", candidate_id, err)

    fields = {
        "name": req.name,
        "email": req.email,
        "phone": req.phone,
        "gender": req.gender,
        "address": req.address,
        "total_experience": req.total_experience,
        "skills": req.skills,
        "education": req.education,
        "qualification": req.qualification,
        "linkedin_url": req.linkedin_url,
        "github_url": req.github_url,
        "reached": req.reached,
        "remark": req.remark,
    }
    if re_matched:
        fields["match_percentage"] = new_match_pct
        fields["match_explanation"] = new_match_exp

    updates = [(col, val) for col, val in fields.items() if val is not None]
    if not updates:
        return {"message": "No updates provided", "re_matched": False}

    sql = "UPDATE candidates SET " + ", ".join(f"{col} = %s" for col, _ in updates)
    sql += " WHERE id = %s"
    params = [val for _, val in updates] + [candidate_id]

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            conn.commit()

    logger.info("Candidate updated: %s (re_matched=%s)", candidate_id, re_matched)
    return {
        "message": "Candidate updated successfully" + (" (AI match score recalculated)" if re_matched else ""),
        "re_matched": re_matched,
        "match_percentage": new_match_pct,
        "match_explanation": new_match_exp,
    }


@router.put("/{candidate_id}/status")
def update_candidate_status(candidate_id: str, req: UpdateCandidateStatusRequest):
    """Update candidate reached status or remarks."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            updates = []
            params = []
            if req.reached is not None:
                updates.append("reached = %s")
                params.append(req.reached)
            if req.remark is not None:
                updates.append("remark = %s")
                params.append(req.remark)
            if not updates:
                return {"message": "No updates provided"}
            sql = f"UPDATE candidates SET {', '.join(updates)} WHERE id = %s"
            params.append(candidate_id)
            cur.execute(sql, tuple(params))
            conn.commit()
    logger.info("Status updated for candidate: %s", candidate_id)
    return {"message": "Status updated successfully"}


@router.delete("/{candidate_id}")
def delete_candidate(candidate_id: str):
    """Delete a candidate record."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM candidates WHERE id = %s", (candidate_id,))
            conn.commit()
    logger.info("Candidate deleted: %s", candidate_id)
    return {"message": "Candidate deleted successfully"}


# ── Helper ────────────────────────────────────────────────────────────────────

def _row_to_dict(r) -> dict:
    return {
        "candidate_id": str(r[0]),
        "name": r[1] or "",
        "email": r[2] or "",
        "phone": r[3] or "",
        "gender": r[4] or "",
        "address": r[5] or "",
        "total_experience": r[6] or "",
        "skills": [s.strip() for s in (r[7] or "").split(",") if s.strip()],
        "education": r[8] or "",
        "qualification": r[9] or "",
        "linkedin_url": r[10] or "",
        "github_url": r[11] or "",
        "job_id": str(r[12]) if r[12] else None,
        "org_id": str(r[13]) if r[13] else None,
        "hr_id": str(r[14]) if r[14] else None,
        "filename": r[15] or "",
        "resume_text": r[16] or "",
        "match_percentage": r[17] or 0,
        "match_explanation": r[18] or "",
        "reached": r[19] or False,
        "remark": r[20] or "",
        "created_at": str(r[21]) if r[21] else "",
    }
