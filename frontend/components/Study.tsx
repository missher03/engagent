"use client";
import { useEffect, useRef, useState } from "react";
import { api, post, speakSeq } from "@/lib/api";
import Icon from "./Icon";

type LessonMeta = { title: string; focus: string; key_points: string[]; ready: boolean; done: boolean; score: number | null };
type Course = { id: number; topic: string; title: string; level: string; goal: string; summary_vi: string; sources: { title: string; url: string }[]; lessons: LessonMeta[]; created_at: string };
type Lesson = {
  idx: number; course_id: number; course_title: string; level: string; title: string; focus: string; words: number;
  content: { sections: { heading: string; paragraphs: string[] }[]; glossary: { term: string; vi: string; definition: string }[]; takeaways_vi?: string[]; mock?: boolean };
  sources: { title: string; url: string }[]; done: boolean; score: number | null;
};
type Line = { speaker: string; text: string };
type Msg = { role: "user" | "coach"; content: string };

const LEVELS = ["B1", "B2", "C1"];
const GOALS: [string, string][] = [["overview", "Hiểu tổng quan"], ["deep", "Đi sâu kỹ thuật"], ["interview", "Chuẩn bị phỏng vấn"]];
const IDEAS = ["Apache Kafka", "Google Cloud Platform", "Kubernetes", "Vector database", "Retrieval-augmented generation", "Transformer architecture", "Docker", "MLOps", "Data lakehouse", "Reinforcement learning", "Microservices", "PostgreSQL indexing"];
const GOAL_NAME = Object.fromEntries(GOALS);

// ---------- Tra từ khi bấm vào chữ ----------
function useLookup() {
  const [pop, setPop] = useState<{ word: string; x: number; y: number; data?: any; err?: string } | null>(null);
  async function open(word: string, context: string, e: React.MouseEvent) {
    const w = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (w.length < 2) return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    setPop({ word: w, x: r.left + window.scrollX, y: r.bottom + window.scrollY + 6 });
    try { const d = await api(`/api/dictionary/lookup?lang=en&q=${encodeURIComponent(w)}&context=${encodeURIComponent(context.slice(0, 300))}`); setPop((p) => p && p.word === w ? { ...p, data: d } : p); }
    catch (er: any) { setPop((p) => p && p.word === w ? { ...p, err: er.message } : p); }
  }
  const node = pop && (
    <div className="lookup-pop" style={{ left: Math.min(pop.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 340), top: pop.y }} onClick={(e) => e.stopPropagation()}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <b>{pop.data?.term || pop.word}</b>
        <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <button className="ghost icon" onClick={() => speakSeq([{ text: pop.word, lang: "en-US", rate: 0.85 }])}><Icon name="volume" size={14} /></button>
          <button className="ghost icon" onClick={() => setPop(null)}>✕</button>
        </span>
      </div>
      {pop.err ? <p className="error small">{pop.err}</p> : !pop.data ? <p className="muted small">Đang tra…</p> : <>
        <div className="muted small">{pop.data.ipa} {pop.data.part_of_speech}</div>
        <p style={{ margin: "6px 0" }}>{pop.data.meaning_vi}</p>
        {pop.data.saved_to && <div className="ok small">Đã lưu vào kho: {pop.data.saved_to.name}</div>}
      </>}
    </div>
  );
  return { node, open, close: () => setPop(null) };
}

function Para({ text, onWord, onTranslate }: { text: string; onWord: (w: string, ctx: string, e: React.MouseEvent) => void; onTranslate: () => Promise<string> }) {
  const [vi, setVi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="para">
      <p>{text.split(/(\s+)/).map((t, i) => /\s/.test(t) ? t : <span key={i} className="w" onClick={(e) => { e.stopPropagation(); onWord(t, text, e); }}>{t}</span>)}</p>
      <div className="para-tools">
        <button className="ghost icon" title="Nghe đoạn này" onClick={() => speakSeq([{ text, lang: "en-US", rate: 0.95 }])}><Icon name="volume" size={14} /></button>
        <button className="ghost icon" title="Dịch đoạn này" disabled={busy} onClick={async () => { if (vi) { setVi(null); return; } setBusy(true); try { setVi(await onTranslate()); } catch (e: any) { setVi(e.message); } setBusy(false); }}>{busy ? "…" : "VI"}</button>
      </div>
      {vi && <p className="vi">{vi}</p>}
    </div>
  );
}

