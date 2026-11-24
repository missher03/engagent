"""Tra từ, kho từ, sổ từ và ôn tập SRS."""
from __future__ import annotations

import random
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..db import get_session
from ..models import Card, ReviewLog, Word, WordLookup, now
from ..services import dictionary, llm, prompts, srs, vocab_data
from ..services.wordcache import all_words

def _get_profile(session):
    from .learn import get_profile

    return get_profile(session)


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


MY_CAT = {"key": "mine", "name": "Từ bạn đã tra"}
MY_SUBS = {"my-lookups": "Tất cả từ đã tra", "my-other": "Từ ngoài các chủ đề IT"}
_TERM_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .'+#/&-]{0,60}$")


def _topics_for_llm() -> str:
    return "\n".join(f"{st['key']}: {st['name']} ({c['name']})" for c in _taxonomy() for st in c["subtopics"])


def _subtopic_info(key: Optional[str]) -> Optional[dict]:
    for c in _taxonomy():
        for st in c["subtopics"]:
            if st["key"] == key:
                return {"key": key, "name": st["name"], "category": c["key"], "category_name": c["name"]}
    return None


def remember_lookup(session: Session, term: str, info: Optional[dict], word: Optional[Word]) -> Word:
    """Ghi nhớ từ người dùng vừa tra: tạo mới nếu chưa có, lưu nội dung, xếp vào chủ đề, tăng số lần tra."""
    if word is None:
        word = Word(term=term, deck="lookup", source="lookup")
    if info and not vocab_data.is_mock(info.get("meaning_vi")):
        for f in (*vocab_data.CONTENT_FIELDS, "audio_url"):
            if info.get(f) and not getattr(word, f):
                setattr(word, f, info[f])
        word.enriched = bool(word.meaning_vi)
    st = _subtopic_info((info or {}).get("subtopic"))
    if word.source == "lookup" and not word.subtopic:
        if st:
            word.category, word.subtopic = st["category"], st["key"]
            word.subtopics = sorted(set((word.subtopics or []) + [st["key"]]))
        elif info and (info.get("subtopic") or "").lower() == "other":
            word.category = "other"
    word.lookup_count = (word.lookup_count or 0) + 1
    word.looked_up_at = now()
    session.add(word)
    session.commit()
    session.refresh(word)
    mine = session.exec(select(WordLookup).where(WordLookup.word_id == word.id)).first() or WordLookup(word_id=word.id)
    mine.count = (mine.count or 0) + 1
    mine.last_at = now()
    session.add(mine)
    session.commit()
    session.refresh(word)
    return word


def my_lookups(session: Session) -> dict[int, WordLookup]:
    """Từ người đang đăng nhập đã tra: word_id -> WordLookup."""
    return {x.word_id: x for x in session.exec(select(WordLookup)).all()}


def ensure_card(session: Session, word: Word) -> bool:
    """Đưa từ vào danh sách ôn tập (tạo thẻ) nếu chưa có. Trả True nếu vừa tạo."""
    if session.exec(select(Card).where(Card.word_id == word.id)).first():
        return False
    session.add(Card(word_id=word.id))
    session.commit()
    return True


def backfill_lookup_cards(session: Session) -> int:
    """Chạy lúc khởi động (không có người đăng nhập, nên thấy mọi dòng).
    1) Từ đã tra theo cách cũ (cột trên Word) mà chưa có bản ghi WordLookup: tạo bản ghi chưa có chủ.
    2) Mỗi từ ai đó đã tra mà người đó chưa có thẻ ôn: tạo thẻ cho đúng người đó."""
    looks = session.exec(select(WordLookup)).all()
    if not looks:
        for w in session.exec(select(Word).where(Word.looked_up_at.is_not(None))).all():
            session.add(WordLookup(word_id=w.id, count=w.lookup_count or 1, last_at=w.looked_up_at))
        session.commit()
        looks = session.exec(select(WordLookup)).all()
    has = {(c.user_id, c.word_id) for c in session.exec(select(Card)).all()}
    n = 0
    for lk in looks:
        if (lk.user_id, lk.word_id) not in has:
            has.add((lk.user_id, lk.word_id))
            session.add(Card(word_id=lk.word_id, user_id=lk.user_id))
            n += 1
    session.commit()
    return n


