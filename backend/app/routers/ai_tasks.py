"""Router: AI Tasks — persistent background task management endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from app.services.task_service import get_task, list_tasks
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/ai-tasks", tags=["ai-tasks"])


@router.get("/{task_id}")
def get_ai_task(task_id: str):
    """
    Get the current status and result of an AI background task.

    Returns:
        task_id, task_type, status ('pending'|'running'|'completed'|'failed'),
        result_data (when completed), error_message (when failed).
    """
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    return task


@router.get("")
def list_ai_tasks(
    created_by: Optional[str] = Query(None),
    org_id: Optional[str] = Query(None),
    task_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    List recent AI tasks with optional filters.
    Used by the frontend task manager to restore pending task state.
    """
    tasks = list_tasks(
        created_by=created_by,
        org_id=org_id,
        task_type=task_type,
        limit=limit,
    )
    return {"tasks": tasks, "count": len(tasks)}
