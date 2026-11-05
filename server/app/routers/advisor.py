import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common import get_owned
from ..config import get_settings
from ..db import SessionLocal, get_db
from ..models import AdvisorMessage, AdvisorThread, User
from ..security import current_user
from ..services import advisor

router = APIRouter(prefix="/api/advisor", tags=["advisor"])

HISTORY_LIMIT = 20  # earlier turns sent back to the model


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    thread_id: int | None = None


def _msg_out(m: AdvisorMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "sources": m.sources or [], "created_at": m.created_at}


@router.get("/status")
def status(user: User = Depends(current_user)):
    return {"configured": advisor.credentials_available(), "model": get_settings().advisor_model}


@router.get("/threads")
def list_threads(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AdvisorThread).where(AdvisorThread.user_id == user.id).order_by(AdvisorThread.id.desc()).limit(50)
    )
    return [{"id": t.id, "title": t.title, "created_at": t.created_at} for t in rows]


@router.get("/threads/{thread_id}")
def get_thread(thread_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = get_owned(db, AdvisorThread, thread_id, user.id, "Conversation")
    return {"id": t.id, "title": t.title, "messages": [_msg_out(m) for m in t.messages]}


@router.delete("/threads/{thread_id}", status_code=204)
def delete_thread(thread_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, AdvisorThread, thread_id, user.id, "Conversation"))
    db.commit()


@router.post("/chat")
def chat(data: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Stream the advisor's answer as server-sent events."""
    if not advisor.credentials_available():
        raise HTTPException(503, "The AI advisor isn't set up yet. Add ANTHROPIC_API_KEY to server/.env and restart the server.")

    if data.thread_id:
        thread = get_owned(db, AdvisorThread, data.thread_id, user.id, "Conversation")
    else:
        title = " ".join(data.message.split())[:80]
        thread = AdvisorThread(user_id=user.id, title=title)
        db.add(thread)
        db.flush()

    prior = [{"role": m.role, "content": m.content} for m in thread.messages][-HISTORY_LIMIT:]
    db.add(AdvisorMessage(thread_id=thread.id, role="user", content=data.message))
    db.commit()

    snapshot = advisor.financial_snapshot(db, user.id)
    history = [*prior, {"role": "user", "content": data.message}]
    thread_id = thread.id

    def events():
        yield _sse({"type": "thread", "thread_id": thread_id})
        try:
            for event in advisor.stream_answer(snapshot, history):
                if event["type"] == "done":
                    with SessionLocal() as s:
                        msg = AdvisorMessage(thread_id=thread_id, role="assistant", content=event["text"] or "_(no answer)_",
                                             sources=event["sources"])
                        s.add(msg)
                        s.commit()
                        event = {**event, "message": _msg_out(msg)}
                yield _sse(event)
        except Exception as exc:  # noqa: BLE001 - surface any API failure to the user
            yield _sse({"type": "error", "message": _friendly_error(exc)})

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, default=str)}\n\n"


def _friendly_error(exc: Exception) -> str:
    import anthropic

    if isinstance(exc, anthropic.AuthenticationError):
        return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in server/.env."
    if isinstance(exc, anthropic.RateLimitError):
        return "The advisor is busy (rate limited). Please try again in a minute."
    if isinstance(exc, anthropic.APIStatusError):
        return f"The AI service returned an error ({exc.status_code}). Please try again."
    if isinstance(exc, anthropic.APIConnectionError):
        return "Couldn't reach the AI service. Check your internet connection."
    return "Something went wrong while generating the answer."
