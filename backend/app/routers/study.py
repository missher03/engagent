"""Nghe & đọc theo chủ đề tự chọn: tìm nguồn, lập khóa nhỏ, tạo bài đọc dài, bài nghe, câu hỏi và hỏi đáp."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Attempt, Course, Profile
from ..services import llm, prompts, research

router = APIRouter(prefix="/api/study", tags=["study"])
LEVELS = ("B1", "B2", "C1")


def _profile_level(session: Session) -> str:
    p = session.get(Profile, 1)
    return p.level if p and p.level in LEVELS else "B1"


def _get(session: Session, cid: int) -> Course:
    c = session.get(Course, cid)
    if not c:
        raise HTTPException(404, "Không có khóa học này")
    return c


def _sources_text(c: Course, limit: int = 14000) -> str:
    if not c.sources:
        return "(none)"
    per = max(2000, limit // len(c.sources))
    return "\n\n".join(f"### {s['title']}\n{s['text'][:per]}" for s in c.sources)[:limit]


def _lesson(c: Course, idx: int) -> dict:
    if not 0 <= idx < len(c.lessons):
        raise HTTPException(404, "Không có bài này")
    return c.lessons[idx]


def _ready(les: dict) -> dict:
    """Bài phải có nội dung đọc trước khi tạo bài nghe/câu hỏi. Chế độ mock dùng nội dung mẫu."""
    if les.get("content"):
        return les
    if not llm.get_settings().llm_enabled:
        return {**les, "content": _mock_lesson(les["title"])}
    raise HTTPException(400, "Hãy mở bài đọc trước")


def _lesson_text(les: dict) -> str:
    content = les.get("content") or {}
    return "\n\n".join(f"## {s['heading']}\n" + "\n".join(s["paragraphs"]) for s in content.get("sections", []))


def _save(session: Session, c: Course, idx: int, les: dict) -> None:
    lessons = list(c.lessons)
    lessons[idx] = les
    c.lessons = lessons  # gán list mới để SQLAlchemy ghi cột JSON
    session.add(c)
    session.commit()
    session.refresh(c)


def _summary(c: Course) -> dict:
    return {"id": c.id, "topic": c.topic, "title": c.title, "level": c.level, "goal": c.goal, "summary_vi": c.summary_vi,
            "sources": [{"title": s["title"], "url": s["url"]} for s in c.sources],
            "lessons": [{"title": l["title"], "focus": l.get("focus", ""), "key_points": l.get("key_points", []),
                         "ready": bool(l.get("content")), "done": l.get("done", False), "score": l.get("score")} for l in c.lessons],
            "created_at": c.created_at.isoformat()}


# ---------- mock (khi chưa có key LLM) ----------
def _mock_outline(topic: str, n: int) -> dict:
    return {"title": f"{topic}: a practical introduction", "summary_vi": f"[mock] Khóa học mẫu về {topic}. Cần key LLM để AI viết nội dung thật.",
            "lessons": [{"title": f"Part {i + 1}: {t} of {topic}", "focus": f"Explains the {t.lower()} of {topic}.",
                         "key_points": ["what it is", "why it matters", "an example", "common mistakes"]}
                        for i, t in enumerate(["Basics", "Core concepts", "Architecture", "In practice", "Trade-offs", "Advanced topics"][:n])]}


def _mock_lesson(title: str) -> dict:
    para = ("This is a sample paragraph used when no LLM key is set. When the key is available, the lesson will contain real explanations, "
            "examples and a case study written for your level, using sources such as Wikipedia and the links you add.")
    return {"sections": [{"heading": h, "paragraphs": [para, para]} for h in ("Introduction", "How it works", "A real example", "Summary")],
            "glossary": [{"term": "throughput", "vi": "thông lượng", "definition": "how much work a system does per second"},
                         {"term": "latency", "vi": "độ trễ", "definition": "how long one request takes"}],
            "takeaways_vi": ["[mock] Ý chính 1", "[mock] Ý chính 2"], "mock": True}


# ---------- khóa học ----------
class CourseIn(BaseModel):
    topic: str
    level: Optional[str] = None
    goal: str = "overview"
    lessons: int = 5
    urls: list[str] = []


@router.post("/courses")
def create_course(body: CourseIn, session: Session = Depends(get_session)):
    topic = body.topic.strip()
    if len(topic) < 2:
        raise HTTPException(400, "Hãy nhập chủ đề muốn học")
    level = body.level if body.level in LEVELS else _profile_level(session)
    goal = body.goal if body.goal in prompts.GOALS else "overview"
    n = min(6, max(3, body.lessons))
    lo, hi = prompts.LESSON_WORDS[level]
    sources = research.gather(topic, body.urls) if llm.get_settings().llm_enabled else []
    c = Course(topic=topic, level=level, goal=goal, sources=sources)
    try:
        out = llm.complete_json(
            prompts.STUDY_OUTLINE.format(level=level, topic=topic, goal=prompts.GOALS[goal], n=n, min_w=lo, max_w=hi,
                                         sources=_sources_text(c, 10000)),
            mock=lambda: _mock_outline(topic, n), max_tokens=3000, effort="medium",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    lessons = [l for l in (out.get("lessons") or []) if isinstance(l, dict) and l.get("title")] if isinstance(out, dict) else []
    if not lessons:
        raise HTTPException(502, "AI chưa lập được dàn ý, hãy thử lại.")
    c.title = out.get("title") or topic
    c.summary_vi = out.get("summary_vi", "")
    c.lessons = [{"title": l["title"], "focus": l.get("focus", ""), "key_points": l.get("key_points", []),
                  "content": None, "listening": None, "quiz": None, "done": False, "score": None} for l in lessons[:6]]
    session.add(c)
    session.commit()
    session.refresh(c)
    return _summary(c)


@router.get("/courses")
def list_courses(session: Session = Depends(get_session)):
    return [_summary(c) for c in session.exec(select(Course).order_by(Course.created_at.desc())).all()]


@router.get("/courses/{cid}")
def get_course(cid: int, session: Session = Depends(get_session)):
    return _summary(_get(session, cid))


@router.delete("/courses/{cid}")
def delete_course(cid: int, session: Session = Depends(get_session)):
    session.delete(_get(session, cid))
    session.commit()
    return {"ok": True}


# ---------- bài học ----------
@router.get("/courses/{cid}/lessons/{idx}")
def get_lesson(cid: int, idx: int, session: Session = Depends(get_session)):
    """Trả bài; tạo nội dung đọc nếu chưa có."""
    c = _get(session, cid)
    les = dict(_lesson(c, idx))
    if not les.get("content"):
        lo, hi = prompts.LESSON_WORDS.get(c.level, (800, 1000))
        others = "; ".join(l["title"] for i, l in enumerate(c.lessons) if i != idx)
        try:
            content = llm.complete_json(
                prompts.STUDY_LESSON.format(idx=idx + 1, course=c.title, title=les["title"], focus=les.get("focus", ""),
                                            points="; ".join(les.get("key_points", [])), others=others,
                                            level_guide=prompts.LEVEL_GUIDE[c.level], level=c.level, min_w=lo, max_w=hi,
                                            sources=_sources_text(c)),
                mock=lambda: _mock_lesson(les["title"]), smart=True, max_tokens=7000, effort="medium",
            )
        except llm.LLMError as e:
            raise HTTPException(502, str(e)) from e
        if not isinstance(content, dict) or not content.get("sections"):
            raise HTTPException(502, "AI chưa viết xong bài, hãy thử lại.")
        les["content"] = content
        if not content.get("mock"):
            _save(session, c, idx, les)
    words = sum(len(p.split()) for s in les["content"]["sections"] for p in s["paragraphs"])
    return {**les, "idx": idx, "course_id": c.id, "course_title": c.title, "level": c.level, "words": words,
            "sources": [{"title": s["title"], "url": s["url"]} for s in c.sources]}


class ListenIn(BaseModel):
    format: str = "podcast"


@router.post("/courses/{cid}/lessons/{idx}/listening")
def make_listening(cid: int, idx: int, body: ListenIn, session: Session = Depends(get_session)):
    c = _get(session, cid)
    les = _ready(dict(_lesson(c, idx)))
    fmt = "podcast" if body.format != "lecture" else "lecture"
    cached = les.get("listening")
    if cached and cached.get("format") == fmt:
        return cached
    lo, hi = prompts.LESSON_WORDS.get(c.level, (800, 1000))
    text = _lesson_text(les)
    try:
        out = llm.complete_json(
            prompts.STUDY_LISTEN.format(level=c.level, fmt="a podcast conversation between two hosts" if fmt == "podcast" else "a short lecture",
                                        min_w=int(lo * 0.8), max_w=hi, lesson=text),
            mock=lambda: {"lines": [{"speaker": "Alex" if i % 2 == 0 else "Sam", "text": p}
                                    for i, p in enumerate(p for s in les["content"]["sections"] for p in s["paragraphs"][:1])], "mock": True},
            max_tokens=6000, effort="low",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    lines = [l for l in (out.get("lines") or []) if isinstance(l, dict) and l.get("text")] if isinstance(out, dict) else []
    if not lines:
        raise HTTPException(502, "AI chưa viết được bài nghe, hãy thử lại.")
    result = {"format": fmt, "lines": lines}
    if not out.get("mock"):
        les["listening"] = result
        _save(session, c, idx, les)
    return result


@router.post("/courses/{cid}/lessons/{idx}/quiz")
def make_quiz(cid: int, idx: int, session: Session = Depends(get_session)):
    c = _get(session, cid)
    les = _ready(dict(_lesson(c, idx)))
    if les.get("quiz"):
        return les["quiz"]
    try:
        out = llm.complete_json(
            prompts.STUDY_QUIZ.format(level=c.level, lesson=_lesson_text(les)),
            mock=lambda: {"questions": [{"type": "main idea", "question": "[mock] What is this lesson mainly about?",
                                         "options": [les["title"], "Cooking", "Football", "Music"], "answer": les["title"],
                                         "explanation_vi": "[mock]"}],
                          "open": {"question": "[mock] Explain the main idea in your own words.", "model_answer": "[mock]"}, "mock": True},
            max_tokens=4000, effort="low",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    qs = [q for q in (out.get("questions") or []) if isinstance(q, dict) and q.get("options") and q.get("answer") in q["options"]]
    if not qs:
        raise HTTPException(502, "AI chưa tạo được câu hỏi, hãy thử lại.")
    quiz = {"questions": qs, "open": out.get("open")}
    if not out.get("mock"):
        les["quiz"] = quiz
        _save(session, c, idx, les)
    return quiz


class OpenIn(BaseModel):
    answer: str


@router.post("/courses/{cid}/lessons/{idx}/open")
def grade_open(cid: int, idx: int, body: OpenIn, session: Session = Depends(get_session)):
    c = _get(session, cid)
    les = _ready(dict(_lesson(c, idx)))
    q = (les.get("quiz") or {}).get("open") or {}
    if len(body.answer.split()) < 5:
        raise HTTPException(400, "Hãy viết ít nhất một câu hoàn chỉnh")
    try:
        r = llm.complete_json(
            prompts.STUDY_GRADE_OPEN.format(level=c.level, lesson=_lesson_text(les)[:5000], question=q.get("question", ""),
                                            model=q.get("model_answer", ""), answer=body.answer),
            mock=lambda: {"content_score": 6, "language_band": 6.0, "feedback_vi": "[mock] Nhận xét thật cần key LLM.",
                          "corrected": body.answer, "missing_vi": []},
            max_tokens=2500, effort="low",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    return r


class DoneIn(BaseModel):
    done: bool = True
    score: Optional[float] = None


@router.post("/courses/{cid}/lessons/{idx}/done")
def mark_done(cid: int, idx: int, body: DoneIn, session: Session = Depends(get_session)):
    c = _get(session, cid)
    les = dict(_lesson(c, idx))
    les["done"] = body.done
    if body.score is not None:
        les["score"] = body.score
        session.add(Attempt(skill="reading", task=f"{c.id}:{idx}", input_text=les["title"], score=body.score))
    _save(session, c, idx, les)
    return _summary(c)


class Turn(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    messages: list[Turn]


@router.post("/courses/{cid}/lessons/{idx}/chat")
def chat(cid: int, idx: int, body: ChatIn, session: Session = Depends(get_session)):
    c = _get(session, cid)
    les = _ready(dict(_lesson(c, idx)))
    msgs = [m for m in body.messages if m.content.strip()][-16:]
    if not msgs or msgs[-1].role != "user":
        raise HTTPException(400, "Hãy nhập câu hỏi")
    if not llm.get_settings().llm_enabled:
        return {"reply": "[mock] Khi có key LLM, bạn có thể hỏi lại bất cứ điều gì về bài ở đây.", "mock": True}
    convo = [{"role": "assistant" if m.role == "coach" else "user", "content": m.content} for m in msgs]
    while convo and convo[0]["role"] != "user":
        convo.pop(0)
    system = prompts.STUDY_CHAT.format(level=c.level, course=c.title, title=les["title"], lesson=_lesson_text(les)[:9000])
    try:
        reply = llm.chat(convo, system=system, max_tokens=2000)
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    return {"reply": reply.strip()}


class TransIn(BaseModel):
    text: str


@router.post("/translate")
def translate(body: TransIn):
    t = body.text.strip()[:3000]
    if not t:
        raise HTTPException(400, "Thiếu đoạn cần dịch")
    if not llm.get_settings().llm_enabled:
        return {"vi": "[mock] Bản dịch sẽ hiện khi có key LLM."}
    try:
        return {"vi": llm.chat([{"role": "user", "content": prompts.STUDY_TRANSLATE.format(text=t)}], max_tokens=1500).strip()}
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
