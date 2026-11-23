"use client";
import { useEffect, useRef, useState } from "react";
import { post, speakSeq, hasVoice } from "@/lib/api";
import { startDictation } from "@/lib/dictation";
import Icon from "./Icon";

type Reply = {
  mode?: string; say_vi: string; understood_vi?: string | null; english?: string | null;
  steps?: { en: string; vi: string }[]; phrases?: { en: string; vi: string }[]; try_vi?: string | null; mock?: boolean;
};
type Msg = { role: "user" | "coach"; text: string; lang?: string; reply?: Reply };

const STARTERS = [
  "Tôi muốn nói rằng mô hình của chúng tôi chạy tốt trên dữ liệu kiểm thử nhưng còn chậm khi triển khai thật.",
  "Tôi nghĩ AI sẽ giúp lập trình viên làm việc nhanh hơn chứ không thay thế họ.",
  "Hôm qua tôi đã sửa lỗi đăng nhập và hôm nay tôi sẽ viết test cho phần thanh toán.",
];

// Nội dung gửi lại cho AI làm ngữ cảnh: chỉ phần chính của câu trả lời trước.
const asContext = (r: Reply) => [r.say_vi, r.english && `English: ${r.english}`].filter(Boolean).join("\n");

export default function SpeakingCoach() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [lang, setLang] = useState<"vi-VN" | "en-US">("vi-VN");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [viVoice, setViVoice] = useState(true);
  const rec = useRef<any>(null);
  const heard = useRef("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => { if (window.speechSynthesis?.getVoices().length) setViVoice(hasVoice("vi-VN")); };
    check();
    window.speechSynthesis?.addEventListener?.("voiceschanged", check);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", check);
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, loading]);

  function readAloud(r: Reply) {
    speakSeq([
      { text: r.say_vi, lang: "vi-VN" },
      ...(r.english ? [{ text: r.english, lang: "en-US", rate: 0.9 }] : []),
      ...(r.try_vi ? [{ text: r.try_vi, lang: "vi-VN" }] : []),
    ]);
  }

  async function send(text: string, l: string = lang) {
    const t = text.trim();
    if (!t || loading) return;
    const next: Msg[] = [...msgs, { role: "user", text: t, lang: l }];
    setMsgs(next); setInput(""); setErr(null); setLoading(true);
    try {
      const r: Reply = await post("/api/coach/chat", {
        messages: next.map((m) => ({ role: m.role, content: m.role === "coach" && m.reply ? asContext(m.reply) : m.text })),
      });
      setMsgs([...next, { role: "coach", text: r.say_vi, reply: r }]);
      if (autoSpeak) readAloud(r);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  function mic(l: "vi-VN" | "en-US" = lang) {
    if (listening) { rec.current?.stop(); return; }
    window.speechSynthesis?.cancel();
    setLang(l); heard.current = ""; setErr(null);
    const r = startDictation((t) => { heard.current = t; setInput(t); }, () => {
      setListening(false);
      if (heard.current.trim()) send(heard.current, l);
    }, l);
    if (!r) { setErr("Trình duyệt không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge, hoặc gõ chữ."); return; }
    rec.current = r; setListening(true);
  }

  return (
    <div className="coach">
      {!viVoice && <p className="notice">Máy chưa có giọng đọc tiếng Việt, nên phần tiếng Việt có thể đọc sai giọng. Dùng Microsoft Edge (có sẵn giọng Việt) hoặc cài thêm gói giọng "Tiếng Việt" trong Windows Settings › Time &amp; language › Speech.</p>}

      <div className="chat">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <div className="ic" style={{ ["--c" as any]: "var(--c5)", margin: "0 auto 10px" }}><Icon name="mic" size={22} /></div>
            <h3>Nói một ý bất kỳ bằng tiếng Việt</h3>
            <p className="muted">Cô Mai sẽ nhắc lại ý bạn để xác nhận, chỉ cách nói bằng tiếng Anh và giải thích vì sao. Bạn có thể hỏi lại "tại sao lại dùng từ này?", hoặc bấm nút nói tiếng Anh để tập nói lại.</p>
            <div className="stack">{STARTERS.map((s) => <button key={s} className="ghost starter" onClick={() => send(s, "vi-VN")}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="bubble me"><span className="tag">{m.lang === "en-US" ? "EN" : "VI"}</span> {m.text}</div>
        ) : (
          <div key={i} className="bubble ai">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
              <p style={{ margin: 0 }}>{m.reply!.say_vi}</p>
              <button className="ghost icon" title="Đọc lại" onClick={() => readAloud(m.reply!)}><Icon name="volume" size={16} /></button>
            </div>
            {m.reply!.understood_vi && <p className="understood"><Icon name="check" size={14} /> {m.reply!.understood_vi}</p>}
            {m.reply!.english && (
              <div className="example" style={{ margin: "10px 0" }}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <b style={{ fontSize: 16 }}>{m.reply!.english}</b>
                  <span className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                    <button className="ghost icon" title="Nghe" onClick={() => speakSeq([{ text: m.reply!.english!, lang: "en-US", rate: 0.9 }])}><Icon name="volume" size={16} /></button>
                    <button className="ghost icon" title="Nghe chậm" onClick={() => speakSeq([{ text: m.reply!.english!, lang: "en-US", rate: 0.65 }])}><Icon name="turtle" size={16} /></button>
                  </span>
                </div>
              </div>
            )}
            {m.reply!.steps && m.reply!.steps.length > 0 && (
              <div className="steps">
                {m.reply!.steps.map((s, j) => (
                  <div key={j} className="stepline">
                    <a href="#" onClick={(e) => { e.preventDefault(); speakSeq([{ text: s.en, lang: "en-US", rate: 0.9 }]); }}><b>{s.en}</b></a>
                    <span className="muted"> {s.vi}</span>
                  </div>
                ))}
              </div>
            )}
            {m.reply!.phrases && m.reply!.phrases.length > 0 && (
              <div style={{ marginTop: 8 }}>{m.reply!.phrases.map((p) => <span key={p.en} className="tag primary" title={p.vi}>{p.en} · {p.vi}</span>)}</div>
            )}
            {m.reply!.english && i === msgs.length - 1 && (
              <div className="row" style={{ marginTop: 10 }}>
                <button onClick={() => mic("en-US")} disabled={loading || listening}><Icon name="mic" size={16} /> Tập nói câu tiếng Anh này</button>
              </div>
            )}
            {m.reply!.mock && <p className="muted small">Trả lời mẫu (chưa có key LLM).</p>}
          </div>
        ))}
        {loading && <div className="bubble ai muted">Cô Mai đang nghĩ…</div>}
        <div ref={bottom} />
      </div>

      {err && <p className="error">{err}</p>}
      <div className="composer">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button className={listening && lang === "vi-VN" ? "danger" : ""} onClick={() => mic("vi-VN")} disabled={loading || (listening && lang !== "vi-VN")}
            title="Nói tiếng Việt">{listening && lang === "vi-VN" ? "■ Dừng" : <><Icon name="mic" size={16} /> Nói (VI)</>}</button>
          <button className={listening && lang === "en-US" ? "danger" : "ghost"} onClick={() => mic("en-US")} disabled={loading || (listening && lang !== "en-US")}
            title="Nói tiếng Anh">{listening && lang === "en-US" ? "■ Dừng" : <><Icon name="mic" size={16} /> EN</>}</button>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Đang nghe…" : "Hoặc gõ: một ý, một câu tiếng Anh, hay câu hỏi \"tại sao…?\""}
            onKeyDown={(e) => e.key === "Enter" && send(input, /[ăâđêôơư]/i.test(input) ? "vi-VN" : lang)} style={{ flex: 1 }} />
          <button onClick={() => send(input, /[ăâđêôơư]/i.test(input) ? "vi-VN" : lang)} disabled={loading || !input.trim()}><Icon name="arrow" size={16} /></button>
        </div>
        <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
          <label><input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} /> Tự đọc câu trả lời</label>
          <span className="row">
            <button className="ghost icon" onClick={() => window.speechSynthesis?.cancel()} title="Dừng đọc">■</button>
            {msgs.length > 0 && <button className="ghost" onClick={() => { window.speechSynthesis?.cancel(); setMsgs([]); }}>Cuộc trò chuyện mới</button>}
          </span>
        </div>
      </div>
    </div>
  );
}
