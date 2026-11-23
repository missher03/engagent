"""Tra từ, kho từ, sổ từ và ôn tập SRS."""
from __future__ import annotations

import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..db import get_session
from ..models import Card, ReviewLog, Word, now
from ..services import dictionary, srs

router = APIRouter(prefix="/api", tags=["vocab"])


def enrich(word: Word, session: Session, context: str = "") -> Word:
    """Tra từ điển + LLM một lần rồi lưu lại (cache)."""
    if word.enriched:
        return word
    info = dictionary.lookup(word.term, context)
    is_mock = (info.get("meaning_vi") or "").startswith("[mock]")
    for f in ("ipa", "audio_url", "definition_en", "meaning_vi", "example", "collocations"):
        current = getattr(word, f)
        stale = isinstance(current, str) and current.startswith("[mock]")
        if info.get(f) and (not current or stale):
            setattr(word, f, info[f])
    word.cefr = word.cefr or info.get("cefr")
    # Bản mock vẫn lưu để app chạy được, nhưng enriched=False để lần sau có key sẽ tra lại.
    word.enriched = not is_mock
    session.add(word)
    session.commit()
    session.refresh(word)
    return word


@router.get("/dictionary/lookup")
def lookup(q: str, context: str = "", session: Session = Depends(get_session)):
    term = q.strip()
    if not term:
        raise HTTPException(400, "Thiếu từ cần tra")
    word = session.exec(select(Word).where(func.lower(Word.term) == term.lower())).first()
    if word and word.enriched:
        result = word.model_dump()
        result["related"] = dictionary.fetch_related(term)
    else:
        result = dictionary.lookup(term, context)
        result["id"] = word.id if word else None
    card = session.exec(select(Card).where(Card.word_id == result.get("id"))).first() if result.get("id") else None
    result["in_notebook"] = bool(card)
    return result


@router.get("/decks")
def decks(session: Session = Depends(get_session)):
    rows = session.exec(select(Word.deck, func.count()).group_by(Word.deck)).all()
    return [{"deck": d, "count": c} for d, c in rows]


@router.get("/words")
def list_words(
    deck: Optional[str] = None, topic: Optional[int] = None, q: Optional[str] = None,
    session: Session = Depends(get_session),
):
    stmt = select(Word)
    if deck:
        stmt = stmt.where(Word.deck == deck)
    if topic:
        stmt = stmt.where(Word.topic == topic)
    if q:
        stmt = stmt.where(Word.term.contains(q))
    words = session.exec(stmt.order_by(Word.priority, Word.term)).all()
    in_nb = {c.word_id for c in session.exec(select(Card)).all()}
    return [{**w.model_dump(), "in_notebook": w.id in in_nb} for w in words]


class AddWord(BaseModel):
    term: str
    context: str = ""
    deck: str = "custom"
    topic: Optional[int] = None


@router.post("/notebook")
def add_to_notebook(body: AddWord, session: Session = Depends(get_session)):
    """Thêm từ (mới hoặc có sẵn trong kho) vào sổ từ và tạo thẻ ôn."""
    term = body.term.strip()
    word = session.exec(select(Word).where(func.lower(Word.term) == term.lower())).first()
    if not word:
        word = Word(term=term, deck=body.deck, topic=body.topic)
        session.add(word)
        session.commit()
        session.refresh(word)
    enrich(word, session, body.context)
    card = session.exec(select(Card).where(Card.word_id == word.id)).first()
    if not card:
        card = Card(word_id=word.id)
        session.add(card)
        session.commit()
        session.refresh(card)
    return {"word": word, "card": card}


@router.delete("/notebook/{word_id}")
def remove_from_notebook(word_id: int, session: Session = Depends(get_session)):
    card = session.exec(select(Card).where(Card.word_id == word_id)).first()
    if card:
        for log in session.exec(select(ReviewLog).where(ReviewLog.card_id == card.id)).all():
            session.delete(log)
        session.delete(card)
        session.commit()
    return {"ok": True}


@router.get("/notebook")
def notebook(session: Session = Depends(get_session)):
    rows = session.exec(select(Card, Word).join(Word, Card.word_id == Word.id).order_by(Card.due)).all()
    return [
        {**w.model_dump(), "card": c.model_dump(), "mastered": srs.is_mastered(c.step, c.level4_passes, w.priority)}
        for c, w in rows
    ]


@router.get("/review/due")
def due_cards(limit: int = 20, session: Session = Depends(get_session)):
    rows = session.exec(
        select(Card, Word).join(Word, Card.word_id == Word.id).where(Card.due <= now()).order_by(Card.lapses.desc(), Card.due).limit(limit)
    ).all()
    pool = [w.model_dump() for w in session.exec(select(Word).where(Word.meaning_vi.is_not(None))).all()]
    out = []
    for card, word in rows:
        distractors = [p for p in pool if p["id"] != word.id]
        random.shuffle(distractors)
        q = srs.build_question(word.model_dump(), card.level, distractors)
        out.append({"card_id": card.id, "word": word.model_dump(), "level": card.level, "question": q})
    return out


class ReviewAnswer(BaseModel):
    question_type: str
    answer: str
    user_answer: str


@router.post("/review/{card_id}")
def review(card_id: int, body: ReviewAnswer, session: Session = Depends(get_session)):
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(404, "Không có thẻ này")
    word = session.get(Word, card.word_id)
    correct = srs.check_answer(body.question_type, body.answer, body.user_answer)
    session.add(ReviewLog(card_id=card.id, correct=correct, level_before=card.level))
    res = srs.schedule(card.level, card.step, card.level4_passes, correct, now())
    card.level, card.step, card.due, card.level4_passes = res.level, res.step, res.due, res.level4_passes
    card.reps += 1
    card.lapses += 0 if correct else 1
    session.add(card)
    session.commit()
    return {
        "correct": correct,
        "expected": body.answer,
        "next_due": card.due,
        "level": card.level,
        "mastered": srs.is_mastered(card.step, card.level4_passes, word.priority),
    }


@router.get("/stats")
def stats(session: Session = Depends(get_session)):
    cards = session.exec(select(Card, Word).join(Word, Card.word_id == Word.id)).all()
    logs = session.exec(select(ReviewLog)).all()
    return {
        "notebook": len(cards),
        "due_today": sum(1 for c, _ in cards if c.due <= now()),
        "mastered": sum(1 for c, w in cards if srs.is_mastered(c.step, c.level4_passes, w.priority)),
        "reviews": len(logs),
        "retention": round(sum(l.correct for l in logs) / len(logs) * 100, 1) if logs else None,
    }


@router.post("/notebook/enrich-pending")
def enrich_pending(limit: int = 30, session: Session = Depends(get_session)):
    """Tra lại các từ trong sổ đang có nghĩa mock (chạy sau khi điền ANTHROPIC_API_KEY)."""
    rows = session.exec(
        select(Word).join(Card, Card.word_id == Word.id).where(Word.enriched == False).limit(limit)  # noqa: E712
    ).all()
    for w in rows:
        enrich(w, session)
    return {"processed": len(rows)}
