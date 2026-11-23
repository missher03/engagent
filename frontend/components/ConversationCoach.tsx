"use client";
import { useEffect, useRef, useState } from "react";
import { api, post, speakSeq } from "@/lib/api";
import { startDictation } from "@/lib/dictation";
import Icon from "./Icon";

type Fix = { said: string; better: string; why_vi: string };
type Help = { say_vi: string; english?: string | null; steps?: { en: string; vi: string }[] };
type Reply = { reply_en: string; reply_vi?: string; correction?: Fix | null; help?: Help | null; mock?: boolean };
type Msg = { role: "user" | "coach"; text: string; lang?: string; reply?: Reply; fix?: Fix | null };

type Props = {
  talkUrl?: string; summaryUrl?: string; extra?: Record<string, any>;
  hideScenario?: boolean; autoStart?: boolean; emptyTitle?: string; emptyText?: string;
};

export default function ConversationCoach({ talkUrl = "/api/coach/talk", summaryUrl = "/api/coach/talk/summary", extra = {},
  hideScenario = false, autoStart = false, emptyTitle, emptyText }: Props = {}) {
  const [scenarios, setScenarios] = useState<{ key: string; name: string }[]>([]);
  const [scenario, setScenario] = useState("free");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState<"" | "en-US" | "vi-VN">("");
  const [loading, setLoading] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [showVi, setShowVi] = useState<Record<number, boolean>>({});
  const [summary, setSummary] = useState<any>(null);
  const rec = useRef<any>(null);
  const heard = useRef("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!hideScenario) api("/api/coach/scenarios").then(setScenarios).catch(() => {}); }, [hideScenario]);
  useEffect(() => { if (autoStart) start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, loading, summary]);

  const started = msgs.length > 0;
  const payload = (list: Msg[]) => list.map((m) => ({ role: m.role, content: m.text }));

  function readAloud(r: Reply) {
    speakSeq([
      ...(r.help?.say_vi ? [{ text: r.help.say_vi, lang: "vi-VN" }] : []),
      ...(r.help?.english ? [{ text: r.help.english, lang: "en-US", rate: 0.9 }] : []),
      { text: r.reply_en, lang: "en-US" },
    ]);
  }

  async function ask(list: Msg[]) {
    setLoading("Cô Mai đang trả lời…"); setErr(null);
    try {
      const r: Reply = await post(talkUrl, { ...extra, messages: payload(list), scenario });
      // Lời sửa gắn vào câu vừa nói của người học
      const withFix = list.map((m, i) => (i === list.length - 1 && m.role === "user" ? { ...m, fix: r.correction || null } : m));
      setMsgs([...withFix, { role: "coach", text: r.reply_en, reply: r }]);
      if (autoSpeak) readAloud(r);
    } catch (e: any) { setErr(e.message); setMsgs(list); }
    setLoading("");
  }

  function start() { setSummary(null); setShowVi({}); setMsgs([]); ask([]); }

  function send(text: string, lang: string) {
    const t = text.trim();
    if (!t || loading) return;
    setInput("");
    ask([...msgs, { role: "user", text: t, lang }]);
  }

  function mic(lang: "en-US" | "vi-VN") {
    if (listening) { rec.current?.stop(); return; }
    window.speechSynthesis?.cancel();
    heard.current = ""; setErr(null);
    const r = startDictation((t) => { heard.current = t; setInput(t); }, () => {
      setListening("");
      if (heard.current.trim()) send(heard.current, lang);
    }, lang);
    if (!r) { setErr("Trình duyệt không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge, hoặc gõ chữ."); return; }
    rec.current = r; setListening(lang);
  }

  async function finish() {
    window.speechSynthesis?.cancel();
    setLoading("Đang tổng kết buổi nói…"); setErr(null);
    try { setSummary(await post(summaryUrl, { ...extra, messages: payload(msgs), scenario })); }
    catch (e: any) { setErr(e.message); }
    setLoading("");
  }

  const userTurns = msgs.filter((m) => m.role === "user").length;

  return (
    <div className="coach">
      <div className="row">
        {!hideScenario && <select value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={started && !summary}>
          {(scenarios.length ? scenarios : [{ key: "free", name: "Trò chuyện tự do" }]).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>}
        {(!started || summary) && <button onClick={start} disabled={!!loading}><Icon name="chat" size={16} /> {summary ? "Bắt đầu buổi mới" : "Bắt đầu trò chuyện"}</button>}
        {started && !summary && <button className="ghost" onClick={finish} disabled={!!loading || userTurns === 0}>Kết thúc và nhận xét</button>}
      </div>

      <div className="chat">
        {!started && !loading && (
          <div className="chat-empty">
            <div className="ic" style={{ ["--c" as any]: "var(--c2)", margin: "0 auto 10px" }}><Icon name="chat" size={22} /></div>
            <h3>{emptyTitle || "Trò chuyện bằng tiếng Anh với Cô Mai"}</h3>
            {emptyText ? <p className="muted">{emptyText}</p> : <p className="muted">Chọn tình huống rồi bấm Bắt đầu. Cô Mai sẽ hỏi, bạn trả lời bằng tiếng Anh (nút <b>Nói (EN)</b>).
              Khi bí, bấm <b>Bí rồi, nói tiếng Việt</b>: Cô Mai chỉ cách nói rồi bạn thử lại. Lỗi được sửa nhẹ ngay dưới câu của bạn, cuối buổi có tổng kết.</p>}
          </div>
        )}
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%" }}>
            <div className="bubble me" style={{ maxWidth: "100%" }}><span className="tag">{m.lang === "vi-VN" ? "VI" : "EN"}</span> {m.text}</div>
            {m.fix && (
              <div className="fix">
                <Icon name="pen" size={13} /> <s>{m.fix.said}</s> → <b>{m.fix.better}</b>
                <button className="ghost icon" onClick={() => speakSeq([{ text: m.fix!.better, lang: "en-US", rate: 0.9 }])}><Icon name="volume" size={13} /></button>
                <div className="muted small">{m.fix.why_vi}</div>
              </div>
            )}
          </div>
        ) : (
          <div key={i} className="bubble ai">
            {m.reply!.help && (
              <div className="help">
                <p style={{ margin: 0 }}>{m.reply!.help.say_vi}</p>
                {m.reply!.help.english && (
                  <div className="example" style={{ margin: "8px 0" }}>
                    <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                      <b>{m.reply!.help.english}</b>
                      <span className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                        <button className="ghost icon" onClick={() => speakSeq([{ text: m.reply!.help!.english!, lang: "en-US", rate: 0.9 }])}><Icon name="volume" size={15} /></button>
                        <button className="ghost icon" onClick={() => speakSeq([{ text: m.reply!.help!.english!, lang: "en-US", rate: 0.65 }])}><Icon name="turtle" size={15} /></button>
                      </span>
                    </div>
                  </div>
                )}
                {m.reply!.help.steps?.map((s, j) => <div key={j} className="stepline"><b>{s.en}</b> <span className="muted">{s.vi}</span></div>)}
              </div>
            )}
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
              <p style={{ margin: 0, fontSize: 16 }}>{m.reply!.reply_en}</p>
              <span className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                <button className="ghost icon" title="Nghe lại" onClick={() => speakSeq([{ text: m.reply!.reply_en, lang: "en-US" }])}><Icon name="volume" size={15} /></button>
                {m.reply!.reply_vi && <button className="ghost icon" title="Dịch" onClick={() => setShowVi((s) => ({ ...s, [i]: !s[i] }))}>VI</button>}
              </span>
            </div>
            {showVi[i] && <p className="muted" style={{ margin: "6px 0 0" }}>{m.reply!.reply_vi}</p>}
            {m.reply!.mock && <p className="muted small">Trả lời mẫu (chưa có key LLM).</p>}
          </div>
        ))}
        {loading && <div className="bubble ai muted">{loading}</div>}
        {summary && (
          <div className="card" style={{ margin: 0 }}>
            <h2>Tổng kết buổi nói {summary.level && <span className="tag primary">{summary.level}</span>}</h2>
            <p>{summary.summary_vi}</p>
            {summary.strengths?.length > 0 && <><div className="section-label">Làm tốt</div><ul>{summary.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>}
            {summary.fixes?.length > 0 && <><div className="section-label">Nên sửa</div>
              <ul>{summary.fixes.map((f: Fix, i: number) => <li key={i}><s>{f.said}</s> → <span className="ok">{f.better}</span> <span className="muted">{f.why_vi}</span></li>)}</ul></>}
            {summary.phrases?.length > 0 && <><div className="section-label">Cụm nên nhớ</div>
              <div>{summary.phrases.map((p: any) => <span key={p.en} className="tag primary">{p.en} · {p.vi}</span>)}</div></>}
            {summary.english_ratio_vi && <p className="muted">{summary.english_ratio_vi}</p>}
            {summary.next_vi && <p><b>Gợi ý tiếp:</b> {summary.next_vi}</p>}
          </div>
        )}
        <div ref={bottom} />
      </div>

      {err && <p className="error">{err}</p>}
      {started && !summary && (
        <div className="composer">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <button className={listening === "en-US" ? "danger" : ""} onClick={() => mic("en-US")} disabled={!!loading || listening === "vi-VN"}>
              {listening === "en-US" ? "■ Dừng" : <><Icon name="mic" size={16} /> Nói (EN)</>}</button>
            <button className={listening === "vi-VN" ? "danger" : "ghost"} onClick={() => mic("vi-VN")} disabled={!!loading || listening === "en-US"}>
              {listening === "vi-VN" ? "■ Dừng" : "Bí rồi, nói tiếng Việt"}</button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Đang nghe…" : "Hoặc gõ câu trả lời…"} style={{ flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && send(input, /[ăâđêôơư]/i.test(input) ? "vi-VN" : "en-US")} />
            <button onClick={() => send(input, /[ăâđêôơư]/i.test(input) ? "vi-VN" : "en-US")} disabled={!!loading || !input.trim()}><Icon name="arrow" size={16} /></button>
          </div>
          <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
            <label><input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} /> Tự đọc câu trả lời</label>
            <button className="ghost icon" onClick={() => window.speechSynthesis?.cancel()} title="Dừng đọc">■</button>
          </div>
        </div>
      )}
    </div>
  );
}
