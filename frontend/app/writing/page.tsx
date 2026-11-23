"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, post } from "@/lib/api";
import Material, { Block } from "@/components/Material";
import Icon from "@/components/Icon";

type Mode = "quick" | "deep";
type Section = { name: string; hint_vi: string; starter: string };
type Task = {
  id: string; mode: Mode; topic: string; title: string; level?: string; context?: string; prompt: string; prompt_vi?: string;
  materials: Block[]; key_points?: string[]; sections?: Section[]; vocab?: string[]; words?: [number, number]; generated?: boolean;
};
type Item = { id: string; mode: Mode; topic: string; title: string; level: string; generated: boolean; last_band: number | null; best_band: number | null };
type ListData = { modes: Record<Mode, { name: string; words: [number, number] }>; topics: Record<Mode, { key: string; name: string }[]>; items: Item[] };
type Err = { original: string; correction: string; type: string; explanation_vi: string };
type ChatMsg = { role: "user" | "coach"; content: string };

const MODE_INFO: Record<Mode, { name: string; sub: string; desc: string; icon: string }> = {
  quick: { name: "Quick", sub: "giống Task 1 · 150-250 từ", desc: "Đọc bảng, biểu đồ, log hay sơ đồ rồi viết báo cáo ngắn: thiết kế mô hình, hệ thống, huấn luyện, kết quả đánh giá, sự cố…", icon: "pen" },
  deep: { name: "Deep", sub: "giống Task 2 · 400-800 từ", desc: "Viết tài liệu thiết kế từ một bản mô tả và các ý chính: ứng dụng, sản phẩm, agent, thuật toán, mô hình, đề xuất nghiên cứu…", icon: "layers" },
};
const CRIT: [string, string][] = [["task", "Task"], ["coherence", "Coherence"], ["lexical", "Lexical"], ["grammar", "Grammar"], ["technical", "Kỹ thuật"]];
const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const draftKey = (id: string) => `write-draft-${id}`;

function loadDraft(t: Task): { text: string; secs: Record<string, string> } {
  try { const d = JSON.parse(localStorage.getItem(draftKey(t.id)) || "null"); if (d) return { text: d.text || "", secs: d.secs || {} }; } catch { /* ignore */ }
  return { text: "", secs: {} };
}

/** Ghép các mục của bài Deep thành một văn bản có tiêu đề ## để chấm. */
function joinSections(t: Task, secs: Record<string, string>) {
  return (t.sections || []).filter((s) => (secs[s.name] || "").trim()).map((s) => `## ${s.name}\n${secs[s.name].trim()}`).join("\n\n");
}

/** Tô sáng các đoạn lỗi trong bài, bấm vào để xem cách sửa. */
function Marked({ text, errors, active, onPick }: { text: string; errors: Err[]; active: number | null; onPick: (i: number) => void }) {
  const spans: { s: number; e: number; i: number }[] = [];
  errors.forEach((er, i) => {
    const s = text.indexOf(er.original);
    if (s >= 0 && !spans.some((x) => s < x.e && s + er.original.length > x.s)) spans.push({ s, e: s + er.original.length, i });
  });
  spans.sort((a, b) => a.s - b.s);
  const out: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach((sp) => {
    if (sp.s > pos) out.push(text.slice(pos, sp.s));
    out.push(<mark key={sp.i} className={`err ${active === sp.i ? "on" : ""}`} onClick={() => onPick(sp.i)}>{text.slice(sp.s, sp.e)}<sup>{sp.i + 1}</sup></mark>);
    pos = sp.e;
  });
  out.push(text.slice(pos));
  return <div className="text marked">{out}</div>;
}

