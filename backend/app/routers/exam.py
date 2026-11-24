"""Thi nói theo tài liệu thật (kiểu IELTS 3 phần) và hỏi đáp về tài liệu người dùng tải lên."""
from __future__ import annotations

import base64
import io
import json
import re
import uuid
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Attempt, ExamItem, Profile
from ..services import llm, prompts

router = APIRouter(prefix="/api", tags=["exam"])

DATA = Path(__file__).resolve().parent.parent / "data"
BUILTIN = json.loads((DATA / "speaking_exams.json").read_text(encoding="utf-8"))
TYPES = {
    "architecture": ("Sơ đồ kiến trúc", "a system architecture diagram"),
    "system_design": ("System design", "a system design brief with requirements and a design diagram"),
    "ai_flow": ("AI / ML flow", "an AI or machine learning pipeline diagram"),
    "ui_design": ("Thiết kế giao diện / sản phẩm", "an app screen wireframe or a user flow"),
    "data_table": ("Bảng số liệu / biểu đồ", "a business or product data table or chart"),
    "eval_table": ("Bảng evaluation", "a model evaluation table with metrics"),
    "tech_article": ("Bài viết kỹ thuật", "a short technical article, memo or incident report"),
    "research_paper": ("Bài báo khoa học", "a research paper abstract with a results table"),
}


def _level(session: Session) -> str:
    p = session.get(Profile, 1)
    return p.level if p else "B1"


def _all_exams(session: Session) -> list[dict]:
    gen = [{**e.data, "id": e.id, "type": e.type, "generated": True} for e in session.exec(select(ExamItem).order_by(ExamItem.created_at.desc())).all() if not e.type.startswith("write")]
    return BUILTIN + gen


def _get_exam(session: Session, exam_id: str) -> dict:
    for e in BUILTIN:
        if e["id"] == exam_id:
            return e
    item = session.get(ExamItem, exam_id)
    if not item:
        raise HTTPException(404, "Không có đề này")
    return {**item.data, "id": item.id, "type": item.type, "generated": True}


def material_text(materials: list[dict]) -> str:
    """Chuyển tài liệu thành chữ để đưa cho LLM."""
    out = []
    for b in materials:
        k = b.get("kind")
        if k == "mermaid":
            out.append(f"[Diagram: {b.get('caption', '')}]\n{b.get('code', '')}")
        elif k == "table":
            rows = [" | ".join(b.get("columns", []))] + [" | ".join(map(str, r)) for r in b.get("rows", [])]
            out.append(f"[Table: {b.get('caption', '')}]\n" + "\n".join(rows))
        elif k == "text":
            out.append(f"[Text: {b.get('title', '')}]\n{b.get('body', '')}")
        elif k == "chart":
            ser = "; ".join(f"{s['name']}: " + ", ".join(f"{x}={v}" for x, v in zip(b.get("x", []), s.get("values", []))) for s in b.get("series", []))
            out.append(f"[Chart ({b.get('unit', '')}): {b.get('caption', '')}]\n{ser}")
        elif k == "screen":
            reg = "\n".join(f"- {r['label']}: " + "; ".join(r.get("items", [])) for r in b.get("regions", []))
            out.append(f"[App screen: {b.get('title', '')}]\n{reg}")
    return "\n\n".join(out)


@router.get("/exam/list")
def exam_list(session: Session = Depends(get_session)):
    last: dict[str, float] = {}
    for a in session.exec(select(Attempt).where(Attempt.skill == "exam").order_by(Attempt.created_at)).all():
        if a.score is not None:
            last[a.task] = a.score
    types = [{"key": k, "name": v[0]} for k, v in TYPES.items()]
    items = [{"id": e["id"], "type": e["type"], "title": e["title"], "level": e.get("level", "B1"),
              "generated": e.get("generated", False), "last_band": last.get(e["id"])} for e in _all_exams(session)]
    return {"types": types, "items": items}


@router.get("/exam/{exam_id}")
def exam_detail(exam_id: str, session: Session = Depends(get_session)):
    return _get_exam(session, exam_id)


class GenerateIn(BaseModel):
    type: str
    topic: str = ""


