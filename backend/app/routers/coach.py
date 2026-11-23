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


# ---------- Chế độ trò chuyện ----------
SCENARIOS = {
    "free": "Free conversation about the learner's work, studies, tech news or daily life in IT.",
    "interview": "Job interview for a junior data scientist / AI engineer position. You are the interviewer.",
    "standup": "Daily stand-up meeting in an agile team. You are the scrum master asking about progress and blockers.",
    "project": "The learner presents a project they built (any IT/AI project). You are a curious colleague asking questions.",
    "explain": "The learner explains a technical concept to you; you are a non-technical manager who asks simple questions.",
    "incident": "A production incident review: something broke last night. You are the team lead asking what happened and how to prevent it.",
    "review": "Code review discussion: you reviewed the learner's pull request and discuss your comments politely.",
}


class TalkIn(BaseModel):
    messages: list[Turn] = []
    scenario: str = "free"
    level: Optional[str] = None


def _level(session: Session, level: Optional[str]) -> str:
    p = session.get(Profile, 1)
    return level or (p.level if p else "B1")


def _talk_mock(msgs: list[Turn]) -> dict:
    if not msgs:
        return {"reply_en": "Hi! Nice to meet you. What are you working on these days?",
                "reply_vi": "Chào bạn! Dạo này bạn đang làm gì?", "correction": None, "help": None, "mock": True}
    last = msgs[-1].content
    vi = any(ch in last.lower() for ch in "ăâđêôơư")
    return {
        "reply_en": "Great, try saying that in English!" if vi else "That sounds interesting. Why did you choose that approach?",
        "reply_vi": "Hay lắm, bạn thử nói bằng tiếng Anh nhé!" if vi else "Nghe thú vị đấy. Tại sao bạn chọn cách đó?",
        "correction": None if vi else {"said": last[:60], "better": last[:60], "why_vi": "(mẫu) Câu sửa sẽ hiện ở đây."},
        "help": {"say_vi": f"Ý bạn là: {last}. Bạn có thể nói như sau.", "english": "I'm building a chatbot for customer support.",
                 "steps": [{"en": "I'm building", "vi": "hiện tại tiếp diễn cho việc đang làm"}]} if vi else None,
        "mock": True,
    }


@router.get("/scenarios")
def scenarios():
    names = {"free": "Trò chuyện tự do", "interview": "Phỏng vấn xin việc (Data/AI)", "standup": "Họp stand-up hằng ngày",
             "project": "Giới thiệu dự án của bạn", "explain": "Giải thích khái niệm cho người không chuyên",
             "incident": "Họp xử lý sự cố hệ thống", "review": "Thảo luận code review"}
    return [{"key": k, "name": names[k]} for k in SCENARIOS]


@router.post("/talk")
def talk(body: TalkIn, session: Session = Depends(get_session)):
    msgs = [m for m in body.messages if m.content.strip()][-20:]
    if msgs and msgs[-1].role != "user":
        raise HTTPException(400, "Tin nhắn cuối phải là của người học")
    if not llm.get_settings().llm_enabled:
        return _talk_mock(msgs)
    convo = [{"role": "user", "content": "(start)"}]
    for m in msgs:
        convo.append({"role": "assistant" if m.role == "coach" else "user", "content": m.content})
    system = prompts.TALK_SYSTEM.format(level=_level(session, body.level), scenario=SCENARIOS.get(body.scenario, SCENARIOS["free"]))
    try:
        data = llm.extract_json(llm.chat(convo, system=system, max_tokens=2000, effort="low"))
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    except ValueError as e:
        raise HTTPException(502, "Trợ lý trả lời không đúng định dạng, hãy thử lại.") from e
    if not isinstance(data, dict) or not data.get("reply_en"):
        raise HTTPException(502, "Trợ lý trả lời không đúng định dạng, hãy thử lại.")
    return data


@router.post("/talk/summary")
def talk_summary(body: TalkIn, session: Session = Depends(get_session)):
    from ..models import Attempt

    user_turns = [m for m in body.messages if m.role == "user" and m.content.strip()]
    if not user_turns:
        raise HTTPException(400, "Chưa có lượt nói nào để nhận xét")
    transcript = "\n".join(f"{'Learner' if m.role == 'user' else 'Coach'}: {m.content}" for m in body.messages)
    level = _level(session, body.level)
    try:
        result = llm.complete_json(
            prompts.TALK_SUMMARY.format(level=level, scenario=SCENARIOS.get(body.scenario, SCENARIOS["free"]), transcript=transcript),
            mock=lambda: {"summary_vi": "[mock] Nhận xét sẽ hiện ở đây khi có key LLM.", "strengths": ["Giữ được mạch hội thoại"],
                          "fixes": [], "phrases": [{"en": "That's a good question.", "vi": "Câu hỏi hay đấy."}],
                          "english_ratio_vi": "", "level": level, "next_vi": "Thử tình huống phỏng vấn."},
            max_tokens=3000,
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    session.add(Attempt(skill="conversation", task=body.scenario, input_text=transcript, result=result))
    session.commit()
    return result
