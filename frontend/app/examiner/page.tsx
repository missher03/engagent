"use client";
import { useRef, useState } from "react";
import { post, speak } from "@/lib/api";
import { startDictation } from "@/lib/dictation";

type Turn = { role: "examiner" | "student"; content: string };

export default function Examiner() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [n, setN] = useState(5);
  const [voice, setVoice] = useState(true);
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<any>(null);

  async function ask(t: Turn[]) {
    setLoading(true); setErr(null);
    try {
      const r = await post("/api/examiner/next", { turns: t, n_questions: n });
      if (r.done) return finish(t);
      const next = [...t, { role: "examiner" as const, content: r.question }];
      setTurns(next);
      if (voice) speak(r.question, 0.95);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  async function finish(t: Turn[]) {
    setLoading(true);
    try { setFeedback(await post("/api/examiner/feedback", { turns: t, n_questions: n })); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  function send() {
    if (!answer.trim()) return;
    rec.current?.stop();
    const t = [...turns, { role: "student" as const, content: answer.trim() }];
    setTurns(t); setAnswer("");
    ask(t);
  }

  function mic() {
    if (listening) { rec.current?.stop(); return; }
    const r = startDictation((txt) => setAnswer(txt), () => setListening(false));
    if (!r) { setErr("Trình duyệt không hỗ trợ nhận dạng giọng nói, hãy gõ câu trả lời (Chrome/Edge có hỗ trợ)."); return; }
    rec.current = r; setListening(true);
  }

  return (
    <>
      <h1>Mô phỏng hội đồng bảo vệ</h1>
      <p className="muted">Giám khảo hỏi lần lượt về luận văn trong <a href="/profile">Hồ sơ</a>. Công thức trả lời ACE: Acknowledge → Core answer → Evidence.</p>
      {turns.length === 0 && !feedback && (
        <div className="row">
          <label>Số câu <input type="number" min={1} max={15} value={n} onChange={(e) => setN(+e.target.value)} style={{ width: 70 }} /></label>
          <label><input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Đọc câu hỏi thành tiếng</label>
          <button onClick={() => ask([])} disabled={loading}>Bắt đầu</button>
        </div>
      )}
      {turns.map((t, i) => (
        <div key={i} className="card" style={t.role === "student" ? { marginLeft: 40 } : {}}>
          <b>{t.role === "examiner" ? "Giám khảo" : "Bạn"}:</b> {t.content}
          {t.role === "examiner" && <button className="ghost" style={{ marginLeft: 8 }} onClick={() => speak(t.content, 0.9)}>🔊</button>}
        </div>
      ))}
      {turns.length > 0 && !feedback && turns[turns.length - 1].role === "examiner" && (
        <>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Trả lời bằng giọng nói (🎤) hoặc gõ..." style={{ minHeight: 90 }} />
          <div className="row">
            <button className={listening ? "danger" : "ghost"} onClick={mic}>{listening ? "■ Dừng" : "🎤 Nói"}</button>
            <button onClick={send} disabled={loading || !answer.trim()}>Gửi câu trả lời</button>
            <button className="ghost" onClick={() => finish(turns)} disabled={loading}>Kết thúc và nhận xét</button>
          </div>
        </>
      )}
      {loading && <p className="muted">Đang xử lý...</p>}
      {err && <p className="error">{err}</p>}
      {feedback && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Nhận xét</h2>
          {feedback.per_question?.map((q: any, i: number) => (
            <div key={i} className="card">
              <b>{q.question}</b> <span className="tag">{q.answer_quality}/5</span>
              <p className="ok">{q.what_was_good}</p>
              <p><b>Trả lời tốt hơn:</b> {q.better_answer}</p>
            </div>
          ))}
          {feedback.language_issues?.length > 0 && <><h2>Lỗi ngôn ngữ</h2><ul>{feedback.language_issues.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          <h2>3 cụm nên học</h2>
          <ul>{feedback.top_3_phrases_to_learn?.map((x: string) => <li key={x}>{x}</li>)}</ul>
          <button onClick={() => { setTurns([]); setFeedback(null); }}>Luyện lại</button>
        </div>
      )}
    </>
  );
}
