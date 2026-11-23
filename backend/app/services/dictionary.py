"""Tra từ: Free Dictionary API (IPA, audio, định nghĩa) + Datamuse (từ liên quan)
+ Claude (nghĩa tiếng Việt theo ngữ cảnh DS/AI). Kết quả được lưu vào bảng Word (cache)."""
from __future__ import annotations

import logging

import httpx

from ..config import get_settings
from . import llm, prompts

log = logging.getLogger(__name__)
FREE_DICT = "https://api.dictionaryapi.dev/api/v2/entries/en/{term}"
DATAMUSE = "https://api.datamuse.com/words"
TIMEOUT = httpx.Timeout(6.0)


def fetch_free_dictionary(term: str) -> dict:
    """Trả {ipa, audio_url, definition_en, example, part_of_speech} hoặc {} nếu không có."""
    if get_settings().force_mock:
        return {}
    try:
        r = httpx.get(FREE_DICT.format(term=term), timeout=TIMEOUT)
        if r.status_code != 200:
            return {}
        entry = r.json()[0]
    except (httpx.HTTPError, ValueError, IndexError, KeyError):
        log.warning("Free Dictionary lỗi với %r", term)
        return {}
    ipa = entry.get("phonetic")
    audio = None
    for p in entry.get("phonetics", []):
        ipa = ipa or p.get("text")
        if p.get("audio"):
            audio = audio or p["audio"]
            if "-us" in p["audio"]:
                audio = p["audio"]
    out: dict = {"ipa": ipa, "audio_url": audio}
    for m in entry.get("meanings", []):
        for d in m.get("definitions", []):
            out.setdefault("part_of_speech", m.get("partOfSpeech"))
            out.setdefault("definition_en", d.get("definition"))
            if d.get("example"):
                out.setdefault("example", d["example"])
    return out


def fetch_related(term: str, max_items: int = 8) -> list[str]:
    if get_settings().force_mock:
        return []
    params = {"ml": term, "max": max_items}
    key = get_settings().datamuse_api_key
    if key:
        params["key"] = key
    try:
        r = httpx.get(DATAMUSE, params=params, timeout=TIMEOUT)
        return [w["word"] for w in r.json()] if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return []


def llm_meaning(term: str, context: str = "") -> dict:
    return llm.complete_json(
        prompts.WORD_MEANING.format(term=term, context=context or "(none)"),
        mock=lambda: {
            "meaning_vi": f"[mock] nghĩa tiếng Việt của '{term}' (cần ANTHROPIC_API_KEY)",
            "definition_en": f"[mock] simple definition of {term}",
            "example": f"In our project, {term} played an important role.",
            "collocations": [],
            "cefr": "B2",
        },
        max_tokens=800,
    )


def lookup(term: str, context: str = "") -> dict:
    """Tra đầy đủ một từ (không đụng DB)."""
    base = fetch_free_dictionary(term)
    meaning = llm_meaning(term, context)
    return {
        "term": term,
        "ipa": base.get("ipa"),
        "audio_url": base.get("audio_url"),
        "part_of_speech": base.get("part_of_speech"),
        "definition_en": base.get("definition_en") or meaning.get("definition_en"),
        "meaning_vi": meaning.get("meaning_vi"),
        "example": meaning.get("example") or base.get("example"),
        "collocations": meaning.get("collocations") or [],
        "cefr": meaning.get("cefr"),
        "related": fetch_related(term),
    }
