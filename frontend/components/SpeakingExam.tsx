"use client";
import { useEffect, useRef, useState } from "react";
import { api, post, speakSeq } from "@/lib/api";
import { startDictation } from "@/lib/dictation";
import Material, { Block } from "./Material";
import Icon from "./Icon";

type Exam = {
  id: string; type: string; title: string; level?: string; materials: Block[];
  part1: string[]; cue: { prompt: string; points: string[] }; part3: string[]; vocab?: string[];
};
type Step = { part: 1 | 2 | 3; question: string; followup?: boolean; answer: string };

const PART_NAME = { 1: "Phần 1 · Khởi động", 2: "Phần 2 · Trình bày", 3: "Phần 3 · Thảo luận" } as const;

function buildSteps(e: Exam, quick: boolean): Step[] {
  const cue = `${e.cue.prompt} You should say: ${e.cue.points.join("; ")}.`;
  const p2: Step = { part: 2, question: cue, answer: "" };
  if (quick) return [p2];
  return [...e.part1.map((q) => ({ part: 1 as const, question: q, answer: "" })), p2, ...e.part3.map((q) => ({ part: 3 as const, question: q, answer: "" }))];
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function SpeakingExam() {
  const [list, setList] = useState<{ types: any[]; items: any[] } | null>(null);
  const [filter, setFilter] = useState("all");
  const [exam, setExam] = useState<Exam | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [idx, setIdx] = useState(0);
  const [quick, setQuick] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [prep, setPrep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [genTopic, setGenTopic] = useState("");
  const rec = useRef<any>(null);

  const loadList = () => api("/api/exam/list").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { loadList(); }, []);
  useEffect(() => { // đồng hồ tham khảo, không giới hạn
    const t = setInterval(() => { setElapsed((x) => x + 1); setPrep((p) => (p > 0 ? p - 1 : 0)); }, 1000);
    return () => clearInterval(t);
  }, []);

  const step = steps[idx];
  useEffect(() => {
    if (!step) return;
    setElapsed(0);
    if (step.part === 2) setPrep(60);
    speakSeq([{ text: step.part === 2 ? "Now, I'd like you to describe the document. You have one minute to prepare. " + step.question : step.question, lang: "en-US" }]);
  }, [idx, step?.question]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(id: string) {
    setErr(null); setResult(null);
    try { const e: Exam = await api(`/api/exam/${id}`); setExam(e); setSteps(buildSteps(e, quick)); setIdx(0); setNotes(""); }
    catch (e: any) { setErr(e.message); }
  }

  async function generate(type: string) {
    setLoading("AI đang soạn đề mới (khoảng 20-40 giây)…"); setErr(null);
    try { const e = await post("/api/exam/generate", { type, topic: genTopic }); await loadList(); open(e.id); }
    catch (e: any) { setErr(e.message); }
    setLoading("");
  }

  function setAnswer(t: string) { setSteps((s) => s.map((x, i) => (i === idx ? { ...x, answer: t } : x))); }

  function mic() {
    if (listening) { rec.current?.stop(); return; }
    window.speechSynthesis?.cancel(); setPrep(0);
    const base = step.answer ? step.answer + " " : "";
    const r = startDictation((t) => setAnswer(base + t), () => setListening(false), "en-US");
    if (!r) { setErr("Trình duyệt không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge, hoặc gõ câu trả lời."); return; }
    rec.current = r; setListening(true);
  }

  async function next() {
    rec.current?.stop();
    const cur = steps[idx];
    if (cur.part === 3 && cur.answer.trim() && !cur.followup && exam) {
      setLoading("Giám khảo đang nghe…");
      try {
        const asked = steps.filter((s) => s.part === 3).map((s) => s.question);
        const r = await post("/api/exam/followup", { exam_id: exam.id, question: cur.question, answer: cur.answer, asked });
        if (r.followup) {
          const ns = [...steps]; ns.splice(idx + 1, 0, { part: 3, question: r.followup, followup: true, answer: "" });
          setSteps(ns); setLoading(""); setIdx(idx + 1); return;
        }
      } catch { /* bỏ qua, sang câu kế */ }
      setLoading("");
    }
    if (idx < steps.length - 1) setIdx(idx + 1); else finish();
  }

  async function finish() {
    if (!exam) return;
    rec.current?.stop(); window.speechSynthesis?.cancel();
    setLoading("Đang chấm bài theo band IELTS…"); setErr(null);
    try {
      setResult(await post("/api/exam/grade", { exam_id: exam.id, answers: steps.filter((s) => s.answer.trim()).map((s) => ({ part: s.part, question: s.question, answer: s.answer })) }));
      loadList();
    } catch (e: any) { setErr(e.message); }
    setLoading("");
  }

  // ---------- Danh sách đề ----------
  if (!exam) {
    const items = (list?.items || []).filter((i) => filter === "all" || i.type === filter);
    const typeName = (k: string) => list?.types.find((t) => t.key === k)?.name || k;
    return (
      <div>
        <div className="row" style={{ marginBottom: 12 }}>
          <span className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Tất cả</span>
          {list?.types.map((t) => <span key={t.key} className={`chip ${filter === t.key ? "on" : ""}`} onClick={() => setFilter(t.key)}>{t.name}</span>)}
        </div>
        <div className="row" style={{ marginBottom: 14 }}>
          <label><input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} /> Chế độ nhanh (chỉ Phần 2, ~3 phút)</label>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="grid">
          {items.map((i) => (
            <a key={i.id} href="#" className="card topic" onClick={(e) => { e.preventDefault(); open(i.id); }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="tag primary">{typeName(i.type)}</span>
                {i.last_band != null ? <span className="band-pill">{i.last_band.toFixed(1)}</span> : <span className="tag">{i.level}</span>}
              </div>
              <b style={{ display: "block", marginTop: 8 }}>{i.title}</b>
              {i.generated && <div className="muted small">Đề do AI sinh</div>}
            </a>
          ))}
        </div>
        <div className="card">
          <h2>Sinh đề mới bằng AI</h2>
          <div className="row">
            <input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="Chủ đề (tùy chọn), ví dụ: hệ thống đặt vé xem phim" style={{ flex: 1 }} />
            <button onClick={() => generate(filter === "all" ? list?.types[Math.floor(Math.random() * 8)].key : filter)} disabled={!!loading}>
              <Icon name="sparkle" size={16} /> Sinh đề {filter !== "all" ? `"${typeName(filter)}"` : "ngẫu nhiên"}</button>
          </div>
          {loading && <p className="muted">{loading}</p>}
        </div>
      </div>
    );
  }

  // ---------- Kết quả ----------
  if (result) {
    const B = result.bands || {};
    const crit: [string, string][] = [["fluency", "Fluency & Coherence"], ["lexical", "Lexical Resource"], ["grammar", "Grammar"], ["pronunciation", "Pronunciation"], ["document", "Hiểu tài liệu"]];
    return (
      <div>
        <button className="ghost" onClick={() => { setExam(null); setResult(null); }}><Icon name="back" size={16} /> Danh sách đề</button>
        <div className="card">
          <div className="row" style={{ gap: 18 }}>
            <div className="band-big">{Number(result.overall).toFixed(1)}<span>Overall band</span></div>
            <div className="scores" style={{ flex: 1 }}>
              {crit.map(([k, n]) => (
                <div key={k} className="score"><b>{B[k] == null ? "–" : Number(B[k]).toFixed(1)}</b><span>{n}</span></div>
              ))}
            </div>
          </div>
          {B.pronunciation == null && <p className="muted small">Pronunciation chưa chấm (cần Azure Speech key để chấm phát âm).</p>}
          <p>{result.summary_vi}</p>
          {result.per_question?.length > 0 && <>
            <div className="section-label">Từng câu</div>
            {result.per_question.map((q: any, i: number) => (
              <div key={i} className="stepline" style={{ marginBottom: 10 }}>
                <b>{q.question}</b>
                <div>{q.comment_vi}</div>
                {q.said && q.better && q.said !== q.better && <div><s className="muted">{q.said}</s> → <span className="ok">{q.better}</span></div>}
              </div>
            ))}
          </>}
          {result.model_answer_part2 && <>
            <div className="section-label">Bài mẫu Phần 2 (band 7+)</div>
            <div className="example"><div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
              <p className="text" style={{ fontSize: 15, margin: 0 }}>{result.model_answer_part2}</p>
              <button className="ghost icon" onClick={() => speakSeq([{ text: result.model_answer_part2, lang: "en-US", rate: 0.95 }])}><Icon name="volume" size={15} /></button>
            </div></div>
          </>}
          {result.useful_phrases?.length > 0 && <>
            <div className="section-label">Cụm nên dùng</div>
            <div>{result.useful_phrases.map((p: any) => <span key={p.en} className="tag primary">{p.en}{p.vi ? ` · ${p.vi}` : ""}</span>)}</div>
          </>}
          {result.next_vi && <p><b>Gợi ý tiếp:</b> {result.next_vi}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={() => open(exam.id)}>Làm lại đề này</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Làm bài ----------
  const parts = Array.from(new Set(steps.map((s) => s.part)));
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <button className="ghost" onClick={() => { rec.current?.stop(); window.speechSynthesis?.cancel(); setExam(null); }}><Icon name="back" size={16} /> Danh sách đề</button>
        <div className="row">{parts.map((p) => <span key={p} className={`chip ${step?.part === p ? "on" : ""}`}>{PART_NAME[p]}</span>)}</div>
      </div>
      <div className="exam-split">
        <div className="card exam-doc">
          <div className="section-label" style={{ marginTop: 0 }}>Tài liệu</div>
          <h3>{exam.title}</h3>
          <Material blocks={exam.materials} />
        </div>
        <div className="card exam-q">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted small">Câu {idx + 1}/{steps.length}{step?.followup ? " · câu hỏi thêm" : ""}</span>
            <span className="muted small">{prep > 0 && step?.part === 2 ? `Chuẩn bị: ${fmt(prep)}` : `⏱ ${fmt(elapsed)}`}</span>
          </div>
          {step?.part === 2 ? (
            <div className="cue">
              <b>{exam.cue.prompt}</b>
              <div className="muted small" style={{ margin: "6px 0 2px" }}>You should say:</div>
              <ul>{exam.cue.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú nhanh trong lúc chuẩn bị (không bắt buộc)…" style={{ minHeight: 60 }} />
            </div>
          ) : (
            <p className="exam-question">{step?.question}</p>
          )}
          <div className="row">
            <button className="ghost icon" title="Nghe lại câu hỏi" onClick={() => speakSeq([{ text: step.question, lang: "en-US" }])}><Icon name="volume" size={16} /></button>
            <button className="ghost icon" title="Nghe chậm" onClick={() => speakSeq([{ text: step.question, lang: "en-US", rate: 0.7 }])}><Icon name="turtle" size={16} /></button>
          </div>
          <div className="section-label">Câu trả lời của bạn</div>
          <textarea value={step?.answer || ""} onChange={(e) => setAnswer(e.target.value)} placeholder={listening ? "Đang nghe…" : "Bấm Ghi âm và nói, hoặc gõ câu trả lời"} style={{ minHeight: step?.part === 2 ? 150 : 100 }} />
          {err && <p className="error">{err}</p>}
          {loading && <p className="muted">{loading}</p>}
          <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
            <button className={listening ? "danger" : ""} onClick={mic} disabled={!!loading}>{listening ? "■ Dừng" : <><Icon name="mic" size={16} /> Ghi âm</>}</button>
            <span className="row">
              <button className="ghost" onClick={finish} disabled={!!loading || !steps.some((s) => s.answer.trim())}>Nộp bài</button>
              <button onClick={next} disabled={!!loading}>{idx < steps.length - 1 ? "Câu tiếp" : "Nộp bài"} <Icon name="arrow" size={16} /></button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
