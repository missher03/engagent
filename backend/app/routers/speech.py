"""Chấm phát âm (Azure), TTS (Google), chấm bài nói (LLM + dữ liệu phát âm)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Attempt
from ..services import llm, prompts, pronunciation, tts

router = APIRouter(prefix="/api", tags=["speech"])


@router.post("/pronunciation/assess")
async def assess(
    reference_text: str = Form("", description="Để trống = chấm nói tự do (không kịch bản)"),
    audio: UploadFile = File(..., description="WAV PCM 16kHz mono"),
    session: Session = Depends(get_session),
):
    data = await audio.read()
    if len(data) > 5_000_000:
        raise HTTPException(413, "Audio quá dài (tối đa ~30 giây)")
    try:
        result = pronunciation.assess(data, reference_text)
    except pronunciation.PronunciationError as e:
        raise HTTPException(502, str(e)) from e
    session.add(Attempt(skill="pronunciation", task=reference_text, result=result, score=result.get("pron_score")))
    session.commit()
    return result


@router.get("/pronunciation/history")
def history(limit: int = 30, session: Session = Depends(get_session)):
    rows = session.exec(
        select(Attempt).where(Attempt.skill == "pronunciation").order_by(Attempt.created_at.desc()).limit(limit)
    ).all()
    return [{"task": a.task, "score": a.score, "at": a.created_at} for a in rows]


class TTSRequest(BaseModel):
    text: str
    rate: float = 1.0


@router.post("/tts")
def synth(body: TTSRequest):
    try:
        name = tts.synthesize(body.text, body.rate)
    except tts.TTSError as e:
        raise HTTPException(502, str(e)) from e
    return {"url": f"/audio/{name}" if name else None, "fallback": "browser" if not name else None}


class SpeakingGrade(BaseModel):
    task: str
    transcript: str
    pron_data: dict = {}


@router.post("/speaking/grade")
def grade_speaking(body: SpeakingGrade, session: Session = Depends(get_session)):
    try:
        result = llm.complete_json(
            prompts.GRADE_SPEAKING.format(
                speaking_task=body.task, transcript=body.transcript,
                pron_data=json.dumps(body.pron_data), speaking_rubric=prompts.SPEAKING_RUBRIC,
            ),
            mock=lambda: {
                "scores": {"task": 3, "vocabulary": 3, "grammar": 3, "pronunciation": 3},
                "fixes": [{"said": body.transcript[:60], "better": "[mock] cần ANTHROPIC_API_KEY", "why_vi": ""}],
                "model_answer": "[mock]", "drill_words": [], "overall_level": "B1",
            },
            smart=True, max_tokens=3000, effort="medium",
        )
    except llm.LLMError as e:
        raise HTTPException(502, str(e)) from e
    scores = result.get("scores") or {}
    avg = sum(scores.values()) / len(scores) if scores else None
    session.add(Attempt(skill="speaking", task=body.task, input_text=body.transcript, result=result, score=avg))
    session.commit()
    return result
