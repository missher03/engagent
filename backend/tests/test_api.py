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
    g = client.post("/api/writing/grade", json={"task_id": "W4-results",
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


def test_taxonomy_categories_and_word_practice(client):
    data = client.get("/api/categories").json()
    cats = data["categories"]
    assert data["total"] >= 2000 and len(cats) == 11
    words = client.get("/api/words", params={"subtopic": "ml-eval"}).json()
    assert words[0]["term"] == "evaluation metric"
    wid = words[0]["id"]
    d = client.get(f"/api/words/{wid}").json()
    assert d["term"] == "evaluation metric" and not (d["meaning_vi"] or "").startswith("[mock]")
    r = client.post(f"/api/words/{wid}/sentence", json={"sentence": "We chose F1 as the main evaluation metric for this task."}).json()
    assert r["correct_usage"] is True
    added = client.post("/api/subtopics/ml-eval/notebook").json()["added"]
    assert added > 40


def test_vietnamese_lookup(client):
    from app.services.dictionary import detect_lang

    assert detect_lang("ý nghĩa") == "vi" and detect_lang("overfitting") == "en"
    r = client.get("/api/dictionary/lookup", params={"q": "ý nghĩa"}).json()
    assert r["mode"] == "vi" and r["candidates"][0]["term"]
    r = client.get("/api/dictionary/lookup", params={"q": "data", "lang": "vi"}).json()
    assert r["mode"] == "vi"


def test_lookup_is_remembered_and_classified(client, monkeypatch):
    from app.services import dictionary

    fake = {"term": "blorp toggle", "meaning_vi": "cờ tính năng", "definition_en": "a switch to turn a feature on or off",
            "example": "We hid the new checkout behind a feature flag.", "collocations": [], "related": [],
            "subtopic": "se-devops-x"}
    # Chủ đề không tồn tại -> vẫn lưu, nằm trong "Từ bạn đã tra"
    monkeypatch.setattr(dictionary, "lookup", lambda term, context="", topics="": {**fake, "term": term})
    monkeypatch.setattr(dictionary, "fetch_related", lambda term, max_items=8: [])
    r = client.get("/api/dictionary/lookup", params={"q": "blorp toggle", "lang": "en"}).json()
    assert r["id"] and r["saved_to"]["key"] == "my-lookups" and r["lookup_count"] == 1

    # Từ mới được LLM xếp vào chủ đề có thật -> hiện trong chủ đề đó
    sub = client.get("/api/categories").json()["categories"][1]["subtopics"][0]["key"]
    monkeypatch.setattr(dictionary, "lookup", lambda term, context="", topics="": {**fake, "term": term, "subtopic": sub})
    r2 = client.get("/api/dictionary/lookup", params={"q": "snarf release", "lang": "en"}).json()
    assert r2["saved_to"]["key"] == sub
    assert any(w["term"] == "snarf release" for w in client.get("/api/words", params={"subtopic": sub}).json())

    # Tra lại: dùng bản đã lưu, tăng số lần tra
    r3 = client.get("/api/dictionary/lookup", params={"q": "Blorp Toggle", "lang": "en"}).json()
    assert r3["id"] == r["id"] and r3["lookup_count"] == 2 and r3["meaning_vi"] == "cờ tính năng"

    hist = client.get("/api/dictionary/history").json()
    assert hist[0]["term"] == "blorp toggle"
    cats = client.get("/api/categories").json()
    assert cats["categories"][0]["key"] == "mine" and cats["mine"] >= 2
    mine = client.get("/api/words", params={"subtopic": "my-lookups"}).json()
    assert [w["term"] for w in mine][:2] == ["blorp toggle", "snarf release"]


def test_speaking_coach(client, monkeypatch):
    r = client.post("/api/coach/chat", json={"messages": [{"role": "user", "content": "tôi nghĩ nên kiểm thử mô hình trước khi triển khai"}]})
    d = r.json()
    assert r.status_code == 200 and d["say_vi"] and d["english"] and d["steps"]
    assert client.post("/api/coach/chat", json={"messages": [{"role": "coach", "content": "x"}]}).status_code == 400

    # Bật LLM giả: kiểm tra lịch sử hội thoại gửi đi đúng vai và JSON được đọc ra
    from app.services import llm
    seen = {}
    monkeypatch.setattr(llm.get_settings(), "force_mock", False, raising=False)
    monkeypatch.setattr(type(llm.get_settings()), "llm_enabled", property(lambda s: True))
    def fake_chat(messages, **kw):
        seen["messages"], seen["system"] = messages, kw["system"]
        return '```json\n{"mode": "answer", "say_vi": "Vì ...", "english": null, "steps": []}\n```'
    monkeypatch.setattr(llm, "chat", fake_chat)
    d = client.post("/api/coach/chat", json={"messages": [
        {"role": "coach", "content": "chào"}, {"role": "user", "content": "ý 1"},
        {"role": "coach", "content": "In my opinion..."}, {"role": "user", "content": "tại sao dùng should?"}]}).json()
    assert d["mode"] == "answer" and d["phrases"] == []
    assert [m["role"] for m in seen["messages"]] == ["user", "assistant", "user"]
    assert "Cô Mai" in seen["system"]


def test_conversation_mode(client):
    assert any(s["key"] == "interview" for s in client.get("/api/coach/scenarios").json())
    first = client.post("/api/coach/talk", json={"messages": [], "scenario": "standup"}).json()
    assert first["reply_en"] and first["reply_vi"]
    msgs = [{"role": "coach", "content": first["reply_en"]}, {"role": "user", "content": "tôi không biết nói sao"}]
    r = client.post("/api/coach/talk", json={"messages": msgs, "scenario": "standup"}).json()
    assert r["help"]["english"]
    s = client.post("/api/coach/talk/summary", json={"messages": msgs, "scenario": "standup"}).json()
    assert s["summary_vi"]
    assert client.post("/api/coach/talk/summary", json={"messages": [], "scenario": "free"}).status_code == 400


def test_speaking_exam_flow(client):
    data = client.get("/api/exam/list").json()
    assert len(data["types"]) == 8 and len(data["items"]) >= 24
    eid = "eval-classifiers"
    ex = client.get(f"/api/exam/{eid}").json()
    assert ex["cue"]["points"] and ex["part3"]
    f = client.post("/api/exam/followup", json={"exam_id": eid, "question": ex["part3"][0], "answer": "Because it is cheaper and faster for us"}).json()
    assert "followup" in f
    g = client.post("/api/exam/grade", json={"exam_id": eid, "answers": [
        {"part": 2, "question": ex["cue"]["prompt"], "answer": "This table compares four models for ticket classification."}]}).json()
    assert 4.0 <= g["overall"] <= 9.0
    assert client.get("/api/exam/list").json()["items"][[i["id"] for i in data["items"]].index(eid)]["last_band"] == g["overall"]
    assert client.post("/api/exam/generate", json={"type": "ai_flow"}).status_code == 400  # mock mode


def test_doc_qa(client):
    r = client.post("/api/docqa/read", data={"text": "Quarterly report: revenue grew 12% to $4.1M, churn fell from 5% to 3.8%. Next quarter we launch the AI assistant."}).json()
    assert r["notes_en"] and r["title"]
    files = {"file": ("notes.txt", b"Architecture: client -> API gateway -> services -> PostgreSQL. Cache with Redis for the catalog.", "text/plain")}
    assert client.post("/api/docqa/read", files=files).status_code == 200
    assert client.post("/api/docqa/read", data={"text": "short"}).status_code == 400
    body = {"title": r["title"], "notes": r["notes_en"], "messages": []}
    first = client.post("/api/docqa/talk", json=body).json()
    assert first["reply_en"]
    body["messages"] = [{"role": "coach", "content": first["reply_en"]}, {"role": "user", "content": "Revenue grew twelve percent."}]
    assert client.post("/api/docqa/talk", json=body).json()["reply_en"]
    assert client.post("/api/docqa/summary", json=body).json()["summary_vi"]


def test_writing_ielts_flow(client):
    data = client.get("/api/write/list").json()
    assert len(data["topics"]["quick"]) == 12 and len(data["topics"]["deep"]) == 12
    assert sum(i["mode"] == "quick" for i in data["items"]) >= 36 and sum(i["mode"] == "deep" for i in data["items"]) >= 24
    t = client.get("/api/write/task/d-hr-assistant").json()
    assert t["sections"] and t["key_points"]
    text = "\n\n".join(f"## {s['name']}\n{s['starter']} the HR assistant answers questions about leave and insurance with citations." for s in t["sections"])
    g = client.post("/api/write/grade", json={"task_id": t["id"], "text": text}).json()
    assert 4.0 <= g["overall"] <= 9.0 and g["attempt_id"]
    assert client.post("/api/write/grade", json={"task_id": t["id"], "text": "too short"}).status_code == 400
    hist = client.get("/api/write/history").json()
    assert hist[0]["task"] == "d-hr-assistant" and hist[0]["mode"] == "deep"
    a = client.get(f"/api/write/attempt/{hist[0]['id']}").json()
    assert a["text"] == text
    lst = client.get("/api/write/list").json()["items"]
    assert next(i for i in lst if i["id"] == "d-hr-assistant")["last_band"] == g["overall"]
    r = client.post("/api/write/chat", json={"task_id": "q-overfit-curves", "text": "", "messages": [{"role": "user", "content": "Đề này muốn gì?"}]}).json()
    assert r["reply"]
    assert client.post("/api/write/generate", json={"mode": "deep", "topic": "ai_agent"}).status_code == 400  # mock mode
    assert client.get("/api/write/task/nope").status_code == 404
