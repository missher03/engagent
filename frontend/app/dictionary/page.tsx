"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, post, speak } from "@/lib/api";

export default function Dictionary() {
  const [q, setQ] = useState("");
  const [context, setContext] = useState("");
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [lang, setLang] = useState("auto");
  const [addedVi, setAddedVi] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<any[]>([]);
  const loadHistory = () => api("/api/dictionary/history?limit=16").then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  async function lookup(term = q, l = lang) {
    if (!term.trim()) return;
    setLoading(true); setErr(null); setAdded(false); setAddedVi({});
    try {
      setRes(await api(`/api/dictionary/lookup?q=${encodeURIComponent(term)}&lang=${l}&context=${encodeURIComponent(context)}`));
      loadHistory();
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  function lookupEn(term: string) { setQ(term); lookup(term, "en"); }
  async function addTerm(term: string) {
    await post("/api/notebook", { term, context });
    setAddedVi((a) => ({ ...a, [term]: true }));
  }

  async function add() {
    await post("/api/notebook", { term: res.term, context });
    setAdded(true);
  }

  return (
    <>
      <div className="eyebrow">Từ vựng</div>
      <h1>Tra từ</h1>
      <p className="lead">Tra từ tiếng Anh hoặc tiếng Việt, xem nghĩa theo ngữ cảnh IT/AI và thêm vào sổ ôn tập.</p>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="overfitting, API, pipeline... hoặc tiếng Việt: ý nghĩa, dữ liệu..." style={{ flex: 1 }} />
        <select value={lang} onChange={(e) => setLang(e.target.value)} title="Chiều tra">
          <option value="auto">Tự nhận diện</option>
          <option value="en">Anh → Việt</option>
          <option value="vi">Việt → Anh</option>
        </select>
        <button onClick={() => lookup()} disabled={loading}>{loading ? "Đang tra..." : "Tra"}</button>
      </div>
      <input value={context} onChange={(e) => setContext(e.target.value)} style={{ width: "100%", marginTop: 8 }}
        placeholder="(Tuỳ chọn) dán câu chứa từ trong paper để nghĩa sát ngữ cảnh hơn" />
      {err && <p className="error">{err}</p>}
      {!res && history.length > 0 && (
        <div className="card">
          <h2>Bạn đã tra gần đây</h2>
          <div>{history.map((h) => (
            <a key={h.id} href="#" className="tag primary" style={{ fontSize: 13, padding: "4px 12px" }}
              onClick={(e) => { e.preventDefault(); setQ(h.term); lookup(h.term, "en"); }} title={h.meaning_vi || ""}>{h.term}</a>
          ))}</div>
          <p className="muted" style={{ marginBottom: 0 }}>Mọi từ bạn tra đều được lưu và xếp vào chủ đề trong <Link href="/words">Kho từ</Link>.</p>
        </div>
      )}
      {res?.mode === "vi" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>“{res.query}” trong tiếng Anh</h2>
          {res.note_vi && <p className="muted">{res.note_vi}</p>}
          {res.candidates.map((c: any) => (
            <div key={c.term} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <a href="#" onClick={(e) => { e.preventDefault(); lookupEn(c.term); }}><b style={{ fontSize: 18 }}>{c.term}</b></a>{" "}
                  <span className="muted">{c.ipa} {c.part_of_speech}</span> {c.register && <span className="tag">{c.register}</span>}
                  {c.stress && <div className="muted small">trọng âm: {c.stress}</div>}
                </div>
                <div className="row">
                  <button className="ghost icon" onClick={() => speak(c.term)}>🔊</button>
                  {c.in_notebook || addedVi[c.term] ? <span className="ok small">✓ trong sổ</span>
                    : <button onClick={() => addTerm(c.term)}>+ Sổ từ</button>}
                </div>
              </div>
              <p>{c.nuance_vi}</p>
              {c.example && <p><i>{c.example}</i> <button className="ghost icon" onClick={() => speak(c.example)}>🔊</button><br />
                <span className="muted">{c.example_vi}</span></p>}
              {c.id && <a href={`/word/${c.id}`} className="small">Mở trang luyện từ này →</a>}
            </div>
          ))}
          {res.from_vocab?.length > 0 && (
            <>
              <h2>Trong kho từ của bạn</h2>
              {res.from_vocab.map((w: any) => (
                <p key={w.id}><a href={`/word/${w.id}`}><b>{w.term}</b></a> — {w.meaning_vi} {w.in_notebook && <span className="ok small">✓ sổ</span>}</p>
              ))}
            </>
          )}
        </div>
      )}
      {res && res.mode !== "vi" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            {res.term} <span className="muted">{res.ipa} {res.part_of_speech}</span>{res.stress && <span className="muted small"> · {res.stress}</span>}{" "}
            {res.cefr && <span className="tag">{res.cefr}</span>}
          </h2>
          <div className="row">
            {res.audio_url ? <audio controls src={res.audio_url} /> : <button className="ghost" onClick={() => speak(res.term)}>🔊 Nghe</button>}
            {res.in_notebook || added ? <span className="ok">✓ Đã có trong sổ từ</span> : <button onClick={add}>+ Thêm vào sổ từ</button>}
          </div>
          {res.saved_to && (
            <p className="notice" style={{ background: "var(--primary-soft)" }}>
              Đã lưu vào kho từ: <Link href={`/words/${res.saved_to.key}`}><b>{res.saved_to.category_name} › {res.saved_to.name}</b></Link>
              {res.lookup_count > 1 && <span className="muted"> · bạn đã tra từ này {res.lookup_count} lần</span>}
            </p>
          )}
          <p><b>Nghĩa:</b> {res.meaning_vi}</p>
          <p><b>English:</b> {res.definition_en}</p>
          {res.usage_vi && <p><b>Cách dùng:</b> {res.usage_vi}</p>}
          {res.example && <p><b>Ví dụ:</b> <i>{res.example}</i>{res.example_vi && <><br /><span className="muted">{res.example_vi}</span></>}</p>}
          {res.id && <p><a href={`/word/${res.id}`}>Mở trang luyện từ (phát âm, đặt câu, nói) →</a></p>}
          {res.collocations?.length > 0 && <p><b>Collocation:</b> {res.collocations.join(" · ")}</p>}
          {res.related?.length > 0 && (
            <p className="muted">Liên quan: {res.related.map((r: string) => (
              <a key={r} href="#" onClick={(e) => { e.preventDefault(); setQ(r); lookup(r, "en"); }} style={{ marginRight: 8 }}>{r}</a>
            ))}</p>
          )}
        </div>
      )}
    </>
  );
}
