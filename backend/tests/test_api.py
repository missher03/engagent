def test_health(client):
    r = client.get("/api/health")
    assert r.json()["services"]["llm"] == "mock"


def test_seeded_words_and_notebook_flow(client):
    words = client.get("/api/words", params={"topic": 9}).json()
    assert any(w["term"] == "Sharpe ratio" for w in words)
    r = client.post("/api/notebook", json={"term": "backtest"})
    assert r.status_code == 200
    due = client.get("/api/review/due").json()
    assert due and due[0]["question"]["type"] == "meaning_mc"
    q = due[0]["question"]
    res = client.post(f"/api/review/{due[0]['card_id']}", json={
        "question_type": q["type"], "answer": q["answer"], "user_answer": q["answer"]}).json()
    assert res["correct"] and res["level"] == 2
    assert client.get("/api/stats").json()["reviews"] == 1


def test_lesson_writing_examiner_pronunciation(client):
    lesson = client.post("/api/lessons/generate", json={"topic_id": 9, "level": "B1"}).json()
    assert lesson["text"] and lesson["questions"]
    g = client.post("/api/writing/grade", json={"task_id": "W4-backtest",
        "text": "Both models outperform the benchmark and the results are robust in our test period."}).json()
    assert "scores" in g
    q = client.post("/api/examiner/next", json={"turns": []}).json()
    assert q["question"]
    p = client.post("/api/pronunciation/assess", data={"reference_text": "The model outperformed the benchmark."},
                    files={"audio": ("a.wav", b"RIFF0000", "audio/wav")}).json()
    assert p["mock"] and p["words"]
