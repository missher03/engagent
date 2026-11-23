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


def test_minimax_provider_builds_request(monkeypatch):
    """Khi LLM_PROVIDER=minimax: dùng base_url MiniMax, model MiniMax, nới max_tokens."""
    from types import SimpleNamespace

    from app.config import Settings
    from app.services import llm

    s = Settings(llm_provider="minimax", minimax_api_key="k", force_mock=False)
    captured = {}

    class FakeMessages:
        def create(self, **kw):
            captured.update(kw)
            return SimpleNamespace(stop_reason="end_turn", content=[
                SimpleNamespace(type="thinking", thinking="..."), SimpleNamespace(type="text", text='{"a": 1}')])

    monkeypatch.setattr(llm, "get_settings", lambda: s)
    monkeypatch.setattr(llm, "_get_client", lambda: SimpleNamespace(messages=FakeMessages()))
    assert s.llm_enabled
    assert llm.complete_json("hi", mock=lambda: None, max_tokens=1000) == {"a": 1}
    assert captured["model"] == "MiniMax-M3.1-Flash"
    assert captured["max_tokens"] == 6000
    assert captured["output_config"] == {"effort": "low"}
