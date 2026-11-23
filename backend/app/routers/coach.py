"""Trợ lý nói: người học nói ý bằng tiếng Việt, AI xác nhận lại, hướng dẫn cách nói tiếng Anh và trả lời câu hỏi."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..db import get_session
from ..models import Profile
from ..services import llm, prompts

router = APIRouter(prefix="/api/coach", tags=["coach"])


class Turn(BaseModel):
    role: Literal["user", "coach"]
    content: str


class CoachIn(BaseModel):
    messages: list[Turn]
    level: Optional[str] = None


def _mock(last: str) -> dict:
    return {
        "mode": "explain",
        "say_vi": "Mình hiểu ý bạn rồi. Đây là cách nói bằng tiếng Anh, bạn nghe thử nhé. (Đây là trả lời mẫu vì chưa có key LLM.)",
        "understood_vi": f"Ý bạn là: {last}",
        "english": "In my opinion, we should test the model on new data before we deploy it.",
        "steps": [
            {"en": "In my opinion,", "vi": "Mở đầu khi nêu ý kiến, lịch sự hơn 'I think' một chút."},
            {"en": "we should test the model on new data", "vi": "'should' để khuyên; 'test ... on new data' là cụm hay dùng."},
            {"en": "before we deploy it.", "vi": "'before + mệnh đề' ở thì hiện tại đơn, không dùng 'will'."},
        ],
        "phrases": [{"en": "In my opinion", "vi": "theo tôi"}, {"en": "deploy a model", "vi": "triển khai mô hình"}],
        "try_vi": "Giờ bạn thử nói lại câu tiếng Anh này nhé.",
        "mock": True,
    }


@router.post("/chat")
def coach_chat(body: CoachIn, session: Session = Depends(get_session)):
    msgs = [m for m in body.messages if m.content.strip()][-16:]
    if not msgs or msgs[-1].role != "user":
        raise HTTPException(400, "Tin nhắn cuối phải là của người học")
    while msgs and msgs[0].role != "user":
        msgs = msgs[1:]
    if not llm.get_settings().llm_enabled:
        return _mock(msgs[-1].content)
    p = session.get(Profile, 1)
    level = body.level or (p.level if p else "B1")
    convo = [{"role": "assistant" if m.role == "coach" else "user", "content": m.content} for m in msgs]
    try:
        text = llm.chat(convo, system=prompts.COACH_SYSTEM.format(level=level), max_tokens=2500, effort="low")
        data = llm.extract_json(text)
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    except ValueError as e:
        raise HTTPException(502, "Trợ lý trả lời không đúng định dạng, hãy thử lại.") from e
    if not isinstance(data, dict) or not data.get("say_vi"):
        raise HTTPException(502, "Trợ lý trả lời không đúng định dạng, hãy thử lại.")
    data.setdefault("steps", []); data.setdefault("phrases", [])
    return data