function Reading({ les, lookup }: { les: Lesson; lookup: ReturnType<typeof useLookup> }) {
  const tr = (text: string) => post("/api/study/translate", { text }).then((r: any) => r.vi as string);
  return (
    <div className="study-read">
      <p className="muted small">{les.words} từ · khoảng {Math.max(1, Math.round(les.words / 180))} phút đọc · bấm vào một từ để tra nghĩa và lưu vào kho từ</p>
      {les.content.mock && <p className="muted small">Đây là nội dung mẫu. Cần key LLM để AI viết bài thật.</p>}
      {les.content.sections.map((s, i) => (
        <section key={i}>
          <h3>{s.heading}</h3>
          {s.paragraphs.map((p, j) => <Para key={j} text={p} onWord={lookup.open} onTranslate={() => tr(p)} />)}
        </section>
      ))}
      {les.content.takeaways_vi && les.content.takeaways_vi.length > 0 && <><div className="section-label">Ý chính</div><ul>{les.content.takeaways_vi.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
      {les.content.glossary?.length > 0 && <>
        <div className="section-label">Thuật ngữ trong bài</div>
        <table><tbody>{les.content.glossary.map((g) => (
          <tr key={g.term}><td style={{ whiteSpace: "nowrap" }}><b>{g.term}</b> <button className="ghost icon" onClick={() => speakSeq([{ text: g.term, lang: "en-US", rate: 0.85 }])}><Icon name="volume" size={13} /></button></td>
            <td>{g.vi}</td><td className="muted">{g.definition}</td></tr>))}</tbody></table>
      </>}
      {les.sources.length > 0 && <><div className="section-label">Nguồn tham khảo</div>
        <ul className="small">{les.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul></>}
    </div>
  );
}

function Listening({ les }: { les: Lesson }) {
  const [fmt, setFmt] = useState<"podcast" | "lecture">("podcast");
  const [lines, setLines] = useState<Line[] | null>(null);
  const [cur, setCur] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(0.95);
  const [hide, setHide] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const token = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => () => { token.current++; window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { box.current?.querySelector(".line.on")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [cur]);

  async function load(f = fmt) {
    stop(); setLoading(true); setErr(null);
    try { const r = await post(`/api/study/courses/${les.course_id}/lessons/${les.idx}/listening`, { format: f }); setLines(r.lines); setCur(-1); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  async function play(from: number) {
    if (!lines) return;
    window.speechSynthesis?.cancel();
    const my = ++token.current; setPlaying(true);
    for (let i = from; i < lines.length; i++) {
      if (token.current !== my) return;
      setCur(i);
      await speakSeq([{ text: lines[i].text, lang: lines[i].speaker === "Alex" ? "en-US" : "en-GB", rate }]);
    }
    if (token.current === my) { setPlaying(false); setCur(-1); }
  }
  function stop() { token.current++; window.speechSynthesis?.cancel(); setPlaying(false); }

  if (!lines) return (
    <div className="card" style={{ margin: 0 }}>
      <h2 style={{ marginTop: 0 }}>Bài nghe</h2>
      <p className="muted">AI viết lại nội dung bài đọc thành dạng nói, câu ngắn hơn và tự nhiên hơn để luyện nghe. Giọng đọc là giọng của trình duyệt (Edge có giọng "Natural" nghe hay nhất).</p>
      <div className="row">
        {(["podcast", "lecture"] as const).map((f) => <span key={f} className={`chip ${fmt === f ? "on" : ""}`} onClick={() => setFmt(f)}>{f === "podcast" ? "Podcast 2 người" : "Bài giảng 1 người"}</span>)}
        <button onClick={() => load()} disabled={loading}><Icon name="headphones" size={16} /> {loading ? "Đang viết bài nghe…" : "Tạo bài nghe"}</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );

  return (
    <div>
      <div className="player">
        {playing ? <button className="danger" onClick={stop}>■ Dừng</button> : <button onClick={() => play(cur >= 0 ? cur : 0)}><Icon name="volume" size={16} /> {cur >= 0 ? "Nghe tiếp" : "Nghe từ đầu"}</button>}
        <select value={rate} onChange={(e) => setRate(+e.target.value)}>{[0.75, 0.85, 0.95, 1.05, 1.15].map((r) => <option key={r} value={r}>{r}x</option>)}</select>
        <label><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Ẩn chữ (luyện nghe)</label>
        <span className="muted small" style={{ marginLeft: "auto" }}>{cur >= 0 ? `Câu ${cur + 1}/${lines.length}` : `${lines.length} câu`}</span>
        <button className="ghost" onClick={() => { const f = fmt === "podcast" ? "lecture" : "podcast"; setFmt(f); setLines(null); load(f); }}>Đổi sang {fmt === "podcast" ? "bài giảng" : "podcast"}</button>
      </div>
      <div className="script" ref={box}>
        {lines.map((l, i) => (
          <div key={i} className={`line ${cur === i ? "on" : ""} ${l.speaker === "Alex" ? "a" : "b"}`} onClick={() => play(i)} title="Bấm để nghe từ câu này">
            <span className="spk">{l.speaker}</span>
            <span className={hide && cur !== i ? "blur" : ""}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Quiz({ les, onDone }: { les: Lesson; onDone: (score: number) => void }) {
  const [quiz, setQuiz] = useState<any>(null);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [open, setOpen] = useState("");
  const [graded, setGraded] = useState<any>(null);
  const [loading, setLoading] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const reported = useRef(false);
  useEffect(() => {
    setLoading("AI đang soạn câu hỏi…");
    post(`/api/study/courses/${les.course_id}/lessons/${les.idx}/quiz`, {}).then(setQuiz).catch((e) => setErr(e.message)).finally(() => setLoading(""));
  }, [les.course_id, les.idx]);
  const qs = quiz?.questions || [];
  const right = qs.filter((q: any, i: number) => picked[i] === q.answer).length;
  const finished = qs.length > 0 && Object.keys(picked).length === qs.length;
  useEffect(() => { if (finished && !reported.current) { reported.current = true; onDone(Math.round((right / qs.length) * 100) / 10); } }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  async function grade() {
    setLoading("Đang chấm…"); setErr(null);
    try { setGraded(await post(`/api/study/courses/${les.course_id}/lessons/${les.idx}/open`, { answer: open })); } catch (e: any) { setErr(e.message); }
    setLoading("");
  }
  if (!quiz) return <div className="card" style={{ margin: 0 }}>{loading ? <p className="muted">{loading}</p> : <p className="error">{err}</p>}</div>;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted">Đúng {right}/{qs.length}{finished && ` · điểm ${Math.round((right / qs.length) * 100) / 10}/10`}</span>
      </div>
      {qs.map((q: any, i: number) => (
        <div key={i} className="card quiz-q">
          <div><span className="tag">{q.type}</span> <b>{q.question}</b></div>
          <div className="quiz-opts">
            {q.options.map((o: string) => {
              const st = picked[i] ? (o === q.answer ? "right" : o === picked[i] ? "wrong" : "") : "";
              return <button key={o} className={`quiz-opt ${st}`} onClick={() => !picked[i] && setPicked({ ...picked, [i]: o })}>{o}</button>;
            })}
          </div>
          {picked[i] && <p className={picked[i] === q.answer ? "ok small" : "error small"} style={{ margin: "6px 0 0" }}>{picked[i] === q.answer ? "Đúng." : `Đáp án: ${q.answer}.`} <span className="muted">{q.explanation_vi}</span></p>}
        </div>
      ))}
      {quiz.open && <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>Câu tự luận</div>
        <p><b>{quiz.open.question}</b></p>
        <textarea value={open} onChange={(e) => setOpen(e.target.value)} placeholder="Trả lời bằng tiếng Anh, 3-5 câu…" style={{ minHeight: 110 }} />
        <div className="row"><button onClick={grade} disabled={!!loading || open.split(/\s+/).length < 5}>Chấm câu trả lời</button>{loading && <span className="muted">{loading}</span>}</div>
        {err && <p className="error">{err}</p>}
        {graded && <div style={{ marginTop: 10 }}>
          <div className="scores"><div className="score"><b>{graded.content_score}/10</b><span>Nội dung</span></div><div className="score"><b>{Number(graded.language_band).toFixed(1)}</b><span>Tiếng Anh (band)</span></div></div>
          <p>{graded.feedback_vi}</p>
          {graded.missing_vi?.length > 0 && <ul>{graded.missing_vi.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>}
          <div className="section-label">Câu trả lời đã sửa</div><div className="example"><p style={{ margin: 0 }}>{graded.corrected}</p></div>
          <details style={{ marginTop: 8 }}><summary className="muted">Xem câu trả lời mẫu</summary><p>{quiz.open.model_answer}</p></details>
        </div>}
      </div>}
    </div>
  );
}

function Chat({ les }: { les: Lesson }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, loading]);
  const ideas = ["Giải thích lại phần khó nhất bằng ví dụ đời thường", "So sánh với một công nghệ tương tự", "Câu hỏi phỏng vấn hay gặp về phần này?"];
  async function send(t: string) {
    const q = t.trim(); if (!q || loading) return;
    const list: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(list); setInput(""); setLoading(true); setErr(null);
    try { const r = await post(`/api/study/courses/${les.course_id}/lessons/${les.idx}/chat`, { messages: list }); setMsgs([...list, { role: "coach", content: r.reply }]); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  return (
    <div className="coach">
      <div className="chat" style={{ minHeight: 260 }}>
        {msgs.length === 0 && <div className="chat-empty"><h3>Hỏi lại về bài này</h3><p className="muted">Hỏi về kiến thức (ví dụ "partition khác gì shard?") hoặc về từ, câu trong bài. Tiếng Việt hay tiếng Anh đều được.</p></div>}
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.role === "user" ? "me" : "ai"}`} style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>)}
        {loading && <div className="bubble ai muted">Đang trả lời…</div>}
        <div ref={bottom} />
      </div>
      <div className="row" style={{ margin: "8px 0" }}>{ideas.map((q) => <span key={q} className="chip" onClick={() => send(q)}>{q}</span>)}</div>
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Hỏi bất cứ điều gì về bài…" style={{ flex: 1 }} />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}><Icon name="arrow" size={16} /></button>
      </div>
    </div>
  );
}

function LessonView({ course, idx, onBack, onOpen, onCourse }: { course: Course; idx: number; onBack: () => void; onOpen: (i: number) => void; onCourse: (c: Course) => void }) {
  const [les, setLes] = useState<Lesson | null>(null);
  const [pane, setPane] = useState<"read" | "listen" | "quiz" | "chat">("read");
  const [err, setErr] = useState<string | null>(null);
  const lookup = useLookup();
  function fetchLesson() {
    setLes(null); setErr(null);
    api(`/api/study/courses/${course.id}/lessons/${idx}`).then((l) => { setLes(l); if (!course.lessons[idx].ready && !l.content.mock) api(`/api/study/courses/${course.id}`).then(onCourse); })
      .catch((e) => setErr(e.message));
  }
  useEffect(() => { setPane("read"); window.scrollTo(0, 0); fetchLesson(); }, [course.id, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = () => lookup.close(); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }); // eslint-disable-line react-hooks/exhaustive-deps

  async function done(score?: number) {
    try { onCourse(await post(`/api/study/courses/${course.id}/lessons/${idx}/done`, { done: true, score: score ?? null })); } catch { /* ignore */ }
  }
  const meta = course.lessons[idx];
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <button className="ghost" onClick={onBack}><Icon name="back" size={16} /> {course.title}</button>
        <span className="muted small">Bài {idx + 1}/{course.lessons.length} · {course.level}</span>
      </div>
      <h2 style={{ margin: "0 0 4px" }}>{meta.title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{meta.focus}</p>
      <div className="tabs">
        {([["read", "Đọc"], ["listen", "Nghe"], ["quiz", "Câu hỏi"], ["chat", "Hỏi đáp"]] as const).map(([k, n]) =>
          <button key={k} className={pane === k ? "on" : ""} onClick={() => { window.speechSynthesis?.cancel(); setPane(k); }} disabled={!les}>{n}</button>)}
      </div>
      {!les && !err && <div className="card"><p className="muted">AI đang viết bài (khoảng {course.level === "C1" ? "1.000-1.200" : course.level === "B2" ? "800-1.000" : "600-800"} từ), có thể mất 30-90 giây…</p><div className="progress"><span className="indeterminate" /></div></div>}
      {err && <div className="card"><p className="error">{err}</p><button onClick={fetchLesson}>Thử lại</button></div>}
      {les && <div className="card">
        {pane === "read" && <Reading les={les} lookup={lookup} />}
        {pane === "listen" && <Listening les={les} />}
        {pane === "quiz" && <Quiz les={les} onDone={(s) => done(s)} />}
        {pane === "chat" && <Chat les={les} />}
      </div>}
      {lookup.node}
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <button className="ghost" disabled={idx === 0} onClick={() => onOpen(idx - 1)}><Icon name="back" size={16} /> Bài trước</button>
        {les && !meta.done && <button className="ghost" onClick={() => done()}><Icon name="check" size={16} /> Đánh dấu đã học</button>}
        {meta.done && <span className="ok">Đã học{meta.score != null && ` · ${meta.score}/10`}</span>}
        <button disabled={idx >= course.lessons.length - 1} onClick={() => onOpen(idx + 1)}>Bài tiếp <Icon name="arrow" size={16} /></button>
      </div>
    </div>
  );
}

function CourseView({ course, onBack, onOpen, onDelete }: { course: Course; onBack: () => void; onOpen: (i: number) => void; onDelete: () => void }) {
  const done = course.lessons.filter((l) => l.done).length;
  return (
    <div>
      <button className="ghost" onClick={onBack} style={{ marginBottom: 10 }}><Icon name="back" size={16} /> Thư viện</button>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{course.title}</h2>
          <span><span className="tag primary">{course.level}</span><span className="tag">{GOAL_NAME[course.goal] || course.goal}</span></span>
        </div>
        <p>{course.summary_vi}</p>
        <div className="progress"><span style={{ width: `${(done / course.lessons.length) * 100}%` }} /></div>
        <p className="muted small">Đã học {done}/{course.lessons.length} bài{course.sources.length > 0 ? ` · ${course.sources.length} nguồn: ${course.sources.map((s) => s.title).join(", ")}` : " · không có nguồn ngoài, AI dùng kiến thức sẵn có"}</p>
      </div>
      {course.lessons.map((l, i) => (
        <div key={i} className="card lesson-row" onClick={() => onOpen(i)}>
          <span className={`lesson-n ${l.done ? "done" : ""}`}>{l.done ? "✓" : i + 1}</span>
          <div style={{ flex: 1 }}>
            <b>{l.title}</b>
            <div className="muted small">{l.focus}</div>
            {l.key_points.length > 0 && <div className="small" style={{ marginTop: 4 }}>{l.key_points.map((k) => <span key={k} className="tag">{k}</span>)}</div>}
          </div>
          <span className="muted small" style={{ whiteSpace: "nowrap" }}>{l.score != null ? `${l.score}/10` : l.ready ? "Đã tạo" : "Chưa tạo"}</span>
        </div>
      ))}
      <button className="ghost" onClick={() => { if (window.confirm("Xóa khóa học này?")) onDelete(); }}>Xóa khóa học</button>
    </div>
  );
}

export default function Study() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("B2");
  const [goal, setGoal] = useState("overview");
  const [n, setN] = useState(5);
  const [urls, setUrls] = useState("");
  const [showUrls, setShowUrls] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api("/api/study/courses").then(setCourses).catch((e) => setErr(e.message));
  useEffect(() => {
    load(); api("/api/profile").then((p) => p?.level && setLevel(p.level)).catch(() => {});
    const h = (e: any) => setLevel(e.detail); window.addEventListener("level-change", h); return () => window.removeEventListener("level-change", h);
  }, []);

  async function create() {
    setLoading(true); setErr(null);
    try {
      const c = await post("/api/study/courses", { topic, level, goal, lessons: n, urls: urls.split(/\s+/).filter((u) => /^https?:\/\//.test(u)) });
      setCourse(c); setTopic(""); setUrls(""); load();
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  if (course && idx != null) return <LessonView course={course} idx={idx} onBack={() => { window.speechSynthesis?.cancel(); setIdx(null); load(); }} onOpen={setIdx} onCourse={setCourse} />;
  if (course) return <CourseView course={course} onBack={() => { setCourse(null); load(); }} onOpen={setIdx}
    onDelete={async () => { await api(`/api/study/courses/${course.id}`, { method: "DELETE" }); setCourse(null); load(); }} />;

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bạn muốn học gì?</h2>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && topic.trim() && !loading && create()} placeholder="Ví dụ: Apache Kafka, Google Cloud, vector database…" style={{ flex: 1, fontSize: 16 }} />
          <button className="big" onClick={create} disabled={loading || topic.trim().length < 2}><Icon name="sparkle" size={18} /> {loading ? "Đang tìm nguồn và lập dàn ý…" : "Tạo khóa học"}</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>{IDEAS.map((t) => <span key={t} className="chip" onClick={() => setTopic(t)}>{t}</span>)}</div>
        <div className="study-opts">
          <div><div className="section-label">Trình độ</div><div className="row">{LEVELS.map((l) => <span key={l} className={`chip ${level === l ? "on" : ""}`} onClick={() => setLevel(l)}>{l}</span>)}</div></div>
          <div><div className="section-label">Mục tiêu</div><div className="row">{GOALS.map(([k, v]) => <span key={k} className={`chip ${goal === k ? "on" : ""}`} onClick={() => setGoal(k)}>{v}</span>)}</div></div>
          <div><div className="section-label">Số bài</div><div className="row">{[4, 5, 6].map((x) => <span key={x} className={`chip ${n === x ? "on" : ""}`} onClick={() => setN(x)}>{x} bài</span>)}</div></div>
        </div>
        <p className="small" style={{ marginBottom: 0 }}><a style={{ cursor: "pointer" }} onClick={() => setShowUrls(!showUrls)}>{showUrls ? "Ẩn" : "+ Thêm link tài liệu"}</a> <span className="muted">(không bắt buộc) AI luôn đọc Wikipedia; thêm link tài liệu chính thức để bài chính xác hơn với chủ đề mới hoặc hẹp.</span></p>
        {showUrls && <textarea value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={"https://kafka.apache.org/documentation/\nhttps://cloud.google.com/docs/overview"} style={{ minHeight: 80, marginTop: 8 }} />}
        {loading && <p className="muted">AI đang đọc nguồn và lập dàn ý, khoảng 20-60 giây…</p>}
        {err && <p className="error">{err}</p>}
      </div>

      <h2>Thư viện của bạn</h2>
      {courses.length === 0 ? <p className="muted">Chưa có khóa nào. Gõ một chủ đề ở trên để bắt đầu.</p> : (
        <div className="grid">
          {courses.map((c) => { const d = c.lessons.filter((l) => l.done).length; return (
            <div key={c.id} className="card exam-item" style={{ margin: 0, cursor: "pointer" }} onClick={() => setCourse(c)}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <span className="muted small">{c.topic}</span><span className="tag primary">{c.level}</span>
              </div>
              <b>{c.title}</b>
              <div className="progress" style={{ marginBottom: 4 }}><span style={{ width: `${(d / c.lessons.length) * 100}%` }} /></div>
              <span className="muted small">{d}/{c.lessons.length} bài · {GOAL_NAME[c.goal]}</span>
            </div>); })}
        </div>
      )}
    </div>
  );
}
