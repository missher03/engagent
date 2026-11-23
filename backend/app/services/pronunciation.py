"""Chấm phát âm bằng Azure Pronunciation Assessment (REST, audio ngắn ≤ 30 giây).

Frontend gửi WAV PCM 16 kHz mono (đã chuyển đổi trong trình duyệt). Thiếu key -> mock.
Docs: https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment
"""
from __future__ import annotations

import base64
import json
import random

import httpx

from ..config import get_settings

ENDPOINT = (
    "https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/"
    "cognitiveservices/v1?language=en-US&format=detailed"
)


class PronunciationError(RuntimeError):
    pass


def _pa_header(reference_text: str) -> str:
    cfg = {
        "ReferenceText": reference_text,
        "GradingSystem": "HundredMark",
        "Granularity": "Phoneme",
        "Dimension": "Comprehensive",
        "EnableMiscue": True,
        "EnableProsodyAssessment": True,
    }
    return base64.b64encode(json.dumps(cfg).encode()).decode()


def _score(obj: dict, name: str):
    """Azure trả điểm trực tiếp hoặc lồng trong PronunciationAssessment tùy phiên bản."""
    if name in obj:
        return obj[name]
    return (obj.get("PronunciationAssessment") or {}).get(name)


def normalize(raw: dict) -> dict:
    best = (raw.get("NBest") or [{}])[0]
    words = []
    for w in best.get("Words", []):
        words.append(
            {
                "word": w.get("Word"),
                "accuracy": _score(w, "AccuracyScore"),
                "error_type": _score(w, "ErrorType") or "None",
                "phonemes": [
                    {"phoneme": p.get("Phoneme"), "accuracy": _score(p, "AccuracyScore")}
                    for p in w.get("Phonemes", [])
                ],
            }
        )
    return {
        "recognized_text": best.get("Display") or raw.get("DisplayText", ""),
        "pron_score": _score(best, "PronScore"),
        "accuracy": _score(best, "AccuracyScore"),
        "fluency": _score(best, "FluencyScore"),
        "completeness": _score(best, "CompletenessScore"),
        "prosody": _score(best, "ProsodyScore"),
        "words": words,
        "mock": False,
    }


def mock_result(reference_text: str) -> dict:
    rnd = random.Random(reference_text)
    words = []
    for token in reference_text.split():
        acc = rnd.randint(55, 100)
        words.append(
            {
                "word": token.strip(".,!?;:"),
                "accuracy": acc,
                "error_type": "Mispronunciation" if acc < 70 else "None",
                "phonemes": [],
            }
        )
    avg = sum(w["accuracy"] for w in words) / max(len(words), 1)
    return {
        "recognized_text": reference_text,
        "pron_score": round(avg, 1),
        "accuracy": round(avg, 1),
        "fluency": rnd.randint(60, 95),
        "completeness": 100,
        "prosody": rnd.randint(55, 90),
        "words": words,
        "mock": True,
    }


def assess(wav_bytes: bytes, reference_text: str) -> dict:
    s = get_settings()
    if not s.azure_enabled:
        return mock_result(reference_text)
    headers = {
        "Ocp-Apim-Subscription-Key": s.azure_speech_key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Accept": "application/json",
        "Pronunciation-Assessment": _pa_header(reference_text),
    }
    try:
        r = httpx.post(
            ENDPOINT.format(region=s.azure_speech_region),
            headers=headers,
            content=wav_bytes,
            timeout=httpx.Timeout(20.0),
        )
    except httpx.HTTPError as e:
        raise PronunciationError(f"Không gọi được Azure: {e}") from e
    if r.status_code != 200:
        raise PronunciationError(f"Azure lỗi {r.status_code}: {r.text[:200]}")
    data = r.json()
    if data.get("RecognitionStatus") not in (None, "Success"):
        raise PronunciationError(f"Không nhận dạng được giọng nói ({data.get('RecognitionStatus')})")
    return normalize(data)
