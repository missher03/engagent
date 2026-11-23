from app.services import content


def test_quality_check_flags_missing_words():
    qc = content.quality_check("The model works well. It is good.", ["baseline", "model"], "B1")
    assert not qc["passed"]
    assert any("baseline" in p for p in qc["problems"])
