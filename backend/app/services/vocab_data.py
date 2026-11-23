"""Đọc kho từ (vocab_taxonomy.txt) và nội dung sinh sẵn (vocab_content.json), nạp vào DB."""
from __future__ import annotations

import json
import re
from pathlib import Path

from sqlmodel import Session, select

from ..models import Word

DATA = Path(__file__).resolve().parent.parent / "data"
TAXONOMY = DATA / "vocab_taxonomy.txt"
CONTENT = DATA / "vocab_content.json"
CONTENT_FIELDS = (
    "meaning_vi", "definition_en", "part_of_speech", "ipa", "stress",
    "usage_vi", "collocations", "example", "example_vi", "cefr",
)
_SPLIT = re.compile(r",(?![^()]*\))")  # không tách dấu phẩy trong ngoặc


def parse_taxonomy(path: Path = TAXONOMY) -> list[dict]:
    """Trả [{key, name, words:[{key, name, terms:[...]}]}] theo thứ tự trong file."""
    categories: list[dict] = []
    sub = None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("## "):
            key, _, name = line[3:].partition("|")
            if not categories:
                continue
            sub = {"key": key.strip(), "name": name.strip(), "terms": []}
            categories[-1]["subtopics"].append(sub)
        elif line.startswith("# "):
            key, _, name = line[2:].partition("|")
            if not name or not re.fullmatch(r"[a-z0-9-]+", key.strip()):
                continue  # dòng chú thích
            categories.append({"key": key.strip(), "name": name.strip(), "subtopics": []})
            sub = None
        elif sub is not None:
            sub["terms"] += [t.strip() for t in _SPLIT.split(line) if t.strip()]
    return categories


def term_index(categories: list[dict]) -> dict[str, dict]:
    """term (lower) -> {term, category, subtopic (đầu tiên), subtopics (tất cả)}."""
    idx: dict[str, dict] = {}
    for c in categories:
        for s in c["subtopics"]:
            for t in s["terms"]:
                e = idx.setdefault(t.lower(), {"term": t, "category": c["key"], "subtopic": s["key"], "subtopics": []})
                if s["key"] not in e["subtopics"]:
                    e["subtopics"].append(s["key"])
    return idx


def load_content() -> dict[str, dict]:
    if not CONTENT.exists():
        return {}
    return {k.lower(): v for k, v in json.loads(CONTENT.read_text(encoding="utf-8")).items()}


def is_mock(value) -> bool:
    return isinstance(value, str) and value.startswith("[mock]")


def sync_words(session: Session) -> dict:
    """Thêm từ mới từ taxonomy, gắn lĩnh vực/chủ đề, đổ nội dung sinh sẵn, xóa nghĩa [mock] cũ."""
    idx = term_index(parse_taxonomy())
    content = load_content()
    existing = {w.term.lower(): w for w in session.exec(select(Word)).all()}
    added = filled = 0
    for key, info in idx.items():
        w = existing.get(key)
        if w is None:
            w = Word(term=info["term"], deck=info["category"])
            existing[key] = w
            added += 1
        w.category = w.category or info["category"]
        w.subtopic = w.subtopic or info["subtopic"]
        w.subtopics = sorted(set((w.subtopics or []) + info["subtopics"]))
        session.add(w)
    for key, w in existing.items():
        for f in CONTENT_FIELDS:
            if is_mock(getattr(w, f, None)):
                setattr(w, f, None)
                w.enriched = False
        c = content.get(key)
        if c and not w.enriched:
            for f in CONTENT_FIELDS:
                if c.get(f) and not getattr(w, f):
                    setattr(w, f, c[f])
            w.enriched = bool(w.meaning_vi)
            filled += 1
        session.add(w)
    session.commit()
    return {"added": added, "filled_from_content": filled, "total": len(existing)}
