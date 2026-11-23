"use client";
import { useEffect, useState } from "react";
import { api, speak, API_URL } from "@/lib/api";
import Recorder from "@/components/Recorder";
import Scores from "@/components/Scores";

const SAMPLES = [
  "The LSTM model outperformed the benchmark on a risk-adjusted basis.",
  "We used cross-validation to reduce the risk of overfitting.",
  "Volatility increased sharply during the second quarter of 2020.",
  "That's beyond the scope of this study, but it's an important direction for future work.",
];

const cls = (a: number) => (a >= 80 ? "word-good" : a >= 60 ? "word-mid" : "word-bad");

export default function Pronunciation() {
  const [text, setText] = useState(SAMPLES[0]);
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => { api("/api/pronunciation/history").then(setHistory).catch(() => {}); }, [res]);

  async function onAudio(wav: Blob) {
    setLoading(true); setErr(null);
    const fd = new FormData();
    fd.append("reference_text", text);
    fd.append("audio", wav, "rec.wav");
    try { setRes(await api("/api/pronunciation/assess", { method: "POST", body: fd })); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  return (
    <>
      <h1>Luyện phát âm</h1>
      <select onChange={(e) => setText(e.target.value)} style={{ width: "100%" }}>
        {SAMPLES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 70, marginTop: 8 }} />
      <div className="row">
        <button className="ghost" onClick={() => speak(text)}>🔊 Nghe mẫu</button>
        <button className="ghost" onClick={() => speak(text, 0.75)}>🐢 0.75x</button>
        <Recorder onDone={onAudio} />
        {loading && <span className="muted">Đang chấm...</span>}
      </div>
      {err && <p className="error">{err}</p>}
      {res && (
        <div className="card">
          {res.mock && <p className="muted">Điểm giả lập (chưa có AZURE_SPEECH_KEY).</p>}
          <Scores scores={{ "Tổng": res.pron_score, "Chính xác": res.accuracy, "Trôi chảy": res.fluency, "Đầy đủ": res.completeness, "Ngữ điệu": res.prosody }} />
          <p className="text">
            {res.words.map((w: any, i: number) => (
              <span key={i} className={w.error_type === "Omission" ? "word-bad" : cls(w.accuracy)} title={`${w.accuracy} ${w.error_type}`}>{w.word} </span>
            ))}
          </p>
          <p className="muted">Xanh ≥ 80 · Cam 60-79 · Đỏ &lt; 60. Rê chuột vào từ để xem điểm. Bấm từ đỏ để nghe lại.</p>
          {res.words.filter((w: any) => w.accuracy < 60).map((w: any) => (
            <button key={w.word} className="ghost" onClick={() => speak(w.word, 0.7)} style={{ marginRight: 6 }}>🔊 {w.word}</button>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <>
          <h2>Lịch sử</h2>
          <table><tbody>
            {history.slice(0, 10).map((h, i) => <tr key={i}><td>{h.score}</td><td className="muted">{h.task}</td></tr>)}
          </tbody></table>
        </>
      )}
    </>
  );
}
