"""
Router: Question Bank
  - POST   /api/interviewer/question-bank           — Create a question
  - GET    /api/interviewer/question-bank           — List questions (filter by difficulty)
  - PUT    /api/interviewer/question-bank/{q_id}   — Update a question
  - DELETE /api/interviewer/question-bank/{q_id}   — Delete a question
"""

import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["question_bank"])


class CreateQuestionRequest(BaseModel):
    question: str
    difficulty: str          # Easy | Medium | Hard
    category: Optional[str] = None

    class Config:
        str_strip_whitespace = True


class UpdateQuestionRequest(BaseModel):
    question: Optional[str] = None
    difficulty: Optional[str] = None
    category: Optional[str] = None

    class Config:
        str_strip_whitespace = True


def _get_interviewer_context(cur, interviewer_id: str) -> tuple:
    cur.execute(
        "SELECT organization_id, branch_id, department_id FROM interviewers WHERE id = %s LIMIT 1",
        (interviewer_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="Interviewer not found or access denied")
    return str(row[0]), str(row[1]), str(row[2]) if row[2] else None


@router.post("/api/interviewer/question-bank")
def create_question(
    payload: CreateQuestionRequest,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Create a new question in the bank."""
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    allowed_difficulties = {"Easy", "Medium", "Hard"}
    if payload.difficulty not in allowed_difficulties:
        raise HTTPException(status_code=400, detail=f"Difficulty must be one of: {allowed_difficulties}")

    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question text cannot be empty.")

    q_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id, dept_id = _get_interviewer_context(cur, x_interviewer_id)

            cur.execute(
                """
                INSERT INTO question_bank (id, org_id, branch_id, department_id, created_by_interviewer_id, question, difficulty, category, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (q_id, org_id, branch_id, dept_id, x_interviewer_id,
                 payload.question.strip(), payload.difficulty,
                 (payload.category or "").strip() or None, now, now),
            )
            conn.commit()

    logger.info("Question %s created by interviewer %s", q_id, x_interviewer_id)
    return {"message": "Question created successfully", "question_id": q_id}


@router.get("/api/interviewer/question-bank")
def list_questions(
    difficulty: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """List all questions for the interviewer's organization, optionally filtered by difficulty."""
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            params = [org_id]
            where = ["qb.org_id = %s"]

            if difficulty and difficulty in ("Easy", "Medium", "Hard"):
                where.append("qb.difficulty = %s")
                params.append(difficulty)

            if search and search.strip():
                where.append("qb.question ILIKE %s")
                params.append(f"%{search.strip()}%")

            sql = f"""
                SELECT qb.id, qb.question, qb.difficulty, qb.category,
                       qb.created_at, iv.full_name AS created_by
                FROM question_bank qb
                LEFT JOIN interviewers iv ON qb.created_by_interviewer_id = iv.id
                WHERE {' AND '.join(where)}
                ORDER BY qb.created_at DESC
            """
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

            return {
                "questions": [
                    {
                        "id": str(r[0]),
                        "question": r[1],
                        "difficulty": r[2],
                        "category": r[3] or "",
                        "created_at": str(r[4]) if r[4] else "",
                        "created_by": r[5] or "Unknown",
                        "is_mine": True,  # Simplified — all org questions are visible
                    }
                    for r in rows
                ]
            }


@router.put("/api/interviewer/question-bank/{q_id}")
def update_question(
    q_id: str,
    payload: UpdateQuestionRequest,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Update a question created by this interviewer."""
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            cur.execute(
                "SELECT id FROM question_bank WHERE id = %s AND org_id = %s AND created_by_interviewer_id = %s LIMIT 1",
                (q_id, org_id, x_interviewer_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Question not found or you don't have permission to edit it.")

            updates = []
            params = []
            if payload.question is not None:
                updates.append("question = %s")
                params.append(payload.question.strip())
            if payload.difficulty is not None:
                if payload.difficulty not in ("Easy", "Medium", "Hard"):
                    raise HTTPException(status_code=400, detail="Invalid difficulty.")
                updates.append("difficulty = %s")
                params.append(payload.difficulty)
            if payload.category is not None:
                updates.append("category = %s")
                params.append(payload.category.strip() or None)

            if not updates:
                return {"message": "No changes provided."}

            updates.append("updated_at = NOW()")
            params.append(q_id)

            cur.execute(
                f"UPDATE question_bank SET {', '.join(updates)} WHERE id = %s",
                tuple(params),
            )
            conn.commit()

    return {"message": "Question updated successfully"}


@router.delete("/api/interviewer/question-bank/{q_id}")
def delete_question(
    q_id: str,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Delete a question created by this interviewer."""
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            cur.execute(
                "SELECT id FROM question_bank WHERE id = %s AND org_id = %s AND created_by_interviewer_id = %s LIMIT 1",
                (q_id, org_id, x_interviewer_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Question not found or you don't have permission to delete it.")

            cur.execute("DELETE FROM question_bank WHERE id = %s", (q_id,))
            conn.commit()

    return {"message": "Question deleted successfully"}
