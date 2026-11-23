"""Tra từ: Free Dictionary API (IPA, audio, định nghĩa) + Datamuse (từ liên quan)
+ Claude (nghĩa tiếng Việt theo ngữ cảnh DS/AI). Kết quả được lưu vào bảng Word (cache)."""
from __future__ import annotations

import json
import logging
import re

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


def llm_entries(terms: list[str], subtopic: str = "general IT and data science", category: str = "IT") -> list[dict]:
    """Sinh nội dung đầy đủ (nghĩa, IPA, trọng âm, cách dùng, ví dụ...) cho một lô từ."""
    data = llm.complete_json(
        prompts.WORD_BATCH.format(terms=json.dumps(terms, ensure_ascii=False), subtopic=subtopic, category=category),
        mock=lambda: {"entries": [
            {"term": t, "meaning_vi": f"[mock] nghĩa của '{t}' (chưa có key LLM)", "definition_en": None,
             "example": f"In our project, {t} played an important role.", "collocations": [], "cefr": "B2"}
            for t in terms]},
        max_tokens=600 + 450 * len(terms),
    )
    return data.get("entries", []) if isinstance(data, dict) else []


def llm_meaning(term: str, context: str = "", topics: str = "") -> dict:
    """Nghĩa đầy đủ cho một từ. Nếu có danh sách topics thì LLM đồng thời xếp từ vào một chủ đề nhỏ."""
    hint = f"general IT/data science (context sentence: {context})" if context else "general IT and data science"
    prompt = prompts.WORD_BATCH.format(terms=json.dumps([term], ensure_ascii=False), subtopic=hint, category="IT")
    if topics:
        prompt += prompts.CLASSIFY_SUFFIX.format(topics=topics)
    data = llm.complete_json(
        prompt,
        mock=lambda: {"entries": [{"term": term, "meaning_vi": f"[mock] nghĩa của '{term}' (chưa có key LLM)",
                                   "example": f"In our project, {term} played an important role.", "cefr": "B2"}]},
        max_tokens=1200,
    )
    entries = data.get("entries", []) if isinstance(data, dict) else []
    return entries[0] if entries else {}


def lookup(term: str, context: str = "", topics: str = "") -> dict:
    """Tra đầy đủ một từ (không đụng DB). topics: danh sách chủ đề để LLM phân loại (tùy chọn)."""
    base = fetch_free_dictionary(term)
    meaning = llm_meaning(term, context, topics)
    return {
        "term": term,
        "ipa": meaning.get("ipa") or base.get("ipa"),
        "stress": meaning.get("stress"),
        "audio_url": base.get("audio_url"),
        "part_of_speech": meaning.get("part_of_speech") or base.get("part_of_speech"),
        "definition_en": meaning.get("definition_en") or base.get("definition_en"),
        "meaning_vi": meaning.get("meaning_vi"),
        "usage_vi": meaning.get("usage_vi"),
        "example": meaning.get("example") or base.get("example"),
        "example_vi": meaning.get("example_vi"),
        "collocations": meaning.get("collocations") or [],
        "cefr": meaning.get("cefr"),
        "related": fetch_related(term),
        "subtopic": meaning.get("subtopic"),
    }


_VI_CHARS = re.compile(r"[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]", re.I)
_VI_WORDS = {"la", "cua", "va", "cho", "nhung", "khong", "nghia", "du lieu", "mo hinh", "ket qua", "phan tich"}


def detect_lang(text: str) -> str:
    """'vi' nếu có dấu tiếng Việt (hoặc vài từ không dấu rất phổ biến), ngược lại 'en'."""
    if _VI_CHARS.search(text):
        return "vi"
    return "vi" if text.strip().lower() in _VI_WORDS else "en"


def vi_to_en(query: str, context: str = "") -> dict:
    data = llm.complete_json(
        prompts.VI_TO_EN.format(query=query, context=context or "(none)"),
        mock=lambda: {"candidates": [{"term": "meaning", "part_of_speech": "noun", "ipa": "/ˈmiːnɪŋ/",
                                      "stress": "MEAN-ing", "nuance_vi": "[mock] cần key LLM để gợi ý thật",
                                      "register": "neutral", "example": "What is the meaning of this result?",
                                      "example_vi": "Kết quả này có ý nghĩa gì?"}], "note_vi": ""},
        max_tokens=2500,
    )
    return data if isinstance(data, dict) else {"candidates": []}
