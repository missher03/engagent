"""Chuyển chữ thành giọng nói bằng Google Cloud TTS (REST + API key), cache file MP3 theo hash.

Hội thoại dạng "Name: text" được đọc bằng 2 giọng xen kẽ. Thiếu key -> trả None,
frontend tự dùng giọng đọc của trình duyệt (Web Speech API).
"""
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

import httpx

from ..config import get_settings

URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
SPEAKER_LINE = re.compile(r"^\s*([A-Z][\w .'-]{0,30}):\s*(.+)$")


class TTSError(RuntimeError):
    pass


def audio_dir() -> Path:
    d = Path(get_settings().storage_dir) / "audio"
    d.mkdir(parents=True, exist_ok=True)
    return d


def split_segments(text: str) -> list[tuple[str | None, str]]:
    """Tách thành (người nói, câu). Bài không phải hội thoại -> các đoạn ≤ 4000 ký tự."""
    lines = [l for l in text.splitlines() if l.strip()]
    if lines and sum(bool(SPEAKER_LINE.match(l)) for l in lines) >= max(2, len(lines) // 2):
        out = []
        for l in lines:
            m = SPEAKER_LINE.match(l)
            out.append((m.group(1), m.group(2)) if m else (None, l))
        return out
    chunks, buf = [], ""
    for sent in re.split(r"(?<=[.!?])\s+", text):
        if len(buf) + len(sent) > 4000:
            chunks.append((None, buf))
            buf = ""
        buf += (" " if buf else "") + sent
    if buf:
        chunks.append((None, buf))
    return chunks


def _synth(text: str, voice: str, rate: float) -> bytes:
    s = get_settings()
    body = {
        "input": {"text": text},
        "voice": {"languageCode": voice[:5], "name": voice},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": rate},
    }
    try:
        r = httpx.post(URL, params={"key": s.google_tts_api_key}, json=body, timeout=30)
    except httpx.HTTPError as e:
        raise TTSError(f"Không gọi được Google TTS: {e}") from e
    if r.status_code != 200:
        raise TTSError(f"Google TTS lỗi {r.status_code}: {r.text[:200]}")
    return base64.b64decode(r.json()["audioContent"])


def synthesize(text: str, rate: float = 1.0) -> str | None:
    """Trả tên file MP3 trong storage/audio (đã cache), hoặc None nếu TTS tắt."""
    s = get_settings()
    if not s.tts_enabled:
        return None
    key = hashlib.sha256(f"{s.google_tts_voice_a}|{s.google_tts_voice_b}|{rate}|{text}".encode()).hexdigest()[:24]
    path = audio_dir() / f"{key}.mp3"
    if path.exists():
        return path.name
    voices = [s.google_tts_voice_a, s.google_tts_voice_b]
    speakers: dict[str, str] = {}
    audio = b""
    for speaker, seg in split_segments(text):
        voice = voices[0]
        if speaker:
            voice = speakers.setdefault(speaker, voices[len(speakers) % len(voices)])
        audio += _synth(seg, voice, rate)  # ghép MP3 frame liền nhau phát được trên trình duyệt
    path.write_bytes(audio)
    return path.name
