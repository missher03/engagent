"""Bài đọc/nghe sinh bằng LLM, chấm viết, gia sư/giám khảo, hồ sơ người học."""
from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Attempt, Card, Lesson, Profile, Word, now
from ..services import content, llm, prompts, tts

router = APIRouter(prefix="/api", tags=["learn"])
DATA = Path(__file__).resolve().parent.parent / "data"
TOPICS = json.loads((DATA / "topics.json").read_text(encoding="utf-8"))
WRITING_TASKS = json.loads((DATA / "writing_tasks.json").read_text(encoding="utf-8"))


def get_profile(session: Session) -> Profile:
    p = session.get(Profile, 1)
    if not p:
        p = Profile(id=1)
        session.add(p)
        session.commit()
        session.refresh(p)
    return p


# ---------- Hồ sơ ----------
class ProfileIn(BaseModel):
    level: Optional[str] = None
    thesis_title: Optional[str] = None
    thesis_summary: Optional[str] = None
    defense_date: Optional[str] = None


@router.get("/profile")
def read_profile(session: Session = Depends(get_session)):
    return get_profile(session)


@router.put("/profile")
def update_profile(body: ProfileIn, session: Session = Depends(get_session)):
    p = get_profile(session)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


# ---------- Bài đọc / nghe ----------
@router.get("/topics")
def topics():
    return {"topics": TOPICS, "formats": content.FORMATS}


class GenerateLesson(BaseModel):
    topic_id: int = 9
    level: str = "B1"
    format: str = "research abstract"
    target_words: list[str] = []  # trống -> tự chọn từ chủ đề + sổ từ
    subtopic: Optional[str] = None  # vd "ml-eval": lấy từ của chủ đề nhỏ trong kho 2000 từ
    with_audio: bool = True


def pick_words(session: Session, topic_id: int, n_target: int = 8, n_review: int = 6,
               subtopic: Optional[str] = None) -> tuple[list[str], list[str]]:
    if subtopic:
        topic_words = [w.term for w in session.exec(select(Word)).all() if subtopic in (w.subtopics or [])]
    else:
        topic_words = [w.term for w in session.exec(select(Word).where(Word.topic == topic_id)).all()]
    random.shuffle(topic_words)
    due = session.exec(
        select(Word.term).join(Card, Card.word_id == Word.id).where(Card.due <= now()).limit(n_review)
    ).all()
    return topic_words[:n_target], [w for w in due if w not in topic_words[:n_target]]


@router.post("/lessons/generate")
def generate_lesson(body: GenerateLesson, session: Session = Depends(get_session)):
    topic = dict(next((t for t in TOPICS if t["id"] == body.topic_id), TOPICS[0]))
    if body.subtopic:
        from ..services.vocab_data import parse_taxonomy

        name = next((st["name"] for c in parse_taxonomy() for st in c["subtopics"] if st["key"] == body.subtopic), None)
        if name:
            topic.update(name=f"{name} ({body.subtopic})", grammar=topic["grammar"])
    target, review = (body.target_words, []) if body.target_words else pick_words(session, topic["id"], subtopic=body.subtopic)
    profile = get_profile(session)
    key = hashlib.sha256(json.dumps([topic["id"], body.level, body.format, sorted(target)]).encode()).hexdigest()
    cached = session.exec(select(Lesson).where(Lesson.cache_key == key)).first()
    if cached:
        return cached
    try:
        gen, qc = content.generate_text(
            topic=topic["name"], level=body.level, fmt=body.format, target_words=target,
            review_words=review, grammar_focus=topic["grammar"], thesis_topic=profile.thesis_title,
        )
        questions = content.generate_quiz(gen["text"], target, body.level)
        audio = tts.synthesize(gen["text"]) if body.with_audio else None
    except (llm.LLMError, tts.TTSError) as e:
        raise HTTPException(502, str(e)) from e
    lesson = Lesson(
        cache_key=key, title=gen.get("title", topic["name"]), format=body.format, level=body.level,
        topic=topic["name"], text=gen["text"], target_words=target, questions=questions,
        audio_path=audio, qc_report=qc,
    )
    if not gen.get("title", "").startswith("[mock]"):
        session.add(lesson)
        session.commit()
        session.refresh(lesson)
    return lesson


@router.get("/lessons")
def list_lessons(session: Session = Depends(get_session)):
    rows = session.exec(select(Lesson).order_by(Lesson.created_at.desc()).limit(50)).all()
    return [{"id": l.id, "title": l.title, "level": l.level, "format": l.format, "topic": l.topic,
             "has_audio": bool(l.audio_path), "created_at": l.created_at} for l in rows]


@router.get("/lessons/{lesson_id}")
def get_lesson(lesson_id: int, session: Session = Depends(get_session)):
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Không có bài này")
    return lesson


# ---------- Chấm viết ----------
@router.get("/writing/tasks")
def writing_tasks():
    return WRITING_TASKS


