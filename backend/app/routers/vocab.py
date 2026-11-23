"""Tra từ, kho từ, sổ từ và ôn tập SRS."""
from __future__ import annotations

import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..db import get_session
from ..models import Card, ReviewLog, Word, now
from ..services import dictionary, llm, prompts, srs, vocab_data

router = APIRouter(prefix="/api", tags=["vocab"])


def enrich(word: Word, session: Session, context: str = "") -> Word:
    """Tra từ điển + LLM một lần rồi lưu lại (cache). Kết quả mock không được lưu."""
    if word.enriched:
        return word
    info = dictionary.lookup(word.term, context)
    if vocab_data.is_mock(info.get("meaning_vi")):
        return word
    for f in (*vocab_data.CONTENT_FIELDS, "audio_url"):
        if info.get(f) and not getattr(word, f):
            setattr(word, f, info[f])
    word.enriched = bool(word.meaning_vi)
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
    category: Optional[str] = None, subtopic: Optional[str] = None,
    session: Session = Depends(get_session),
):
    stmt = select(Word)
    if deck:
        stmt = stmt.where(Word.deck == deck)
    if category:
        stmt = stmt.where(Word.category == category)
    if topic:
        stmt = stmt.where(Word.topic == topic)
    if q:
        stmt = stmt.where(Word.term.contains(q))
    words = session.exec(stmt.order_by(Word.priority, Word.term)).all()
    if subtopic:
        order = {t.lower(): i for i, t in enumerate(_subtopic_terms(subtopic))}
        words = sorted((w for w in words if subtopic in (w.subtopics or [])), key=lambda w: order.get(w.term.lower(), 9999))
    in_nb = {c.word_id for c in session.exec(select(Card)).all()}
    return [{**w.model_dump(), "in_notebook": w.id in in_nb} for w in words]


def _taxonomy():
    return vocab_data.parse_taxonomy()


def _subtopic_terms(key: str) -> list[str]:
    for c in _taxonomy():
        for st in c["subtopics"]:
            if st["key"] == key:
                return st["terms"]
    return []


@router.get("/categories")
def categories(session: Session = Depends(get_session)):
    """Cây lĩnh vực > chủ đề nhỏ, kèm số từ, số từ đã có nội dung, số từ trong sổ."""
    words = {w.term.lower(): w for w in session.exec(select(Word)).all()}
    in_nb = {c.word_id for c in session.exec(select(Card)).all()}
    out = []
    for c in _taxonomy():
        subs = []
        for st in c["subtopics"]:
            ws = [words.get(t.lower()) for t in st["terms"]]
            ws = [w for w in ws if w]
            subs.append({
                "key": st["key"], "name": st["name"], "count": len(ws),
                "ready": sum(1 for w in ws if w.enriched),
                "in_notebook": sum(1 for w in ws if w.id in in_nb),
                "preview": [w.term for w in ws[:6]],
            })
        out.append({"key": c["key"], "name": c["name"], "subtopics": subs, "count": sum(x["count"] for x in subs)})
    tax_terms = {t.lower() for c in _taxonomy() for st in c["subtopics"] for t in st["terms"]}
    tw = [w for k, w in words.items() if k in tax_terms]
    return {"total": len(tw), "ready": sum(1 for w in tw if w.enriched), "categories": out}


@router.get("/words/{word_id}")
def word_detail(word_id: int, session: Session = Depends(get_session)):
    """Chi tiết một từ; nếu chưa có nội dung thì tra ngay (LLM) và lưu lại."""
    w = session.get(Word, word_id)
    if not w:
        raise HTTPException(404, "Không có từ này")
    try:
        enrich(w, session)
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    card = session.exec(select(Card).where(Card.word_id == w.id)).first()
    return {**w.model_dump(), "in_notebook": bool(card), "card": card.model_dump() if card else None}


@router.post("/subtopics/{key}/enrich")
def enrich_subtopic(key: str, batch: int = 15, session: Session = Depends(get_session)):
    """Sinh nội dung cho các từ chưa có trong một chủ đề nhỏ (gọi LLM theo lô)."""
    terms = _subtopic_terms(key)
    words = [w for w in session.exec(select(Word)).all() if key in (w.subtopics or []) and not w.enriched]
    name = next((st["name"] for c in _taxonomy() for st in c["subtopics"] if st["key"] == key), key)
    by_term = {w.term.lower(): w for w in words}
    done = 0
    try:
        for i in range(0, len(words), batch):
            chunk = [w.term for w in words[i : i + batch]]
            for e in dictionary.llm_entries(chunk, subtopic=name, category=key.split("-")[0]):
                w = by_term.get(str(e.get("term", "")).lower())
                if not w or vocab_data.is_mock(e.get("meaning_vi")):
                    continue
                for f in vocab_data.CONTENT_FIELDS:
                    if e.get(f) and not getattr(w, f):
                        setattr(w, f, e[f])
                w.enriched = bool(w.meaning_vi)
                session.add(w)
                done += 1
            session.commit()
    except llm.LLMError as e:
        raise HTTPException(502, f"{e} (đã xong {done} từ)") from e
    return {"subtopic": key, "terms": len(terms), "enriched_now": done}


@router.post("/subtopics/{key}/notebook")
def add_subtopic_to_notebook(key: str, session: Session = Depends(get_session)):
    """Thêm cả chủ đề nhỏ vào sổ từ (tạo thẻ ôn cho mọi từ chưa có)."""
    have = {c.word_id for c in session.exec(select(Card)).all()}
    added = 0
    for w in session.exec(select(Word)).all():
        if key in (w.subtopics or []) and w.id not in have:
            session.add(Card(word_id=w.id))
            added += 1
    session.commit()
    return {"added": added}


class SentenceIn(BaseModel):
    sentence: str
    mode: str = "writing"  # writing | speaking (câu nói đã chuyển thành chữ)


@router.post("/words/{word_id}/sentence")
def check_sentence(word_id: int, body: SentenceIn, session: Session = Depends(get_session)):
    """Chấm câu người học tự đặt với từ (viết hoặc nói)."""
    from ..models import Attempt, Profile

    w = session.get(Word, word_id)
    if not w:
        raise HTTPException(404, "Không có từ này")
    if len(body.sentence.split()) < 3:
        raise HTTPException(400, "Câu quá ngắn")
    profile = session.get(Profile, 1)
    used = w.term.lower().split()[0][:5] in body.sentence.lower()
    try:
        result = llm.complete_json(
            prompts.SENTENCE_CHECK.format(
                level=profile.level if profile else "B1", term=w.term, meaning_vi=w.meaning_vi or "",
                sentence=body.sentence,
                mode_note=" (spoken, transcribed by speech recognition: ignore punctuation/capitalization)" if body.mode == "speaking" else "",
            ),
            mock=lambda: {
                "correct_usage": used, "score": 3 if used else 1,
                "feedback_vi": ("Câu có dùng từ. " if used else "Câu chưa dùng từ cần luyện. ") + "[mock] cần key LLM để chấm chi tiết.",
                "corrected": body.sentence, "better": body.sentence, "errors": [],
            },
            max_tokens=1500,
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    session.add(Attempt(skill=f"sentence-{body.mode}", task=w.term, input_text=body.sentence,
                        result=result, score=result.get("score")))
    session.commit()
    return result


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