@router.post("/exam/generate")
def exam_generate(body: GenerateIn, session: Session = Depends(get_session)):
    if body.type not in TYPES:
        raise HTTPException(400, "Loại đề không hợp lệ")
    if not llm.get_settings().llm_enabled:
        raise HTTPException(400, "Cần key LLM để sinh đề mới. Hãy dùng các đề làm sẵn.")
    try:
        data = llm.complete_json(
            prompts.EXAM_GENERATE.format(level=_level(session), type=body.type, type_desc=TYPES[body.type][1],
                                         topic=body.topic.strip() or "any realistic topic you choose"),
            mock=lambda: {}, max_tokens=5000, effort="medium",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    if not isinstance(data, dict) or not data.get("materials") or not data.get("cue"):
        raise HTTPException(502, "Đề sinh ra thiếu nội dung, hãy thử lại.")
    data["level"] = _level(session)
    item = ExamItem(id=f"gen-{uuid.uuid4().hex[:8]}", type=body.type, data=data)
    session.add(item)
    session.commit()
    return {**data, "id": item.id, "type": item.type, "generated": True}


class FollowIn(BaseModel):
    exam_id: str
    question: str
    answer: str
    asked: list[str] = []


@router.post("/exam/followup")
def exam_followup(body: FollowIn, session: Session = Depends(get_session)):
    """Phần 3: giám khảo có thể hỏi thêm 1 câu nối tiếp dựa trên câu trả lời vừa rồi."""
    exam = _get_exam(session, body.exam_id)
    if len(body.answer.split()) < 4:
        return {"followup": None}
    try:
        r = llm.complete_json(
            prompts.EXAM_EXAMINER.format(level=_level(session), material=material_text(exam["materials"]),
                                         question=body.question, answer=body.answer, asked=json.dumps(body.asked)),
            mock=lambda: {"followup": "Could you give me an example from your own experience?"}, max_tokens=800,
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    f = r.get("followup") if isinstance(r, dict) else None
    return {"followup": f if isinstance(f, str) and f.strip() else None}


class Answer(BaseModel):
    part: int
    question: str
    answer: str
    pron: Optional[dict] = None


class GradeIn(BaseModel):
    exam_id: str
    answers: list[Answer]


def _round_half(x: float) -> float:
    return round(x * 2) / 2


@router.post("/exam/grade")
def exam_grade(body: GradeIn, session: Session = Depends(get_session)):
    exam = _get_exam(session, body.exam_id)
    answered = [a for a in body.answers if a.answer.strip()]
    if not answered:
        raise HTTPException(400, "Chưa có câu trả lời nào")
    prons = [a.pron for a in answered if a.pron]
    pron = {}
    if prons:
        for k in ("accuracy", "fluency", "prosody"):
            vals = [p[k] for p in prons if isinstance(p.get(k), (int, float))]
            if vals:
                pron[k] = round(sum(vals) / len(vals), 1)
    answers_txt = "\n".join(f"[Part {a.part}] Q: {a.question}\nA: {a.answer}" for a in answered)

    def mock():
        return {"bands": {"fluency": 5.5, "lexical": 5.5, "grammar": 5.0, "pronunciation": None, "document": 6.0}, "overall": 5.5,
                "summary_vi": "[mock] Nhận xét thật sẽ hiện khi có key LLM.",
                "per_question": [{"question": a.question, "comment_vi": "[mock]", "said": a.answer[:80], "better": a.answer[:80]} for a in answered],
                "model_answer_part2": "[mock] Model answer.", "useful_phrases": [{"en": e, "vi": ""} for e in exam.get("vocab", [])], "next_vi": ""}

    try:
        r = llm.complete_json(
            prompts.EXAM_GRADE.format(material=material_text(exam["materials"]), answers=answers_txt, pron=json.dumps(pron)),
            mock=mock, smart=True, max_tokens=6000, effort="medium",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    bands = r.get("bands") or {}
    core = [bands.get(k) for k in ("fluency", "lexical", "grammar", "pronunciation") if isinstance(bands.get(k), (int, float))]
    if core:
        r["overall"] = _round_half(sum(core) / len(core))
    session.add(Attempt(skill="exam", task=exam["id"], input_text=answers_txt, result=r, score=r.get("overall")))
    session.commit()
    return r


# ---------- Hỏi đáp về tài liệu người dùng tải lên ----------
MAX_TEXT = 15000
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _docx_text(raw: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    return re.sub(r"<[^>]+>", "", xml)


@router.post("/docqa/read")
async def docqa_read(
    file: Optional[UploadFile] = File(None),
    text: str = Form(""),
    session: Session = Depends(get_session),
):
    """Đọc tài liệu: ảnh (AI nhìn ảnh), .docx/.txt/.md/.csv, hoặc chữ dán vào (PDF được trình duyệt trích chữ sẵn)."""
    name, content = "", None
    if file is not None and file.filename:
        name = file.filename
        raw = await file.read()
        if len(raw) > 8 * 1024 * 1024:
            raise HTTPException(400, "File quá lớn (tối đa 8 MB)")
        ctype = (file.content_type or "").lower()
        if ctype in IMAGE_TYPES:
            content = [
                {"type": "image", "source": {"type": "base64", "media_type": ctype, "data": base64.b64encode(raw).decode()}},
                {"type": "text", "text": prompts.DOC_READ.format(name=f' ("{name}")', text_hint=" (it is an image: read all text, labels, arrows and numbers in it)")},
            ]
        elif name.lower().endswith(".docx"):
            text = _docx_text(raw)
        else:
            text = raw.decode("utf-8", "ignore")
    if content is None:
        text = text.strip()
        if len(text) < 40:
            raise HTTPException(400, "Tài liệu quá ngắn hoặc trống. Hãy tải file khác hoặc dán nội dung vào.")
        content = prompts.DOC_READ.format(name=f' ("{name}")' if name else "", text_hint="") + "\n\nDOCUMENT:\n" + text[:MAX_TEXT]

    def mock():
        return {"title": name or "Tài liệu của bạn", "doc_type": "document", "notes_en": (text or "")[:1500] or "(image)",
                "summary_vi": "[mock] Tóm tắt sẽ hiện khi có key LLM.", "key_points_vi": [], "suggested_role": "your team lead", "mock": True}

    try:
        r = llm.chat_json([{"role": "user", "content": content}], mock=mock, max_tokens=3000, effort="low")
    except llm.LLMError as e:
        msg = str(e)
        if isinstance(content, list):
            msg += ". Có thể mô hình hiện tại không đọc được ảnh; hãy thử dán chữ hoặc dùng file văn bản."
        raise HTTPException(502, msg) from e
    if not isinstance(r, dict) or not r.get("notes_en"):
        raise HTTPException(502, "Không đọc được tài liệu, hãy thử lại.")
    return r


class DocTurn(BaseModel):
    role: str
    content: str


class DocTalkIn(BaseModel):
    title: str = ""
    notes: str
    asker: str = "your team lead"
    messages: list[DocTurn] = []


def _doc_scenario(body: DocTalkIn) -> str:
    return (f"A real work Q&A. The learner shared a document titled '{body.title}'. You play {body.asker} and ask realistic questions "
            f"about it, one at a time: start with what it is and its purpose, then details and numbers, then decisions, risks and next steps. "
            f"Check the learner's answers against these notes and politely point out factual mistakes.\nDOCUMENT NOTES:\n{body.notes[:6000]}")


@router.post("/docqa/talk")
def docqa_talk(body: DocTalkIn, session: Session = Depends(get_session)):
    from .coach import _talk_mock

    msgs = [m for m in body.messages if m.content.strip()][-20:]
    if msgs and msgs[-1].role != "user":
        raise HTTPException(400, "Tin nhắn cuối phải là của người học")
    if not llm.get_settings().llm_enabled:
        r = _talk_mock(msgs)
        if not msgs:
            r.update(reply_en=f"Thanks for sharing '{body.title}'. Can you give me a quick overview of it?",
                     reply_vi=f"Cảm ơn bạn đã chia sẻ '{body.title}'. Bạn tóm tắt nhanh giúp mình được không?")
        return r
    convo = [{"role": "user", "content": "(start)"}] + [
        {"role": "assistant" if m.role == "coach" else "user", "content": m.content} for m in msgs]
    system = prompts.TALK_SYSTEM.format(level=_level(session), scenario=_doc_scenario(body))
    try:
        data = llm.chat_json(convo, mock=lambda: {}, system=system, max_tokens=2000)
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    if not isinstance(data, dict) or not data.get("reply_en"):
        raise HTTPException(502, "Trợ lý trả lời không đúng định dạng, hãy thử lại.")
    return data


@router.post("/docqa/summary")
def docqa_summary(body: DocTalkIn, session: Session = Depends(get_session)):
    if not any(m.role == "user" and m.content.strip() for m in body.messages):
        raise HTTPException(400, "Chưa có lượt nói nào để nhận xét")
    transcript = "\n".join(f"{'Learner' if m.role == 'user' else 'Coach'}: {m.content}" for m in body.messages)
    level = _level(session)
    try:
        r = llm.complete_json(
            prompts.TALK_SUMMARY.format(level=level, scenario=f"Work Q&A about the document '{body.title}'. Notes: {body.notes[:3000]}", transcript=transcript),
            mock=lambda: {"summary_vi": "[mock] Nhận xét sẽ hiện khi có key LLM.", "strengths": [], "fixes": [], "phrases": [],
                          "english_ratio_vi": "", "level": level, "next_vi": ""},
            max_tokens=3000,
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    session.add(Attempt(skill="docqa", task=body.title[:200], input_text=transcript, result=r))
    session.commit()
    return r
