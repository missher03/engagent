"use client";
import { useState } from "react";
import { api, post } from "@/lib/api";
import Recorder from "@/components/Recorder";
import Scores from "@/components/Scores";
import SpeakingCoach from "@/components/SpeakingCoach";

const TASKS = [
  {
    id: "S5", title: "Trình bày slide kết quả (90-120 giây)",
    prompt: 'Present this slide in 90-120 seconds. Slide: "Model Comparison for Ticket Classification". Fine-tuned BERT: F1 0.91, latency 85 ms · Gradient boosting: F1 0.86, latency 12 ms · Logistic regression (baseline): F1 0.78, latency 2 ms. Use 1 transition, 1 comparison, 1 hedging sentence and: outperform, baseline, trade-off, latency, accuracy.',
    hint: "Now let me move on to the results. This table compares three models... As you can see, BERT achieved the highest F1 score... However, its latency is much higher, so it may not be the best choice for real-time use.",
  },
  {
    id: "S7", title: "Stand-up 60 giây",
    prompt: "Give a 60-second stand-up update: what you did yesterday, what you will do today, and one blocker.",
    hint: "Yesterday I finished... Today I'm going to... One blocker is... so I need help from...",
  },
  {
    id: "S4", title: "Mô tả biểu đồ (60-90 giây)",
    prompt: "Describe a line chart: daily active users rose steadily from January to May, dropped sharply in June after a failed release, then recovered and peaked in October.",
    hint: "The chart shows... It increased steadily... then dropped sharply... After that, it recovered and peaked at...",
  },
];

export default function Speaking() {
  const [tab, setTab] = useState<"coach" | "tasks">("coach");
  const [task, setTask] = useState(TASKS[0]);
  const [pron, setPron] = useState<any>(null);
  const [transcript, setTranscript] = useState("");
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function onAudio(wav: Blob) {
    setLoading("Đang nhận dạng và chấm phát âm..."); setErr(null); setRes(null);
    const fd = new FormData();
    fd.append("reference_text", "");
    fd.append("audio", wav, "rec.wav");
    try {
      const p = await api("/api/pronunciation/assess", { method: "POST", body: fd });
      setPron(p);
      setTranscript(p.mock ? "" : p.recognized_text);
    } catch (e: any) { setErr(e.message); }
    setLoading("");
  }

  async function grade() {
    setLoading("Đang chấm bài nói..."); setErr(null);
    try {
      setRes(await post("/api/speaking/grade", {
        task: task.prompt, transcript,
        pron_data: pron ? { accuracy: pron.accuracy, fluency: pron.fluency, prosody: pron.prosody,
          mispronounced: pron.words.filter((w: any) => w.accuracy < 60).map((w: any) => w.word) } : {},
      }));
    } catch (e: any) { setErr(e.message); }
    setLoading("");
  }

  return (
    <>
      <div className="eyebrow">Kỹ năng</div>
      <h1>Luyện nói</h1>
      <div className="tabs">
        <button className={tab === "coach" ? "on" : ""} onClick={() => setTab("coach")}>Trợ lý nói</button>
        <button className={tab === "tasks" ? "on" : ""} onClick={() => setTab("tasks")}>Luyện theo đề</button>
      </div>
      {tab === "coach" ? <>
      <p className="lead">Nói ý của bạn bằng tiếng Việt. Trợ lý xác nhận lại ý, chỉ cách nói bằng tiếng Anh, giải thích vì sao, và trả lời bằng giọng nói.</p>
      <SpeakingCoach />
      </> : <>
      <p className="lead">Chọn đề, ghi âm câu trả lời và nhận nhận xét theo 4 tiêu chí.</p>
      <select value={task.id} onChange={(e) => { setTask(TASKS.find((t) => t.id === e.target.value)!); setRes(null); setPron(null); }}>
        {TASKS.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.title}</option>)}
      </select>
      <div className="card">
        <p>{task.prompt}</p>
        <details><summary className="muted">Cần gợi ý</summary><p>{task.hint}</p></details>
      </div>
      <div className="row"><Recorder onDone={onAudio} maxSeconds={30} /><span className="muted">Chấm phát âm Azure tối đa 30 giây/lần.</span></div>
      {pron && <Scores scores={{ "Chính xác": pron.accuracy, "Trôi chảy": pron.fluency, "Ngữ điệu": pron.prosody }} />}
      <p className="muted">Bản ghi chữ (sửa lại nếu nhận dạng sai, hoặc gõ nếu chưa có Azure key):</p>
      <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} style={{ minHeight: 100 }} />
      <button onClick={grade} disabled={!transcript.trim() || !!loading}>Chấm bài nói</button>
      {loading && <p className="muted">{loading}</p>}
      {err && <p className="error">{err}</p>}
      {res && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Trình độ: {res.overall_level}</h2>
          <Scores scores={res.scores} />
          <h2>3 điểm sửa</h2>
          <ul>{res.fixes?.map((f: any, i: number) => <li key={i}><s>{f.said}</s> → <span className="ok">{f.better}</span> <span className="muted">{f.why_vi}</span></li>)}</ul>
          <h2>Bài mẫu cao hơn 1 bậc</h2>
          <p className="text">{res.model_answer}</p>
          {res.drill_words?.length > 0 && <p>Luyện âm: {res.drill_words.map((w: string) => <span key={w} className="tag">{w}</span>)}</p>}
        </div>
      )}
      </>}
    </>
  );
}