function Result({ r, text, task }: { r: any; text: string; task: Task }) {
  const [active, setActive] = useState<number | null>(null);
  const B = r.bands || {};
  const errors: Err[] = r.errors || [];
  return (
    <div>
      <div className="row" style={{ gap: 18, alignItems: "center" }}>
        <div className="band-big">{Number(r.overall).toFixed(1)}<span>Overall band</span></div>
        <div className="scores" style={{ flex: 1 }}>
          {CRIT.map(([k, n]) => <div key={k} className="score"><b>{B[k] == null ? "–" : Number(B[k]).toFixed(1)}</b><span>{k === "task" ? (task.mode === "deep" ? "Task Response" : "Task Achievement") : n}</span></div>)}
        </div>
      </div>
      <p className="muted small">Overall là trung bình 4 tiêu chí IELTS. Điểm kỹ thuật được chấm riêng. Bài dài {r.words} từ.</p>
      {r.mock && <p className="muted small">Đây là kết quả mẫu. Cần có key LLM để chấm thật.</p>}
      <p>{r.summary_vi}</p>
      {r.criteria_vi && <div className="crit-list">
        {CRIT.map(([k, n]) => r.criteria_vi[k] && <div key={k} className="stepline"><b>{n}:</b> {r.criteria_vi[k]}</div>)}
      </div>}
      {r.missing_points_vi?.length > 0 && <><div className="section-label">Còn thiếu</div><ul>{r.missing_points_vi.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul></>}
      <div className="section-label">Bài của bạn {errors.length > 0 && `· ${errors.length} chỗ nên sửa (bấm vào chỗ tô màu)`}</div>
      <Marked text={text} errors={errors} active={active} onPick={setActive} />
      {errors.length > 0 && <div className="err-list">
        {errors.map((e, i) => (
          <div key={i} className={`err-item ${active === i ? "on" : ""}`} onClick={() => setActive(i)}>
            <span className="err-n">{i + 1}</span>
            <div><s className="muted">{e.original}</s> → <span className="ok">{e.correction}</span> <span className="tag">{e.type}</span>
              <div className="muted small">{e.explanation_vi}</div></div>
          </div>
        ))}
      </div>}
      {r.section_feedback?.length > 0 && <><div className="section-label">Nhận xét từng mục</div>
        {r.section_feedback.map((s: any, i: number) => <div key={i} className="stepline" style={{ marginBottom: 6 }}><b>{s.section}:</b> {s.comment_vi}</div>)}</>}
      {r.model_answer && <><div className="section-label">Bài mẫu band 8</div><div className="example"><p className="text" style={{ fontSize: 15, margin: 0 }}>{r.model_answer}</p></div></>}
      {r.useful_phrases?.length > 0 && <><div className="section-label">Cụm nên dùng</div>
        <div>{r.useful_phrases.map((p: any) => <span key={p.en} className="tag primary">{p.en}{p.vi ? ` · ${p.vi}` : ""}</span>)}</div></>}
      {r.next_vi && <p><b>Gợi ý tiếp:</b> {r.next_vi}</p>}
    </div>
  );
}

function Chat({ task, text, grade }: { task: Task; text: string; grade: any }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, loading]);
  const quick = grade
    ? ["Vì sao điểm Task của tôi như vậy?", "Sửa giúp tôi đoạn mở đầu", "Làm sao để lên band tiếp theo?"]
    : ["Đề này muốn tôi viết gì?", "Gợi ý dàn ý cho tôi", "Cho tôi vài câu mở đầu"];
  async function send(t: string) {
    const q = t.trim(); if (!q || loading) return;
    const list: ChatMsg[] = [...msgs, { role: "user", content: q }];
    setMsgs(list); setInput(""); setLoading(true); setErr(null);
    try { const r = await post("/api/write/chat", { task_id: task.id, text, grade, messages: list }); setMsgs([...list, { role: "coach", content: r.reply }]); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  return (
    <div className="coach">
      <div className="chat" style={{ minHeight: 220 }}>
        {msgs.length === 0 && <div className="chat-empty"><h3>Hỏi Cô Mai về đề hoặc bài của bạn</h3>
          <p className="muted">Cô Mai đã đọc đề, tài liệu, bản nháp{grade ? " và kết quả chấm" : ""} của bạn. Hỏi bằng tiếng Việt hay tiếng Anh đều được.</p></div>}
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.role === "user" ? "me" : "ai"}`} style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>)}
        {loading && <div className="bubble ai muted">Cô Mai đang trả lời…</div>}
        <div ref={bottom} />
      </div>
      <div className="row" style={{ margin: "8px 0" }}>{quick.map((q) => <span key={q} className="chip" onClick={() => send(q)}>{q}</span>)}</div>
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Hỏi về đề, cách viết, hoặc điểm chấm…" style={{ flex: 1 }} />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}><Icon name="arrow" size={16} /></button>
      </div>
    </div>
  );
}

function Workspace({ task, initial, onBack }: { task: Task; initial?: { text: string; result: any }; onBack: () => void }) {
  const deep = task.mode === "deep";
  const [lo, hi] = task.words || (deep ? [400, 800] : [150, 250]);
  const [text, setText] = useState("");
  const [secs, setSecs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(initial?.result || null);
  const [graded, setGraded] = useState(initial?.text || "");
  const [pane, setPane] = useState<"write" | "result" | "chat">(initial ? "result" : "write");
  const [showVi, setShowVi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initial) {
      if (deep) {
        const parts: Record<string, string> = {};
        initial.text.split(/^## /m).filter(Boolean).forEach((p) => { const [h, ...rest] = p.split("\n"); parts[h.trim()] = rest.join("\n").trim(); });
        setSecs(parts);
      } else setText(initial.text);
    } else { const d = loadDraft(task); setText(d.text); setSecs(d.secs); }
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // tự lưu nháp
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(task.id), JSON.stringify({ text, secs })); setSaved(true); } catch { /* ignore */ }
    }, 600);
    setSaved(false);
    return () => clearTimeout(t);
  }, [text, secs, task.id]);

  const full = deep ? joinSections(task, secs) : text;
  const words = deep ? Object.values(secs).reduce((a, s) => a + countWords(s), 0) : countWords(text);
  const pct = Math.min(100, Math.round((words / hi) * 100));

  async function grade() {
    setLoading(true); setErr(null);
    try { const r = await post("/api/write/grade", { task_id: task.id, text: full }); setResult(r); setGraded(full); setPane("result"); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <button className="ghost" onClick={onBack}><Icon name="back" size={16} /> Danh sách đề</button>
        <span className="muted small">{MODE_INFO[task.mode].name} · {task.title}</span>
      </div>
      <div className="exam-split">
        <div className="card exam-doc">
          <div className="section-label" style={{ marginTop: 0 }}>{task.title} {task.level && <span className="tag">{task.level}</span>}</div>
          {task.context && <p className="muted" style={{ marginTop: 0 }}><i>{task.context}</i></p>}
          <p className="exam-question" style={{ fontSize: 16 }}>{task.prompt}</p>
          {task.prompt_vi && <p className="small"><a onClick={() => setShowVi(!showVi)} style={{ cursor: "pointer" }}>{showVi ? "Ẩn bản dịch" : "Xem đề tiếng Việt"}</a>{showVi && <span className="muted"> · {task.prompt_vi}</span>}</p>}
          <Material blocks={task.materials || []} />
          {task.key_points && task.key_points.length > 0 && <><div className="section-label">Ý chính cần triển khai</div><ul>{task.key_points.map((k, i) => <li key={i}>{k}</li>)}</ul></>}
          {task.vocab && task.vocab.length > 0 && <><div className="section-label">Từ nên dùng</div><div>{task.vocab.map((v) => <span key={v} className="tag primary">{v}</span>)}</div></>}
        </div>

        <div className="card">
          <div className="tabs" style={{ marginTop: 0 }}>
            <button className={pane === "write" ? "on" : ""} onClick={() => setPane("write")}>Bài viết</button>
            <button className={pane === "result" ? "on" : ""} onClick={() => setPane("result")} disabled={!result}>Kết quả {result && <span className="band-pill">{Number(result.overall).toFixed(1)}</span>}</button>
            <button className={pane === "chat" ? "on" : ""} onClick={() => setPane("chat")}>Hỏi Cô Mai</button>
          </div>

          {pane === "write" && <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className={words < lo ? "muted" : words > hi ? "error" : "ok"}><b>{words}</b> / {lo}-{hi} từ</span>
              <span className="muted small">{saved ? "Đã lưu nháp" : "…"}</span>
            </div>
            <div className="progress"><span style={{ width: `${pct}%` }} /></div>
            {deep ? (task.sections || []).map((s) => (
              <div key={s.name} className="wsec">
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <b>{s.name}</b><span className="muted small">{countWords(secs[s.name] || "")} từ</span>
                </div>
                <div className="muted small">{s.hint_vi}</div>
                <textarea value={secs[s.name] || ""} onChange={(e) => setSecs({ ...secs, [s.name]: e.target.value })} placeholder={`${s.starter}…`} style={{ minHeight: 90 }} />
                {!(secs[s.name] || "").trim() && <span className="chip" onClick={() => setSecs({ ...secs, [s.name]: s.starter + " " })}>Dùng câu mở đầu: {s.starter}</span>}
              </div>
            )) : <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Viết báo cáo của bạn ở đây…" style={{ minHeight: 340 }} />}
            {err && <p className="error">{err}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={grade} disabled={loading || words < 20}>{loading ? "Đang chấm…" : <><Icon name="check" size={16} /> Nộp và chấm</>}</button>
              {loading && <span className="muted">AI đang chấm bài, có thể mất 20-60 giây…</span>}
            </div>
          </>}
          {pane === "result" && result && <>
            <Result r={result} text={graded} task={task} />
            <div className="row" style={{ marginTop: 12 }}>
              <button onClick={() => setPane("write")}><Icon name="pen" size={16} /> Sửa bài và nộp lại</button>
              <button className="ghost" onClick={() => setPane("chat")}>Hỏi về kết quả</button>
            </div>
          </>}
          {pane === "chat" && <Chat task={task} text={full} grade={result} />}
        </div>
      </div>
    </div>
  );
}

export default function Writing() {
  const [data, setData] = useState<ListData | null>(null);
  const [mode, setMode] = useState<Mode>("quick");
  const [topic, setTopic] = useState("all");
  const [task, setTask] = useState<Task | null>(null);
  const [initial, setInitial] = useState<{ text: string; result: any } | undefined>();
  const [history, setHistory] = useState<any[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genDetail, setGenDetail] = useState("");
  const [loading, setLoading] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api("/api/write/list").then(setData).catch((e) => setErr(`Không tải được đề (${e.message}).`));
    api("/api/write/history").then(setHistory).catch(() => {});
  };
  useEffect(() => {
    load();
    try { const m = localStorage.getItem("write-mode") as Mode | null; if (m === "quick" || m === "deep") setMode(m); } catch { /* ignore */ }
  }, []);

  function chooseMode(m: Mode) { setMode(m); setTopic("all"); setGenTopic(""); try { localStorage.setItem("write-mode", m); } catch { /* ignore */ } }

  async function open(id: string, init?: { text: string; result: any }) {
    setErr(null);
    try { setTask(await api(`/api/write/task/${id}`)); setInitial(init); window.scrollTo(0, 0); } catch (e: any) { setErr(e.message); }
  }
  async function openAttempt(id: number) {
    try { const a = await api(`/api/write/attempt/${id}`); open(a.task, { text: a.text, result: a.result }); } catch (e: any) { setErr(e.message); }
  }
  async function generate() {
    const t = genTopic || data?.topics[mode][0].key;
    setLoading("AI đang soạn đề mới…"); setErr(null);
    try { const g = await post("/api/write/generate", { mode, topic: t, detail: genDetail }); load(); setTask(g); setInitial(undefined); }
    catch (e: any) { setErr(e.message); }
    setLoading("");
  }

  const topics = data?.topics[mode] || [];
  const topicName = useMemo(() => Object.fromEntries(topics.map((t) => [t.key, t.name])), [topics]);
  const items = (data?.items || []).filter((i) => i.mode === mode && (topic === "all" || i.topic === topic));
  const done = (data?.items || []).filter((i) => i.last_band != null);

  if (task) return (<><div className="eyebrow">Kỹ năng · Viết</div><Workspace task={task} initial={initial} onBack={() => { setTask(null); load(); }} /></>);

  return (
    <>
      <div className="eyebrow">Kỹ năng</div>
      <h1>Luyện viết</h1>
      <p className="lead">Viết như thi IELTS nhưng bằng tài liệu công việc thật. Chấm band 4.0-9.0, có bài mẫu, và Cô Mai trả lời mọi thắc mắc về đề hay điểm.</p>

      <div className="mode-cards">
        {(["quick", "deep"] as Mode[]).map((m) => (
          <button key={m} className={`mode-card ${mode === m ? "on" : ""}`} onClick={() => chooseMode(m)}>
            <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}><Icon name={MODE_INFO[m].icon} size={20} /><b>{MODE_INFO[m].name}</b><span className="muted small">{MODE_INFO[m].sub}</span></div>
            <p>{MODE_INFO[m].desc}</p>
            <span className="muted small">{(data?.items || []).filter((i) => i.mode === m).length} đề</span>
          </button>
        ))}
      </div>

      {err && <p className="error">{err}</p>}

      <div className="row" style={{ margin: "14px 0" }}>
        <span className={`chip ${topic === "all" ? "on" : ""}`} onClick={() => setTopic("all")}>Tất cả</span>
        {topics.map((t) => <span key={t.key} className={`chip ${topic === t.key ? "on" : ""}`} onClick={() => setTopic(t.key)}>{t.name}</span>)}
      </div>

      <div className="grid">
        {items.map((i) => (
          <div key={i.id} className="card exam-item" onClick={() => open(i.id)} style={{ margin: 0, cursor: "pointer" }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
              <span className="muted small">{topicName[i.topic] || i.topic}{i.generated ? " · AI" : ""}</span>
              {i.last_band != null ? <span className="band-pill">{i.last_band.toFixed(1)}</span> : <span className="tag">{i.level}</span>}
            </div>
            <b>{i.title}</b>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Tạo đề mới bằng AI</h2>
        <div className="row">
          <select value={genTopic || topics[0]?.key || ""} onChange={(e) => setGenTopic(e.target.value)}>
            {topics.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
          <input value={genDetail} onChange={(e) => setGenDetail(e.target.value)} placeholder="Chi tiết thêm (không bắt buộc), ví dụ: agent đặt lịch họp, mô hình dự báo giá cổ phiếu…" style={{ flex: 1, minWidth: 220 }} />
          <button onClick={generate} disabled={!!loading}><Icon name="plus" size={16} /> Tạo đề {MODE_INFO[mode].name}</button>
        </div>
        {loading && <p className="muted">{loading}</p>}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Bài đã chấm {history.length > 0 && <span className="muted small">({history.length} bài, {done.length} đề)</span>}</h2>
          {history.length > 0 && <button className="ghost" onClick={() => setShowHist(!showHist)}>{showHist ? "Thu gọn" : "Xem tất cả"}</button>}
        </div>
        {history.length === 0 ? <p className="muted">Chưa có bài nào. Chọn một đề ở trên để bắt đầu.</p> : (
          <table style={{ marginTop: 10 }}><thead><tr><th>Ngày</th><th>Đề</th><th>Chế độ</th><th>Số từ</th><th>Band</th></tr></thead>
            <tbody>{(showHist ? history : history.slice(0, 5)).map((h) => (
              <tr key={h.id} onClick={() => openAttempt(h.id)} style={{ cursor: "pointer" }}>
                <td className="muted">{new Date(h.created_at).toLocaleDateString("vi-VN")}</td><td>{h.title}</td>
                <td>{h.mode ? MODE_INFO[h.mode as Mode]?.name : ""}</td><td>{h.words}</td>
                <td>{h.overall != null && <span className="band-pill">{Number(h.overall).toFixed(1)}</span>}</td>
              </tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
