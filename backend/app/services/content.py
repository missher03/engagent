"""Sinh bài đọc/kịch bản nghe + câu hỏi bằng LLM, kèm kiểm tra chất lượng bằng code
(không tin LLM): đủ target words, độ dài, độ dài câu trung bình. Không đạt -> sinh lại tối đa 2 lần."""
from __future__ import annotations

import re

from . import llm, prompts

FORMATS = [
    "research abstract",
    "tech blog paragraph",
    "sprint meeting dialogue with 3 speakers",
    "conference talk excerpt",
    "podcast segment with 2 hosts",
]
LEVEL_RULES = {
    "B1": {"min_words": 150, "max_words": 250, "avg_sentence": (9, 20), "max_unknown_pct": 5},
    "B2": {"min_words": 250, "max_words": 450, "avg_sentence": (14, 28), "max_unknown_pct": 8},
}


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z][A-Za-z'-]*", text))


def avg_sentence_len(text: str) -> float:
    body = re.sub(r"^\s*[A-Z][\w .'-]{0,30}:\s*", "", text, flags=re.M)  # bỏ tên người nói
    sentences = [s for s in re.split(r"[.!?]+\s", body) if s.strip()]
    return word_count(body) / max(len(sentences), 1)


def quality_check(text: str, target_words: list[str], level: str) -> dict:
    rules = LEVEL_RULES.get(level, LEVEL_RULES["B1"])
    lower = text.lower()
    missing = [w for w in target_words if not re.search(rf"\b{re.escape(w.lower())}", lower)]
    wc = word_count(text)
    asl = avg_sentence_len(text)
    lo, hi = rules["avg_sentence"]
    problems = []
    if missing:
        problems.append(f"thiếu từ: {', '.join(missing)}")
    if wc < rules["min_words"] * 0.8 or wc > rules["max_words"] * 1.2:
        problems.append(f"độ dài {wc} từ ngoài ngưỡng {rules['min_words']}-{rules['max_words']}")
    if not lo <= asl <= hi:
        problems.append(f"câu trung bình {asl:.1f} từ ngoài ngưỡng {lo}-{hi}")
    # TODO: kiểm tra tỉ lệ từ ngoài known_words + target_words khi đã có danh sách từ đã thuộc đủ lớn.
    return {"passed": not problems, "problems": problems, "word_count": wc, "avg_sentence": round(asl, 1)}


def _mock_text(topic: str, fmt: str, target_words: list[str]) -> dict:
    words = target_words or ["dataset", "baseline", "outperform"]
    if "dialogue" in fmt or "podcast" in fmt:
        lines = [
            f"Sarah: Okay, let's start. Minh, how is the {topic} work going?",
            f"Minh: It's mostly on track. This week we looked at the {words[0]} again.",
        ]
        for w in words[1:]:
            lines.append(f"Raj: Sorry, can I ask a quick question? What do you mean by {w}?")
            lines.append(f"Minh: Good question. Here, {w} is a key idea for the model we are testing.")
        lines.append("Sarah: Great. Please send me an update by Thursday.")
        text = "\n".join(lines)
    else:
        sents = [f"This short text is about {topic}."]
        sents += [f"In many projects, the idea of {w} is important for the final result." for w in words]
        sents.append("These ideas may help you explain your work clearly.")
        text = " ".join(sents)
    return {
        "title": f"[mock] {topic}",
        "text": text,
        "words_used": words,
        "grammar_examples": [],
        "estimated_level": "B1",
    }


def _mock_quiz(target_words: list[str]) -> dict:
    w = target_words[0] if target_words else "baseline"
    return {
        "questions": [
            {
                "type": "main_idea",
                "question": "What is the text mainly about?",
                "options": ["A project update", "A holiday plan", "A recipe"],
                "answer": "A project update",
                "explanation_vi": "[mock] Bài nói về tiến độ dự án.",
                "skill": "reading",
            },
            {
                "type": "vocab",
                "question": f'What does "{w}" mean in the text?',
                "options": None,
                "answer": w,
                "explanation_vi": "[mock] Cần ANTHROPIC_API_KEY để sinh câu hỏi thật.",
                "skill": "vocab",
            },
            {
                "type": "speaking",
                "question": f"In 30 seconds, explain how '{w}' is used in a real IT or AI project.",
                "options": None,
                "answer": "",
                "explanation_vi": "Câu nói mở, không có đáp án cố định.",
                "skill": "speaking",
            },
        ]
    }


def generate_text(
    *, topic: str, level: str, fmt: str, target_words: list[str], review_words: list[str],
    grammar_focus: str, learner_context: str = "",
) -> tuple[dict, dict]:
    rules = LEVEL_RULES.get(level, LEVEL_RULES["B1"])
    prompt = prompts.GENERATE_TEXT.format(
        level=level, format=fmt, topic=topic,
        learner_context=(f" Optionally, one example may relate to the learner's own work: {learner_context}." if learner_context else ""),
        min_words=rules["min_words"], max_words=rules["max_words"],
        max_unknown_pct=rules["max_unknown_pct"], grammar_focus=grammar_focus,
        target_words=", ".join(target_words), review_words=", ".join(review_words) or "(none)",
    )
    result, qc = None, {}
    for attempt in range(3):  # lần đầu + tối đa 2 lần sinh lại
        extra = "" if attempt == 0 else f"\n\nYour previous draft failed these checks: {qc['problems']}. Fix them."
        result = llm.complete_json(
            prompt + extra,
            mock=lambda: _mock_text(topic, fmt, target_words),
            max_tokens=3000,
        )
        qc = quality_check(result.get("text", ""), target_words, level)
        qc["attempts"] = attempt + 1
        if qc["passed"] or result.get("title", "").startswith("[mock]"):
            break
    return result, qc


def generate_quiz(text: str, target_words: list[str], level: str, n: int = 7) -> list[dict]:
    data = llm.complete_json(
        prompts.GENERATE_QUIZ.format(n=n, level=level, text=text, target_words=", ".join(target_words)),
        mock=lambda: _mock_quiz(target_words),
        max_tokens=3000,
    )
    return data.get("questions", [])
