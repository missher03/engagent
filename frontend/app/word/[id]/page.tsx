"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api, post, speak } from "@/lib/api";
import { startDictation } from "@/lib/dictation";
import Recorder from "@/components/Recorder";
import Scores from "@/components/Scores";
import Icon from "@/components/Icon";

const cls = (a: number) => (a >= 80 ? "word-good" : a >= 60 ? "word-mid" : "word-bad");

function WordPage() {
  const { id } = useParams<{ id: string }>();
  const sub = useSearchParams().get("sub");
  const [w, setW] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [pron, setPron] = useState<any>(null);
  const [pronTarget, setPronTarget] = useState<"word" | "example">("word");
  const [sentence, setSentence] = useState("");
  const [check, setCheck] = useState<any>(null);
  const [spoken, setSpoken] = useState("");
  const [speakCheck, setSpeakCheck] = useState<any>(null);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState("");
  const rec = useRef<any>(null);

  useEffect(() => {
    setW(null); setErr(null); setPron(null); setCheck(null); setSpeakCheck(null); setSentence(""); setSpoken("");
    api(`/api/words/${id}`).then(setW).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { if (sub) api(`/api/words?subtopic=${sub}`).then(setSiblings); }, [sub]);

  if (err) return <p className="error">{err}</p>;
  if (!w) return <p>Đang tải (lần đầu sẽ sinh nội dung cho từ này)...</p>;

  const idx = siblings.findIndex((s) => s.id === w.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const refText = pronTarget === "word" ? w.term : w.example || w.term;

  async function onAudio(wav: Blob) {
    setLoading("pron");
    const fd = new FormData();
    fd.append("reference_text", refText);
    fd.append("audio", wav, "rec.wav");
    try { setPron(await api("/api/pronunciation/assess", { method: "POST", body: fd })); } catch (e: any) { setErr(e.message); }
    setLoading("");
  }
  async function submitSentence(text: string, mode: "writing" | "speaking") {
    setLoading(mode);
    try {
      const r = await post(`/api/words/${w.id}/sentence`, { sentence: text, mode });
      mode === "writing" ? setCheck(r) : setSpeakCheck(r);
    } catch (e: any) { setErr(e.message); }
    setLoading("");
  }
  async function addNotebook() { await post("/api/notebook", { term: w.term }); setW({ ...w, in_notebook: true }); }
  function mic() {
    if (listening) { rec.current?.stop(); return; }
    setSpeakCheck(null);
    const r = startDictation((t) => setSpoken(t), () => setListening(false));
    if (!r) { setErr("Trình duyệt không hỗ trợ nhận dạng giọng nói (hãy dùng Chrome hoặc Edge)."); return; }
    rec.current = r; setListening(true);
  }

  const Result = ({ r }: { r: any }) => (
    <div className="card">
      <p className={r.correct_usage ? "ok" : "error"}>{r.correct_usage ? "✓ Dùng từ đúng" : "✗ Chưa dùng đúng"} · {r.score}/5</p>
      <p>{r.feedback_vi}</p>
      {r.corrected && r.corrected !== sentence && <p><b>Sửa:</b> {r.corrected}</p>}
      {r.better && <p><b>Tự nhiên hơn (B2):</b> {r.better} <button className="ghost icon" onClick={() => speak(r.better)}><Icon name="volume" size={14} /></button></p>}
      {r.errors?.length > 0 && <ul>{r.errors.map((e: any, i: number) => <li key={i}><s>{e.original}</s> → {e.correction} <span className="muted">{e.explanation_vi}</span></li>)}</ul>}
    </div>
  );

  return (
    <>
      <div className="progress-top">
        {sub ? <Link href={`/words/${sub}`} className="back" style={{ margin: 0 }}><Icon name="back" size={16} /> Chủ đề</Link>
          : <Link href="/words" className="back" style={{ margin: 0 }}><Icon name="back" size={16} /> Kho từ</Link>}
        {idx >= 0 && <><div className="bar"><span style={{ width: `${(100 * (idx + 1)) / siblings.length}%` }} /></div>
          <span className="muted small">{idx + 1}/{siblings.length}</span></>}
      </div>
      <div className="card word-hero">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="term">{w.term}</p>
            <div className="ipa">{w.ipa} {w.stress && <>· trọng âm: <b>{w.stress}</b></>}
              {" "}{w.cefr && <span className="tag primary">{w.cefr}</span>}{w.part_of_speech && <span className="tag">{w.part_of_speech}</span>}</div>
          </div>
          {w.in_notebook ? <span className="tag primary"><Icon name="check" size={12} /> Trong sổ ôn tập</span>
            : <button onClick={addNotebook}><Icon name="plus" size={16} /> Thêm vào sổ</button>}
        </div>
        <div className="row">
          <button className="ghost" onClick={() => speak(w.term)}><Icon name="volume" size={16} /> Nghe</button>
          <button className="ghost" onClick={() => speak(w.term, 0.6)}><Icon name="turtle" size={16} /> Chậm</button>
        </div>
        <div className="section-label">Nghĩa</div>
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{w.meaning_vi || <span className="muted">Chưa có nội dung (cần key LLM).</span>}</p>
        {w.definition_en && <p className="muted" style={{ marginTop: 4 }}>{w.definition_en}</p>}
        {w.usage_vi && <><div className="section-label">Cách dùng</div><p style={{ margin: 0 }}>{w.usage_vi}</p></>}
        {w.collocations?.length > 0 && <><div className="section-label">Hay đi với</div><div>{w.collocations.map((c: string) => <span key={c} className="tag primary">{c}</span>)}</div></>}
        {w.example && (
          <>
            <div className="section-label">Ví dụ</div>
            <div className="example">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <i>{w.example}</i>
                <button className="ghost icon" onClick={() => speak(w.example)} title="Nghe"><Icon name="volume" size={16} /></button>
              </div>
              {w.example_vi && <div className="muted">{w.example_vi}</div>}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2><span className="step">1</span>Luyện phát âm</h2>
        <div className="row">
          <select value={pronTarget} onChange={(e) => { setPronTarget(e.target.value as any); setPron(null); }}>
            <option value="word">Đọc từ</option>
            {w.example && <option value="example">Đọc câu ví dụ</option>}
          </select>
          <button className="ghost" onClick={() => speak(refText, 0.85)}><Icon name="volume" size={16} /> Nghe mẫu</button>
          <Recorder onDone={onAudio} maxSeconds={15} />
          {loading === "pron" && <span className="muted">Đang chấm...</span>}
        </div>
        <p className="text">“{refText}”</p>
        {pron && (
          <>
            {pron.mock && <p className="muted">Điểm giả lập (chưa có Azure key).</p>}
            <Scores scores={{ "Tổng": pron.pron_score, "Chính xác": pron.accuracy, "Trôi chảy": pron.fluency }} />
            <p className="text">{pron.words.map((x: any, i: number) => <span key={i} className={cls(x.accuracy)} title={`${x.accuracy}`}>{x.word} </span>)}</p>
          </>
        )}
      </div>

      <div className="card">
        <h2><span className="step">2</span>Đặt câu với “{w.term}”</h2>
        <p className="muted">Viết 1 câu dùng từ này trong ngữ cảnh IT/AI/dữ liệu.</p>
        <textarea value={sentence} onChange={(e) => setSentence(e.target.value)} style={{ minHeight: 80, marginBottom: 10 }} placeholder="Ví dụ: We used ... to ..." />
        <button onClick={() => submitSentence(sentence, "writing")} disabled={loading === "writing" || sentence.trim().split(/\s+/).length < 3}>
          {loading === "writing" ? "Đang chấm..." : "Chấm câu"}</button>
        {check && <Result r={check} />}
      </div>

      <div className="card">
        <h2><span className="step">3</span>Luyện nói</h2>
        <p className="muted">Nói 1-2 câu có dùng “{w.term}”, ví dụ trả lời: “How is {w.term} relevant to your work?”</p>
        <div className="row">
          <button className={listening ? "danger" : ""} onClick={mic}>{listening ? "■ Dừng" : <><Icon name="mic" size={16} /> Nói</>}</button>
          <button className="ghost" disabled={!spoken.trim() || loading === "speaking"} onClick={() => submitSentence(spoken, "speaking")}>
            {loading === "speaking" ? "Đang chấm..." : "Chấm câu nói"}</button>
        </div>
        {spoken && <p className="text">“{spoken}”</p>}
        {speakCheck && <Result r={speakCheck} />}
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        {prev ? <Link href={`/word/${prev.id}?sub=${sub}`}><button className="ghost"><Icon name="back" size={16} /> {prev.term}</button></Link> : <span />}
        {next && <Link href={`/word/${next.id}?sub=${sub}`}><button>{next.term} <Icon name="arrow" size={16} /></button></Link>}
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<p>Đang tải...</p>}><WordPage /></Suspense>;
}
