"""Lịch ôn lặp lại ngắt quãng + 4 mức ghi nhớ (theo tài liệu thiết kế bài luyện).

Lịch: 1 → 3 → 7 → 16 → 35 ngày. Đúng: lên mức, giãn khoảng. Sai: về mức trước, ôn lại ngày mai.
Đây là bản đơn giản kiểu Leitner; PRD gợi ý FSRS, có thể thay bằng gói `fsrs` sau
mà không đổi API (chỉ sửa hàm `schedule`).
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

INTERVALS_DAYS = [1, 3, 7, 16, 35]
MASTERED_INTERVAL = 21  # PRD: "thuộc" khi interval ≥ 21 ngày
MAX_LEVEL = 4


@dataclass
class ScheduleResult:
    level: int
    step: int
    due: datetime
    level4_passes: int


def schedule(level: int, step: int, level4_passes: int, correct: bool, now: datetime) -> ScheduleResult:
    if correct:
        if level == MAX_LEVEL:
            level4_passes += 1
        new_level = min(level + 1, MAX_LEVEL)
        interval = INTERVALS_DAYS[min(step, len(INTERVALS_DAYS) - 1)]
        new_step = min(step + 1, len(INTERVALS_DAYS))
        return ScheduleResult(new_level, new_step, now + timedelta(days=interval), level4_passes)
    return ScheduleResult(max(level - 1, 1), 0, now + timedelta(days=1), level4_passes)


def is_mastered(step: int, level4_passes: int, priority: int) -> bool:
    if priority == 1:
        return level4_passes >= 2
    # step = số lần đúng liên tiếp; khoảng gần nhất đã giao là INTERVALS_DAYS[step - 1]
    return step > 0 and INTERVALS_DAYS[min(step, len(INTERVALS_DAYS)) - 1] >= MASTERED_INTERVAL


def blank_term(sentence: str, term: str) -> str | None:
    """Thay từ (và biến thể -s/-ed/-ing) trong câu bằng ___ để làm bài điền từ."""
    pattern = re.compile(rf"\b{re.escape(term)}\w*", re.I)
    if not pattern.search(sentence):
        return None
    return pattern.sub("___", sentence, count=1)


def build_question(word: dict, level: int, distractors: list[dict]) -> dict:
    """Sinh câu hỏi ôn tập theo mức. word/distractors là dict có term, meaning_vi, example, collocations."""
    term = word["term"]
    if level == 1 or not word.get("example"):
        options = [word.get("meaning_vi") or term] + [
            d.get("meaning_vi") or d["term"] for d in distractors[:3]
        ]
        random.shuffle(options)
        return {
            "type": "meaning_mc",
            "prompt": f'Chọn nghĩa đúng của "{term}"',
            "options": options,
            "answer": word.get("meaning_vi") or term,
        }
    if level == 2:
        cloze = blank_term(word["example"], term)
        if cloze:
            return {"type": "cloze", "prompt": cloze, "hint": word.get("meaning_vi"), "answer": term}
        return {"type": "vi_to_en", "prompt": f"Gõ từ tiếng Anh: {word.get('meaning_vi')}", "answer": term}
    if level == 3 and word.get("collocations"):
        correct = word["collocations"][0]
        wrong = [c for d in distractors for c in (d.get("collocations") or [])[:1]][:2]
        options = [correct] + wrong
        random.shuffle(options)
        return {
            "type": "collocation_mc",
            "prompt": f'Cụm nào là collocation tự nhiên với "{term}"?',
            "options": options,
            "answer": correct,
        }
    return {
        "type": "produce",
        "prompt": f'Viết (hoặc nói) 1 câu trong ngữ cảnh công việc IT/AI có dùng "{term}".',
        "answer": term,
    }


def check_answer(question_type: str, answer: str, user_answer: str) -> bool:
    norm = lambda s: re.sub(r"\s+", " ", (s or "").strip().lower())  # noqa: E731
    if question_type == "produce":
        return norm(answer).split()[0] in norm(user_answer)
    if question_type in ("cloze", "vi_to_en"):
        return norm(user_answer).startswith(norm(answer)[: max(3, len(norm(answer)) - 2)])
    return norm(answer) == norm(user_answer)
