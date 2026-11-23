"use client";
import { useEffect, useState } from "react";
import { api, post, speak } from "@/lib/api";

const LEVELS = ["", "Nhận biết", "Nhớ lại", "Dùng đúng", "Sản xuất"];

export default function Review() {
  const [items, setItems] = useState<any[] | null>(null);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<any>(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });

  useEffect(() => { api("/api/review/due").then(setItems); }, []);
  if (!items) return <p>Đang tải...</p>;
  if (items.length === 0) return <><h1>Ôn tập</h1><p>Hôm nay không còn thẻ nào. Thêm từ ở <a href="/words">Kho từ</a> hoặc <a href="/dictionary">Tra từ</a>.</p></>;
  if (i >= items.length) return <><h1>Xong!</h1><p>Đúng {score.ok}/{score.total}. Từ sai sẽ quay lại vào ngày mai.</p></>;

  const it = items[i];
  const q = it.question;

  async function submit(userAnswer: string) {
    const r = await post(`/api/review/${it.card_id}`, { question_type: q.type, answer: q.answer, user_answer: userAnswer });
    setResult(r);
    setScore((s) => ({ ok: s.ok + (r.correct ? 1 : 0), total: s.total + 1 }));
  }
  function next() { setI(i + 1); setAnswer(""); setResult(null); }

  return (
    <>
      <h1>Ôn tập <span className="muted">{i + 1}/{items.length}</span></h1>
      <div className="card">
        <span className="tag">Mức {it.level}: {LEVELS[it.level]}</span>
        <p className="text">{q.prompt}</p>
        {q.hint && <p className="muted">Gợi ý: {q.hint}</p>}
        {q.type === "cloze" && <button className="ghost" onClick={() => speak(q.prompt.replace("___", it.word.term))}>🔊 Nghe câu</button>}
        {q.options ? (
          <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            {q.options.map((o: string) => (
              <button key={o} className="ghost" disabled={!!result} onClick={() => submit(o)}
                style={result && o === q.answer ? { borderColor: "var(--ok)" } : {}}>{o}</button>
            ))}
          </div>
        ) : (
          <div className="row">
            {q.type === "produce"
              ? <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 70 }} />
              : <input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !result && submit(answer)} />}
            <button disabled={!!result || !answer} onClick={() => submit(answer)}>Kiểm tra</button>
          </div>
        )}
        {result && (
          <div>
            <p className={result.correct ? "ok" : "error"}>{result.correct ? "✓ Đúng" : `✗ Đáp án: ${result.expected}`}</p>
            <p className="muted"><b>{it.word.term}</b> {it.word.ipa} — {it.word.meaning_vi}</p>
            <button onClick={next}>Tiếp →</button>
          </div>
        )}
      </div>
    </>
  );
}
