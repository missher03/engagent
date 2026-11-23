from datetime import datetime, timedelta

from app.services import srs

NOW = datetime(2026, 1, 1)


def test_correct_answers_follow_schedule():
    level, step, l4 = 1, 0, 0
    gaps = []
    for _ in range(5):
        r = srs.schedule(level, step, l4, True, NOW)
        gaps.append((r.due - NOW).days)
        level, step, l4 = r.level, r.step, r.level4_passes
    assert gaps == [1, 3, 7, 16, 35]
    assert level == 4
    assert srs.is_mastered(step, l4, priority=2)


def test_wrong_answer_drops_level_and_reviews_tomorrow():
    r = srs.schedule(3, 3, 0, False, NOW)
    assert r.level == 2 and r.step == 0 and r.due == NOW + timedelta(days=1)


def test_priority1_needs_two_level4_passes():
    assert not srs.is_mastered(5, 1, priority=1)
    assert srs.is_mastered(5, 2, priority=1)


def test_cloze_and_check():
    w = {"term": "overfit", "meaning_vi": "quá khớp", "example": "The model overfits the training data.", "collocations": []}
    q = srs.build_question(w, 2, [])
    assert q["type"] == "cloze" and "___" in q["prompt"]
    assert srs.check_answer("cloze", "overfit", "overfits")
    assert not srs.check_answer("cloze", "overfit", "underfit")
