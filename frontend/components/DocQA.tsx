"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import ConversationCoach from "./ConversationCoach";
import Icon from "./Icon";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/** Trích chữ từ PDF ngay trong trình duyệt (pdf.js), để backend không cần cài thêm thư viện. */
async function pdfText(file: File): Promise<string> {
  const w = window as any;
  if (!w.pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PDFJS; s.onload = () => resolve(); s.onerror = () => reject(new Error("Không tải được thư viện đọc PDF (cần mạng)."));
      document.head.appendChild(s);
    });
    w.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  const pdf = await w.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    pages.push(c.items.map((it: any) => it.str).join(" "));
  }
  return pages.join("\n\n");
}

type Doc = { title: string; doc_type?: string; notes_en: string; summary_vi: string; key_points_vi?: string[]; suggested_role?: string; mock?: boolean };

export default function DocQA() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [asker, setAsker] = useState("");
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function pick(f: File | null) {
    setFile(f); setErr(null); setDoc(null); setStarted(false);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function read() {
    setErr(null); setLoading("AI đang đọc tài liệu…");
    try {
      const fd = new FormData();
      if (file && file.name.toLowerCase().endsWith(".pdf")) {
        setLoading("Đang trích chữ từ PDF…");
        const t = await pdfText(file);
        if (t.trim().length < 40) throw new Error("PDF này không có chữ (có thể là bản scan). Hãy chụp ảnh trang cần hỏi và tải ảnh lên.");
        fd.append("text", t);
        setLoading("AI đang đọc tài liệu…");
      } else if (file) fd.append("file", file);
      else fd.append("text", text);
      const d: Doc = await api("/api/docqa/read", { method: "POST", body: fd });
      setDoc(d); setAsker(d.suggested_role || "your team lead");
    } catch (e: any) { setErr(e.message); }
    setLoading("");
  }

  if (doc && started) {
    return (
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <button className="ghost" onClick={() => setStarted(false)}><Icon name="back" size={16} /> Tài liệu</button>
          <span className="muted small">Người hỏi: {asker} · {doc.title}</span>
        </div>
        <div className="exam-split">
          <div className="card exam-doc">
            <div className="section-label" style={{ marginTop: 0 }}>{doc.title}</div>
            {preview ? <img src={preview} alt={doc.title} style={{ width: "100%", borderRadius: 10 }} /> : <p className="text" style={{ fontSize: 14 }}>{(file ? "" : text) || doc.notes_en}</p>}
          </div>
          <ConversationCoach talkUrl="/api/docqa/talk" summaryUrl="/api/docqa/summary" hideScenario autoStart
            extra={{ title: doc.title, notes: doc.notes_en, asker }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>1. Đưa tài liệu cho AI</h2>
        <p className="muted">Ảnh (sơ đồ, slide, dashboard, ảnh chụp màn hình), PDF, Word (.docx), hoặc file chữ (.txt, .md, .csv). Hoặc dán nội dung vào ô bên dưới.</p>
        <label className="drop">
          <input type="file" accept="image/png,image/jpeg,image/webp,.pdf,.docx,.txt,.md,.csv" onChange={(e) => pick(e.target.files?.[0] || null)} style={{ display: "none" }} />
          <Icon name="plus" size={20} />
          <span>{file ? file.name : "Bấm để chọn file"}</span>
        </label>
        {preview && <img src={preview} alt="" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, marginTop: 10 }} />}
        {!file && <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…hoặc dán nội dung báo cáo, bài viết, tài liệu vào đây" style={{ marginTop: 10, minHeight: 110 }} />}
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={read} disabled={!!loading || (!file && text.trim().length < 40)}><Icon name="search" size={16} /> Để AI đọc</button>
          {file && <button className="ghost" onClick={() => pick(null)}>Bỏ file</button>}
          {loading && <span className="muted">{loading}</span>}
        </div>
        {err && <p className="error">{err}</p>}
      </div>

      {doc && (
        <div className="card">
          <h2>2. AI đã hiểu tài liệu như sau</h2>
          <p><b>{doc.title}</b> {doc.doc_type && <span className="tag">{doc.doc_type}</span>}</p>
          <p>{doc.summary_vi}</p>
          {doc.key_points_vi && doc.key_points_vi.length > 0 && <ul>{doc.key_points_vi.map((k, i) => <li key={i}>{k}</li>)}</ul>}
          {doc.mock && <p className="muted small">Chế độ thử: cần key LLM để AI đọc thật.</p>}
          <p className="muted">Nếu AI hiểu sai, bạn có thể đọc lại bằng file khác hoặc dán thêm nội dung. Nếu đúng, chọn người sẽ hỏi bạn rồi bắt đầu.</p>
          <div className="row">
            <label style={{ flex: 1 }}>Người hỏi bạn (tiếng Anh)
              <input value={asker} onChange={(e) => setAsker(e.target.value)} placeholder="your team lead, a client, the CTO…" />
            </label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            {["your team lead", "a client", "the CTO", "a senior data scientist", "an interviewer"].map((r) => (
              <span key={r} className={`chip ${asker === r ? "on" : ""}`} onClick={() => setAsker(r)}>{r}</span>
            ))}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="big" onClick={() => setStarted(true)}><Icon name="chat" size={18} /> Bắt đầu hỏi đáp</button>
          </div>
        </div>
      )}
    </div>
  );
}