class WritingIn(BaseModel):
    task_id: Optional[str] = None
    task_prompt: str = ""
    required_words: list[str] = []
    required_structures: list[str] = []
    text: str


@router.post("/writing/grade")
def grade_writing(body: WritingIn, session: Session = Depends(get_session)):
    task = next((t for t in WRITING_TASKS if t["id"] == body.task_id), None)
    task_prompt = body.task_prompt or (f"{task['prompt']}\nData: {task['data']}" if task else "Free writing")
    req_words = body.required_words or (task["required_words"] if task else [])
    req_struct = body.required_structures or (task["required_structures"] if task else [])
    if len(body.text.split()) < 10:
        raise HTTPException(400, "Bài viết quá ngắn (tối thiểu 10 từ)")
    try:
        result = llm.complete_json(
            prompts.GRADE_WRITING.format(
                task_prompt=task_prompt, required_words=", ".join(req_words),
                required_structures=", ".join(req_struct), writing_rubric=prompts.WRITING_RUBRIC,
                learner_text=body.text,
            ),
            mock=lambda: {
                "scores": {"task": 3, "coherence": 3, "vocabulary": 3, "grammar": 3},
                "reasons": {k: "[mock] cần ANTHROPIC_API_KEY để chấm thật" for k in ("task", "coherence", "vocabulary", "grammar")},
                "errors": [], "missing": [w for w in req_words if w.lower() not in body.text.lower()],
                "corrected_text": body.text, "upgrades": [], "overall_level": "B1",
            },
            smart=True, max_tokens=4000, effort="medium",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    scores = result.get("scores") or {}
    session.add(Attempt(skill="writing", task=body.task_id or "free", input_text=body.text, result=result,
                        score=sum(scores.values()) / len(scores) if scores else None))
    session.commit()
    return result


# ---------- Giám khảo hội đồng (Q&A luận văn) ----------
class ChatTurn(BaseModel):
    role: str  # "examiner" | "student"
    content: str


class ExaminerIn(BaseModel):
    turns: list[ChatTurn] = []
    n_questions: int = 5


MOCK_QUESTIONS = [
    "Why did you choose LSTM instead of a simpler model?",
    "How did you avoid look-ahead bias in your backtest?",
    "Would your results still hold in a bear market?",
    "How could a fund manager actually use your model?",
    "Did you consider transaction costs and taxes?",
]


@router.post("/examiner/next")
def examiner_next(body: ExaminerIn, session: Session = Depends(get_session)):
    p = get_profile(session)
    asked = sum(1 for t in body.turns if t.role == "examiner")
    if asked >= body.n_questions:
        return {"done": True, "question": None}
    if not llm.get_settings().llm_enabled:
        return {"done": False, "question": MOCK_QUESTIONS[asked % len(MOCK_QUESTIONS)], "mock": True}
    # Claude: examiner = assistant, student = user. Tin nhắn đầu là lời mở của sinh viên.
    messages = [{"role": "user", "content": "Hello, I'm ready for the questions."}]
    for t in body.turns:
        messages.append({"role": "assistant" if t.role == "examiner" else "user", "content": t.content})
    try:
        q = llm.chat(
            messages,
            system=prompts.EXAMINER_SYSTEM.format(thesis_title=p.thesis_title, thesis_summary=p.thesis_summary, level=p.level),
            smart=True, max_tokens=600, effort="low",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    return {"done": False, "question": q.strip()}


@router.post("/examiner/feedback")
def examiner_feedback(body: ExaminerIn, session: Session = Depends(get_session)):
    transcript = "\n".join(f"{'Examiner' if t.role == 'examiner' else 'Student'}: {t.content}" for t in body.turns)
    try:
        result = llm.complete_json(
            prompts.EXAMINER_FEEDBACK.format(transcript=transcript),
            mock=lambda: {
                "per_question": [
                    {"question": t.content, "answer_quality": 3, "what_was_good": "[mock]", "better_answer": "[mock]"}
                    for t in body.turns if t.role == "examiner"
                ],
                "language_issues": ["[mock] cần ANTHROPIC_API_KEY"],
                "top_3_phrases_to_learn": [
                    "That's beyond the scope of this study, but...",
                    "If I understand correctly, you're asking whether...",
                    "That's a fair point.",
                ],
            },
            smart=True, max_tokens=5000, effort="medium",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    qs = result.get("per_question") or []
    avg = sum(q.get("answer_quality", 0) for q in qs) / len(qs) if qs else None
    session.add(Attempt(skill="examiner", task="mock defense", input_text=transcript, result=result, score=avg))
    session.commit()
    return result


@router.get("/progress")
def progress(session: Session = Depends(get_session)):
    rows = session.exec(select(Attempt).order_by(Attempt.created_at.desc()).limit(200)).all()
    by_skill: dict[str, list] = {}
    for a in rows:
        if a.score is not None:
            by_skill.setdefault(a.skill, []).append(a.score)
    return {k: {"count": len(v), "avg_last5": round(sum(v[:5]) / len(v[:5]), 2)} for k, v in by_skill.items()}
