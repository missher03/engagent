"""Luyện viết kiểu IELTS: Quick (báo cáo ngắn, giống Task 1) và Deep (tài liệu thiết kế, giống Task 2)."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Attempt, ExamItem
from ..services import llm, prompts
from .exam import _level, _round_half, material_text

router = APIRouter(prefix="/api/write", tags=["write"])

DATA = Path(__file__).resolve().parent.parent / "data"
BUILTIN = json.loads((DATA / "writing_exams.json").read_text(encoding="utf-8"))

MODES = {
    "quick": {"name": "Quick · báo cáo ngắn", "words": [150, 250]},
    "deep": {"name": "Deep · tài liệu thiết kế", "words": [400, 800]},
}
TOPICS = {
    "quick": {
        "model_design": ("Thiết kế mô hình", "a model design (architecture, features, choices)"),
        "system_design": ("Thiết kế hệ thống", "a system or software architecture"),
        "training": ("Quá trình huấn luyện", "a model training run (loss curves, overfitting, tuning)"),
        "evaluation": ("Kết quả đánh giá", "model evaluation results and comparison"),
        "logs_errors": ("Log, lỗi, sự cố", "application logs, errors or a production incident"),
        "data_quality": ("Dữ liệu, chất lượng, drift", "a dataset: EDA, data quality issues or data drift"),
        "ab_test": ("A/B test, số liệu sản phẩm", "an A/B test or product metrics"),
        "performance": ("Hiệu năng, chi phí", "system performance: latency, throughput, cost, scaling"),
        "security": ("Bảo mật, quyền riêng tư", "a security or privacy finding"),
        "llm_rag": ("LLM và RAG", "an LLM or RAG system evaluation (hallucination, retrieval, prompts)"),
        "mlops": ("MLOps", "ML deployment, CI/CD or model monitoring"),
        "paper_summary": ("Tóm tắt bài báo, bài viết", "a research paper or technical article"),
    },
    "deep": {
        "web_app": ("Ứng dụng web / mobile", "a web or mobile application"),
        "saas_feature": ("Sản phẩm SaaS, tính năng mới", "a SaaS product or a new product feature"),
        "ai_agent": ("AI agent", "an AI agent that uses tools"),
        "rag_chatbot": ("RAG, chatbot", "a RAG system or chatbot"),
        "algorithm": ("Thuật toán", "an algorithm (recommendation, search, scheduling, matching...)"),
        "ml_model": ("Mô hình ML/DL", "an ML or deep learning model for a problem"),
        "data_pipeline": ("Data pipeline, data platform", "a data pipeline or data platform"),
        "distributed": ("Hệ thống phân tán, real-time", "a distributed or real-time system"),
        "research_proposal": ("Đề xuất nghiên cứu", "a research proposal"),
        "experiment_design": ("Thiết kế thí nghiệm, đánh giá", "an experiment or model evaluation plan"),
        "ai_finance": ("AI trong tài chính, đầu tư", "an AI system for finance or investing"),
        "responsible_ai": ("AI có trách nhiệm", "responsible AI: fairness, safety, privacy"),
    },
}


def _all(session: Session) -> list[dict]:
    gen = [{**e.data, "id": e.id, "generated": True}
           for e in session.exec(select(ExamItem).where(ExamItem.type.startswith("write")).order_by(ExamItem.created_at.desc())).all()]
    return BUILTIN + gen


def _get(session: Session, task_id: str) -> dict:
    for t in BUILTIN:
        if t["id"] == task_id:
            return t
    item = session.get(ExamItem, task_id)
    if not item or not item.type.startswith("write"):
        raise HTTPException(404, "Không có đề này")
    return {**item.data, "id": item.id, "generated": True}


def _task_text(t: dict) -> str:
    out = [f"Mode: {t['mode']}", f"Context: {t.get('context', '')}", f"Task: {t['prompt']}"]
    if t.get("key_points"):
        out.append("Key points to use: " + "; ".join(t["key_points"]))
    if t.get("sections"):
        out.append("Suggested sections: " + "; ".join(s["name"] for s in t["sections"]))
    return "\n".join(out)


@router.get("/list")
def write_list(session: Session = Depends(get_session)):
    best: dict[str, float] = {}
    last: dict[str, float] = {}
    for a in session.exec(select(Attempt).where(Attempt.skill == "write").order_by(Attempt.created_at)).all():
        if a.score is not None:
            last[a.task] = a.score
            best[a.task] = max(best.get(a.task, 0), a.score)
    topics = {m: [{"key": k, "name": v[0]} for k, v in ts.items()] for m, ts in TOPICS.items()}
    items = [{"id": t["id"], "mode": t["mode"], "topic": t["topic"], "title": t["title"], "level": t.get("level", "B1"),
              "generated": t.get("generated", False), "last_band": last.get(t["id"]), "best_band": best.get(t["id"])}
             for t in _all(session)]
    return {"modes": MODES, "topics": topics, "items": items}


@router.get("/history")
def write_history(session: Session = Depends(get_session)):
    titles = {t["id"]: (t["title"], t["mode"]) for t in _all(session)}
    rows = session.exec(select(Attempt).where(Attempt.skill == "write").order_by(Attempt.created_at.desc())).all()
    return [{"id": a.id, "task": a.task, "title": titles.get(a.task, (a.task, ""))[0], "mode": titles.get(a.task, ("", ""))[1],
             "overall": a.score, "words": len(a.input_text.split()), "created_at": a.created_at.isoformat()} for a in rows[:100]]


@router.get("/attempt/{attempt_id}")
def write_attempt(attempt_id: int, session: Session = Depends(get_session)):
    a = session.get(Attempt, attempt_id)
    if not a or a.skill != "write":
        raise HTTPException(404, "Không có bài này")
    return {"id": a.id, "task": a.task, "text": a.input_text, "result": a.result, "created_at": a.created_at.isoformat()}


@router.get("/task/{task_id}")
def write_task(task_id: str, session: Session = Depends(get_session)):
    return _get(session, task_id)


class GenIn(BaseModel):
    mode: str
    topic: str
    detail: str = ""


@router.post("/generate")
def write_generate(body: GenIn, session: Session = Depends(get_session)):
    if body.mode not in TOPICS or body.topic not in TOPICS[body.mode]:
        raise HTTPException(400, "Chế độ hoặc chủ đề không hợp lệ")
    if not llm.get_settings().llm_enabled:
        raise HTTPException(400, "Cần key LLM để sinh đề mới. Hãy dùng các đề làm sẵn.")
    if body.mode == "quick":
        rules = ("Quick mode (like IELTS Task 1): a short report of 150-250 words about the materials (1-2 blocks: a table, chart, "
                 "log text or diagram). key_points: []. sections: [].")
    else:
        rules = ("Deep mode (like IELTS Task 2): a design document of 400-800 words. materials: one text block with the brief "
                 "(context, users, constraints, numbers), optionally a diagram or table. key_points: 5-7 ideas the writer must develop. "
                 "sections: 5-7 sections such as Overview, Goals and non-goals, Architecture, Data, Method, Trade-offs, Evaluation, Risks; "
                 "hint_vi tells what to write, starter is an English sentence starter.")
    extra = f", more specifically: {body.detail.strip()}" if body.detail.strip() else ""
    try:
        data = llm.complete_json(
            prompts.WRITE_GENERATE.format(level=_level(session), mode=body.mode, topic_desc=TOPICS[body.mode][body.topic][1],
                                          extra=extra, mode_rules=rules),
            mock=lambda: {}, max_tokens=5000, effort="medium",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    if not isinstance(data, dict) or not data.get("prompt") or not data.get("materials"):
        raise HTTPException(502, "Đề sinh ra thiếu nội dung, hãy thử lại.")
    data.update(mode=body.mode, topic=body.topic)
    item = ExamItem(id=f"wgen-{uuid.uuid4().hex[:8]}", type=f"write-{body.mode}", data=data)
    session.add(item)
    session.commit()
    return {**data, "id": item.id, "generated": True}


class GradeIn(BaseModel):
    task_id: str
    text: str


@router.post("/grade")
def write_grade(body: GradeIn, session: Session = Depends(get_session)):
    t = _get(session, body.task_id)
    words = len(body.text.split())
    if words < 20:
        raise HTTPException(400, "Bài viết quá ngắn (tối thiểu 20 từ)")
    lo, hi = t.get("words") or MODES[t["mode"]]["words"]
    deep = t["mode"] == "deep"

    def mock():
        return {"bands": {"task": 5.5, "coherence": 6.0, "lexical": 5.5, "grammar": 5.5, "technical": 6.0}, "overall": 5.5,
                "summary_vi": "[mock] Nhận xét thật sẽ hiện khi có key LLM.",
                "criteria_vi": {k: "[mock]" for k in ("task", "coherence", "lexical", "grammar", "technical")},
                "errors": [], "missing_points_vi": [] if words >= lo else [f"Bài mới có {words} từ, nên viết {lo}-{hi} từ."],
                "section_feedback": [{"section": s["name"], "comment_vi": "[mock]"} for s in t.get("sections", [])] if deep else [],
                "model_answer": "[mock] Model answer.", "useful_phrases": [{"en": v, "vi": ""} for v in t.get("vocab", [])], "next_vi": "", "mock": True}

    try:
        r = llm.complete_json(
            prompts.WRITE_GRADE.format(
                mode_desc="design document (like IELTS Writing Task 2, but professional)" if deep else "short work report (like IELTS Writing Task 1, but professional)",
                task=_task_text(t), material=material_text(t.get("materials", [])), words=words, min_w=lo, max_w=hi, text=body.text,
                task_name="Task Response" if deep else "Task Achievement"),
            mock=mock, smart=True, max_tokens=8000, effort="medium",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    if not isinstance(r, dict):
        raise HTTPException(502, "Kết quả chấm không đúng định dạng, hãy thử lại.")
    bands = r.get("bands") or {}
    core = [bands.get(k) for k in ("task", "coherence", "lexical", "grammar") if isinstance(bands.get(k), (int, float))]
    if core:
        r["overall"] = _round_half(sum(core) / len(core))
    # chỉ giữ lỗi trích đúng từ bài, để giao diện tô sáng được
    r["errors"] = [e for e in (r.get("errors") or []) if isinstance(e, dict) and e.get("original") and e["original"] in body.text]
    r["words"] = words
    a = Attempt(skill="write", task=t["id"], input_text=body.text, result=r, score=r.get("overall"))
    session.add(a)
    session.commit()
    r["attempt_id"] = a.id
    return r


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    task_id: str
    text: str = ""
    grade: Optional[dict] = None
    messages: list[ChatTurn]


@router.post("/chat")
def write_chat(body: ChatIn, session: Session = Depends(get_session)):
    t = _get(session, body.task_id)
    msgs = [m for m in body.messages if m.content.strip()][-16:]
    if not msgs or msgs[-1].role != "user":
        raise HTTPException(400, "Hãy nhập câu hỏi")
    if not llm.get_settings().llm_enabled:
        return {"reply": "[mock] Khi có key LLM, Cô Mai sẽ trả lời câu hỏi về đề, bài viết và điểm của bạn ở đây.", "mock": True}
    grade = {k: body.grade.get(k) for k in ("bands", "overall", "summary_vi", "criteria_vi", "missing_points_vi")} if body.grade else {}
    system = prompts.WRITE_CHAT.format(level=_level(session), task=_task_text(t), material=material_text(t.get("materials", []))[:6000],
                                       text=body.text[:8000] or "(empty)", grade=json.dumps(grade, ensure_ascii=False) if grade else "(not graded yet)")
    convo = [{"role": "assistant" if m.role == "coach" else "user", "content": m.content} for m in msgs]
    while convo and convo[0]["role"] != "user":
        convo.pop(0)
    try:
        reply = llm.chat(convo, system=system, max_tokens=2000)
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    return {"reply": reply.strip()}
