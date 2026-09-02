"""Router: Candidates — resume upload, matching, listing, status update, deletion."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.database import get_db_connection
from app.services.resume_parser import parse_resume
from app.services.embedding_service import get_embedding
from app.models.schemas import UpdateCandidateStatusRequest
from app.services.ai_service import match_candidate_with_jd
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


@router.post("/upload")
async def upload_resume(
    job_id: str = Form(...),
    org_id: str = Form(...),
    hr_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Upload and process candidate resume with AI matching."""
    try:
        content = await file.read()
        parsed = parse_resume(content, file.filename)

        # Fetch JD description for matching
        jd_text = ""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT experience_required, skills_required, job_description FROM job_vacancies WHERE id = %s",
                    (job_id,)
                )
                row = cur.fetchone()
                if row:
                    experience = row[0] or ""
                    skills = row[1] or ""
                    desc = row[2] or ""
                    jd_text = f"""
                    Job Requirements:
                    Experience Required: {experience}
                    Required Skills: {skills}
                    Description: {desc}
                    """

        # Calculate match percentage
        match_data = {"match_percentage": 0, "match_explanation": "JD not found for matching"}
        if jd_text:
            match_data = match_candidate_with_jd(parsed, jd_text)

        candidate_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        # Store both candidate info and vector embedding
        embedding = get_embedding(parsed["raw_text"])

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO candidates (id, name, email, phone, gender, total_experience, skills, education, job_id, org_id, hr_id, filename, embedding, match_percentage, match_explanation, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        candidate_id, 
                        parsed["candidate_name"], 
                        parsed["email_address"], 
                        parsed["contact_number"], 
                        parsed["gender"], 
                        parsed["total_experience"], 
                        parsed["skills"], 
                        parsed["education"],
                        job_id, 
                        org_id, 
                        hr_id,
                        file.filename, 
                        embedding,
                        match_data["match_percentage"],
                        match_data["match_explanation"],
                        now
                    )
                )
                conn.commit()

        logger.info("Candidate resume uploaded and stored: %s (id=%s, match=%s%%)", parsed["candidate_name"], candidate_id, match_data["match_percentage"])
        return {
            "candidate_id": candidate_id,
            "name": parsed["candidate_name"],
            "email": parsed["email_address"],
            "phone": parsed["contact_number"],
            "gender": parsed["gender"],
            "total_experience": parsed["total_experience"],
            "skills": parsed["skills"],
            "education": parsed["education"],
            "job_id": job_id,
            "org_id": org_id,
            "hr_id": hr_id,
            "filename": file.filename,
            "match_percentage": match_data["match_percentage"],
            "match_explanation": match_data["match_explanation"],
            "created_at": now,
        }
    except Exception as e:
        logger.error("Error processing candidate upload: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process candidate resume upload.")


@router.get("")
def list_candidates(job_id: str = None, org_id: str = None, hr_id: str = None, sort_by_match: bool = False, top_10: bool = False):
    """List candidates with optional filters and sorting."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = "SELECT id, name, email, phone, gender, total_experience, skills, job_id, org_id, hr_id, filename, match_percentage, match_explanation, reached, remark, created_at FROM candidates"
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
            
            if where_clauses:
                query += " WHERE " + " AND ".join(where_clauses)
            
            if sort_by_match:
                query += " ORDER BY match_percentage DESC"
            elif top_10:
                query += " ORDER BY match_percentage DESC LIMIT 10"
            else:
                query += " ORDER BY created_at DESC"
                
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
            
            candidates = []
            for r in rows:
                candidates.append({
                    "candidate_id": str(r[0]),
                    "name": r[1],
                    "email": r[2],
                    "phone": r[3],
                    "gender": r[4],
                    "total_experience": r[5],
                    "skills": r[6].split(",") if r[6] else [],
                    "job_id": str(r[7]),
                    "org_id": str(r[8]),
                    "hr_id": str(r[9]) if r[9] else None,
                    "filename": r[10],
                    "match_percentage": r[11],
                    "match_explanation": r[12],
                    "reached": r[13],
                    "remark": r[14],
                    "created_at": str(r[15]),
                })
    return {"candidates": candidates}


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
    logger.info("Updated status for candidate: %s", candidate_id)
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
