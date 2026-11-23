"use client";
import { useState } from "react";
import { api, post, speak } from "@/lib/api";

export default function Dictionary() {
  const [q, setQ] = useState("");
  const [context, setContext] = useState("");
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function lookup(term = q) {
    if (!term.trim()) return;
    setLoading(true); setErr(null); setAdded(false);
    try {
      setRes(await api(`/api/dictionary/lookup?q=${encodeURIComponent(term)}&context=${encodeURIComponent(context)}`));
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  async function add() {
    await post("/api/notebook", { term: res.term, context });
    setAdded(true);
  }

  return (
    <>
      <h1>Tra từ</h1>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="overfitting, Sharpe ratio, ablation study..." style={{ flex: 1 }} />
        <button onClick={() => lookup()} disabled={loading}>{loading ? "Đang tra..." : "Tra"}</button>
      </div>
      <input value={context} onChange={(e) => setContext(e.target.value)} style={{ width: "100%", marginTop: 8 }}
        placeholder="(Tuỳ chọn) dán câu chứa từ trong paper để nghĩa sát ngữ cảnh hơn" />
      {err && <p className="error">{err}</p>}
      {res && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            {res.term} <span className="muted">{res.ipa} {res.part_of_speech}</span>{" "}
            {res.cefr && <span className="tag">{res.cefr}</span>}
          </h2>
          <div className="row">
            {res.audio_url ? <audio controls src={res.audio_url} /> : <button className="ghost" onClick={() => speak(res.term)}>🔊 Nghe</button>}
            {res.in_notebook || added ? <span className="ok">✓ Đã có trong sổ từ</span> : <button onClick={add}>+ Thêm vào sổ từ</button>}
          </div>
          <p><b>Nghĩa:</b> {res.meaning_vi}</p>
          <p><b>English:</b> {res.definition_en}</p>
          {res.example && <p><b>Ví dụ:</b> <i>{res.example}</i></p>}
          {res.collocations?.length > 0 && <p><b>Collocation:</b> {res.collocations.join(" · ")}</p>}
          {res.related?.length > 0 && (
            <p className="muted">Liên quan: {res.related.map((r: string) => (
              <a key={r} href="#" onClick={(e) => { e.preventDefault(); setQ(r); lookup(r); }} style={{ marginRight: 8 }}>{r}</a>
            ))}</p>
          )}
        </div>
      )}
    </>
  );
}