@router.get("/dictionary/lookup")
def lookup(q: str, context: str = "", lang: str = "auto", session: Session = Depends(get_session)):
    """lang: auto (tự nhận diện) | en (Anh→Việt) | vi (Việt→Anh). Từ tiếng Anh tra xong được lưu vào kho."""
    term = q.strip()
    if not term:
        raise HTTPException(400, "Thiếu từ cần tra")
    if (lang if lang in ("en", "vi") else dictionary.detect_lang(term)) == "vi":
        return lookup_vi(term, context, session)
    word = session.exec(select(Word).where(func.lower(Word.term) == term.lower())).first()
    info = None
    if word and word.enriched:
        result = word.model_dump()
        result["related"] = dictionary.fetch_related(term)
    else:
        try:
            needs_topic = word is None or (word.source == "lookup" and not word.subtopic)
            info = dictionary.lookup(term, context, topics=_topics_for_llm() if needs_topic else "")
        except llm.LLMError as e:
            raise HTTPException(502, str(e)) from e
        result = info
    if word is not None or _TERM_OK.match(term):
        word = remember_lookup(session, word.term if word else term, info, word)
        if not info:
            result = {**word.model_dump(), "related": result.get("related", [])}
        result["id"] = word.id
        sub = _subtopic_info(word.subtopic)
        result["saved_to"] = sub or (
            {"key": "my-other", "name": MY_SUBS["my-other"], "category_name": MY_CAT["name"]} if word.category == "other"
            else {"key": "my-lookups", "name": MY_SUBS["my-lookups"], "category_name": MY_CAT["name"]})
        result["lookup_count"] = my_lookups(session)[word.id].count
        result["added_to_review"] = ensure_card(session, word)
    card = session.exec(select(Card).where(Card.word_id == result.get("id"))).first() if result.get("id") else None
    result["in_notebook"] = bool(card)
    return result


@router.get("/dictionary/history")
def lookup_history(limit: int = 20, session: Session = Depends(get_session)):
    """Các từ đã tra gần đây (mới nhất trước)."""
    mine = sorted(my_lookups(session).values(), key=lambda x: x.last_at, reverse=True)[:limit]
    words = {w.id: w for w in session.exec(select(Word).where(Word.id.in_([x.word_id for x in mine]))).all()}
    return [{"id": w.id, "term": w.term, "meaning_vi": w.meaning_vi, "subtopic": w.subtopic, "lookup_count": x.count}
            for x in mine if (w := words.get(x.word_id))]


def lookup_vi(query: str, context: str, session: Session) -> dict:
    """Việt → Anh: gợi ý từ tiếng Anh từ LLM + các từ trong kho có nghĩa chứa cụm tiếng Việt."""
    try:
        data = dictionary.vi_to_en(query, context)
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    saved = None
    first = next((c for c in data.get("candidates", []) if _TERM_OK.match(str(c.get("term", "")).strip())), None)
    if first:
        term = first["term"].strip()
        existing = session.exec(select(Word).where(func.lower(Word.term) == term.lower())).first()
        info = None if existing and existing.enriched else {
            "meaning_vi": query, "part_of_speech": first.get("part_of_speech"), "ipa": first.get("ipa"), "stress": first.get("stress"),
            "usage_vi": first.get("nuance_vi"), "example": first.get("example"), "example_vi": first.get("example_vi")}
        w = remember_lookup(session, existing.term if existing else term, info, existing)
        ensure_card(session, w)
        saved = {"id": w.id, "term": w.term}
    words = {w.term.lower(): w for w in all_words(session)}
    in_nb = {c.word_id for c in session.exec(select(Card)).all()}
    q = query.lower()
    in_kho = [w for w in words.values() if w.meaning_vi and q in w.meaning_vi.lower()][:10]
    cands = []
    for c in data.get("candidates", []):
        w = words.get(str(c.get("term", "")).lower())
        cands.append({**c, "id": w.id if w else None, "in_notebook": bool(w and w.id in in_nb)})
    return {
        "mode": "vi", "query": query, "candidates": cands, "note_vi": data.get("note_vi"), "saved": saved,
        "from_vocab": [{"id": w.id, "term": w.term, "meaning_vi": w.meaning_vi, "subtopic": w.subtopic,
                        "in_notebook": w.id in in_nb} for w in in_kho if w.term.lower() not in {c["term"].lower() for c in cands}],
    }


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
    if subtopic:
        words = words_in_subtopic(session, subtopic)
    else:
        words = session.exec(stmt.order_by(Word.priority, Word.term)).all()
    in_nb = {c.word_id for c in session.exec(select(Card)).all()}
    return [{**w.model_dump(), "in_notebook": w.id in in_nb} for w in words]


