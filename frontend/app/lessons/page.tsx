"use client";
import { useEffect, useState } from "react";
import { api, post, speak, audioSrc } from "@/lib/api";

export default function Lessons() {
  const [meta, setMeta] = useState<any>(null);
  const [topicId, setTopicId] = useState(9);
  const [level, setLevel] = useState("B1");
  const [format, setFormat] = useState("research abstract");
  const [list, setList] = useState<any[]>([]);
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showText, setShowText] = useState(true);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [cats, setCats] = useState<any[]>([]);
  const [subtopic, setSubtopic] = useState("");

  useEffect(() => { api("/api/topics").then(setMeta); api("/api/lessons").then(setList); api("/api/categories").then((d) => setCats(d.categories)); }, []);

  async function generate() {
    setLoading(true); setErr(null); setPicked({});
    try {
      const l = await post("/api/lessons/generate", { topic_id: topicId, level, format, subtopic: subtopic || null });
      setLesson(l);
      api("/api/lessons").then(setList);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  const src = audioSrc(lesson?.audio_path ? `/audio/${lesson.audio_path}` : null);

  return (
    <>
      <div className="eyebrow">Kỹ năng</div>
      <h1>Bài nghe / đọc từ từ vựng của bạn</h1>
      <p className="lead">Chọn chủ đề và dạng bài, app sẽ viết một bài đọc hoặc hội thoại có đúng các từ bạn đang học, kèm câu hỏi.</p>
      {meta && (
        <div className="row">
          <select value={subtopic} onChange={(e) => setSubtopic(e.target.value)}>
            <option value="">Từ theo chủ đề bài học ↓</option>
            {cats.map((c) => <optgroup key={c.key} label={c.name}>
              {c.subtopics.map((s: any) => <option key={s.key} value={s.key}>{s.name}</option>)}</optgroup>)}
          </select>
          <select value={topicId} onChange={(e) => setTopicId(+e.target.value)} disabled={!!subtopic}>
            {meta.topics.map((t: any) => <option key={t.id} value={t.id}>{t.id}. {t.name}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)}><option>B1</option><option>B2</option></select>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {meta.formats.map((f: string) => <option key={f}>{f}</option>)}
          </select>
          <button onClick={generate} disabled={loading}>{loading ? "Đang sinh bài (≈30s)..." : "Tạo bài"}</button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {lesson && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{lesson.title}</h2>
          <p className="muted">{lesson.topic} · {lesson.level} · {lesson.format}
            {lesson.qc_report && !lesson.qc_report.passed && ` · ⚠ kiểm tra chất lượng: ${lesson.qc_report.problems?.join("; ")}`}</p>
          <div className="row">
            {src ? <audio controls src={src} /> : <>
              <button className="ghost" onClick={() => speak(lesson.text)}>🔊 Nghe (giọng trình duyệt)</button>
              <button className="ghost" onClick={() => speak(lesson.text, 0.75)}>🐢 0.75x</button>
              <button className="ghost" onClick={() => window.speechSynthesis?.cancel()}>■</button></>}
            <label><input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} /> Hiện chữ</label>
          </div>
          <p className="muted">Từ trọng tâm: {lesson.target_words.map((w: string) => <span key={w} className="tag">{w}</span>)}</p>
          {showText && <p className="text">{lesson.text}</p>}
          <h2>Câu hỏi</h2>
          {lesson.questions.map((q: any, i: number) => (
            <div key={i} className="card">
              <span className="tag">{q.type}</span> {q.question}
              {q.options ? (
                <div className="row" style={{ marginTop: 6 }}>
                  {q.options.map((o: string) => (
                    <button key={o} className="ghost" onClick={() => setPicked({ ...picked, [i]: o })}
                      style={picked[i] === o ? { borderColor: o === q.answer ? "var(--ok)" : "var(--bad)" } : {}}>{o}</button>
                  ))}
                </div>
              ) : (
                <details><summary className="muted">Xem gợi ý đáp án</summary>{q.answer}</details>
              )}
              {picked[i] && <p className={picked[i] === q.answer ? "ok" : "error"}>{picked[i] === q.answer ? "✓" : `✗ ${q.answer}`} <span className="muted">{q.explanation_vi}</span></p>}
            </div>
          ))}
        </div>
      )}
      {list.length > 0 && (
        <>
          <h2>Bài đã tạo</h2>
          <table><tbody>
            {list.map((l) => (
              <tr key={l.id}><td><a href="#" onClick={async (e) => { e.preventDefault(); setLesson(await api(`/api/lessons/${l.id}`)); setPicked({}); }}>{l.title}</a></td>
                <td className="muted">{l.level} · {l.format}{l.has_audio && " · 🎧"}</td></tr>
            ))}
          </tbody></table>
        </>
      )}
    </>
  );
}