def _taxonomy():
    return vocab_data.parse_taxonomy()


def words_in_subtopic(session: Session, key: str) -> list[Word]:
    """Từ thuộc một chủ đề nhỏ: từ có sẵn theo thứ tự file, rồi đến từ bạn tự tra. Hỗ trợ cả chủ đề ảo my-*."""
    allw = all_words(session)
    if key in MY_SUBS:
        mine = my_lookups(session)
        ws = [w for w in allw if w.id in mine and (key == "my-lookups" or (w.source == "lookup" and w.category == "other"))]
        return sorted(ws, key=lambda w: mine[w.id].last_at, reverse=True)
    order = {t.lower(): i for i, t in enumerate(_subtopic_terms(key))}
    return sorted((w for w in allw if key in (w.subtopics or [])), key=lambda w: (order.get(w.term.lower(), 9999), w.term.lower()))


def _subtopic_terms(key: str) -> list[str]:
    for c in _taxonomy():
        for st in c["subtopics"]:
            if st["key"] == key:
                return st["terms"]
    return []


@router.get("/categories")
def categories(session: Session = Depends(get_session)):
    """Cây lĩnh vực > chủ đề nhỏ, kèm số từ, số từ đã có nội dung, số từ trong sổ. Gồm cả từ bạn tự tra."""
    allw = all_words(session)
    in_nb = {c.word_id for c in session.exec(select(Card)).all()}
    mine = my_lookups(session)
    by_sub: dict[str, list[Word]] = {}
    for w in allw:
        for k in w.subtopics or []:
            by_sub.setdefault(k, []).append(w)

    def summary(key: str, name: str, ws: list[Word]) -> dict:
        return {
            "key": key, "name": name, "count": len(ws),
            "ready": sum(1 for w in ws if w.enriched),
            "in_notebook": sum(1 for w in ws if w.id in in_nb),
            "mine": sum(1 for w in ws if w.id in mine),
            "preview": [w.term for w in ws[:6]],
        }

    out = []
    for c in _taxonomy():
        subs = []
        for st in c["subtopics"]:
            order = {t.lower(): i for i, t in enumerate(st["terms"])}
            ws = sorted(by_sub.get(st["key"], []), key=lambda w: (order.get(w.term.lower(), 9999), w.term.lower()))
            subs.append(summary(st["key"], st["name"], ws))
        out.append({"key": c["key"], "name": c["name"], "subtopics": subs, "count": sum(x["count"] for x in subs)})
    looked = [w for w in allw if w.id in mine]
    if looked:
        looked.sort(key=lambda w: mine[w.id].last_at, reverse=True)
        subs = [summary("my-lookups", MY_SUBS["my-lookups"], looked)]
        other = [w for w in looked if w.source == "lookup" and w.category == "other"]
        if other:
            subs.append(summary("my-other", MY_SUBS["my-other"], other))
        out.insert(0, {**MY_CAT, "subtopics": subs, "count": len(looked)})
    in_tree = {w.id for w in allw if w.subtopics}
    tw = [w for w in allw if w.id in in_tree]
    return {"total": len(tw), "ready": sum(1 for w in tw if w.enriched), "mine": len(looked), "categories": out}


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
    words = [w for w in words_in_subtopic(session, key) if not w.enriched]
    name = next((st["name"] for c in _taxonomy() for st in c["subtopics"] if st["key"] == key), "general IT and data science")
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
    for w in words_in_subtopic(session, key):
        if w.id not in have:
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
    profile = _get_profile(session)
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
    # Chỉ lấy ngẫu nhiên 60 từ làm phương án nhiễu, không nạp cả kho 2000 từ.
    pool = [w.model_dump() for w in session.exec(
        select(Word).where(Word.meaning_vi.is_not(None)).order_by(func.random()).limit(60)).all()]
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
