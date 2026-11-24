"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { speakSeq } from "@/lib/api";
import { startDictation } from "@/lib/dictation";
import Icon from "@/components/Icon";
import { GROUPS, PAIRS, PairGroup, Progress, SOUNDS, STRESS, Sound, WORDS, loadProgress, rate, record, weakest } from "@/lib/ipa";

const LANG = "en-GB"; // phiên âm theo giọng Anh-Anh; máy không có giọng Anh-Anh sẽ tự dùng giọng Anh-Mỹ
const say = (t: string, r = 0.85) => speakSeq([{ text: t, lang: LANG, rate: r }]);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);

// Tách phiên âm thành từng âm (ưu tiên ký hiệu dài như tʃ, eɪ, iː) để tô đúng âm đang học.
const SYMS = SOUNDS.map((s) => s.ipa).sort((a, b) => b.length - a.length);
function tokens(ipa: string) {
  const out: string[] = [];
  for (let i = 0; i < ipa.length;) {
    const m = SYMS.find((s) => ipa.startsWith(s, i));
    out.push(m || ipa[i]); i += m ? m.length : 1;
  }
  return out;
}
function IpaText({ ipa, mark }: { ipa: string; mark?: string }) {
  return <span className="ipa">/{tokens(ipa).map((t, i) => t === mark ? <b key={i}>{t}</b> : <span key={i}>{t}</span>)}/</span>;
}

/** Nghe người học đọc 1 từ bằng nhận dạng giọng nói của trình duyệt. */
function useListen() {
  const [on, setOn] = useState(false);
  const rec = useRef<any>(null);
  function listen(done: (heard: string) => void) {
    if (on) { rec.current?.stop(); return; }
    window.speechSynthesis?.cancel();
    let heard = "";
    const r = startDictation((t, final) => { heard = t; if (final && t) r?.stop(); }, () => { setOn(false); done(heard); });
    if (!r) { done("__unsupported__"); return; }
    rec.current = r; setOn(true);
    setTimeout(() => r.stop(), 5000);
  }
  return { on, listen };
}

const rateCls = (r: number | null) => (r == null ? "" : r >= 0.8 ? "good" : r >= 0.5 ? "mid" : "bad");
const pct = (r: number | null) => (r == null ? "" : `${Math.round(r * 100)}%`);

// ---------------- Bảng IPA ----------------
function SoundDetail({ s, prog, onProg, goPairs }: { s: Sound; prog: Progress; onProg: (p: Progress) => void; goPairs: (k: string) => void }) {
  const { on, listen } = useListen();
  const [res, setRes] = useState<Record<string, { ok: boolean; heard: string }>>({});
  const [active, setActive] = useState("");
  const related = PAIRS.filter((g) => g.a === s.ipa || g.b === s.ipa);
  useEffect(() => { setRes({}); }, [s.ipa]);
  function tryWord(word: string) {
    setActive(word);
    listen((heard) => {
      if (heard === "__unsupported__") { setRes((x) => ({ ...x, [word]: { ok: false, heard: "trình duyệt không hỗ trợ mic, hãy dùng Chrome/Edge" } })); return; }
      const ok = norm(heard).includes(word.toLowerCase());
      setRes((r) => ({ ...r, [word]: { ok, heard } }));
      if (heard) onProg(record(s.ipa, ok));
    });
  }
  const r = rate(prog, s.ipa);
  return (
    <div className="card exam-doc">
      <div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "nowrap" }}>
        <div className="ipa-big">/{s.ipa}/</div>
        <div>
          <span className="tag">{GROUPS.find((g) => g.key === s.group)!.name}</span>
          {s.voiced != null && <span className="tag">{s.voiced ? "Hữu thanh (dây thanh rung)" : "Vô thanh (chỉ có hơi)"}</span>}
          {r != null && <span className={`tag rate-${rateCls(r)}`}>Đúng {pct(r)} · {prog[s.ipa][1]} lần</span>}
        </div>
      </div>
      <div className="section-label">Cách phát âm</div><p style={{ marginTop: 0 }}>{s.how}</p>
      <div className="section-label">So với tiếng Việt</div><p style={{ marginTop: 0 }}>{s.vn}</p>
      <div className="section-label">Lỗi hay gặp</div><p style={{ marginTop: 0 }}>{s.mistake}</p>
      <div className="section-label">Từ ví dụ · bấm loa để nghe, bấm mic để đọc thử</div>
      <div className="ex-list">
        {s.ex.map((e) => {
          const [word, ipa] = e.split("|");
          const rr = res[word];
          return (
            <div key={word} className="ex-row">
              <b>{word}</b> <IpaText ipa={ipa} mark={s.ipa} />
              <span className="row" style={{ gap: 4, flexWrap: "nowrap", marginLeft: "auto" }}>
                {rr && <span className={rr.ok ? "ok small" : "error small"}>{rr.ok ? "Đúng" : rr.heard ? `Máy nghe: "${rr.heard}"` : "Không nghe rõ"}</span>}
                <button className="ghost icon" onClick={() => say(word)} title="Nghe"><Icon name="volume" size={15} /></button>
                <button className="ghost icon" onClick={() => say(word, 0.55)} title="Nghe chậm"><Icon name="turtle" size={15} /></button>
                <button className={`icon ${on && active === word ? "danger" : "ghost"}`} onClick={() => tryWord(word)} title="Đọc thử"><Icon name="mic" size={15} /></button>
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small">Giọng đọc của trình duyệt không phát được một âm đứng riêng, nên hãy nghe âm qua các từ ví dụ.</p>
      {related.length > 0 && <><div className="section-label">Luyện cặp âm dễ nhầm</div>
        <div className="row">{related.map((g) => <span key={g.key} className="chip" onClick={() => goPairs(g.key)}>{g.title}</span>)}</div></>}
    </div>
  );
}

function Chart({ prog, onProg, sel, setSel, goPairs }: { prog: Progress; onProg: (p: Progress) => void; sel: string; setSel: (s: string) => void; goPairs: (k: string) => void }) {
  const s = SOUNDS.find((x) => x.ipa === sel) || SOUNDS[0];
  return (
    <div className="exam-split">
      <div>
        {GROUPS.map((g) => (
          <div key={g.key} style={{ marginBottom: 14 }}>
            <div className="section-label" style={{ marginTop: 0 }}>{g.name} <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· {g.note}</span></div>
            <div className="ipa-grid">
              {SOUNDS.filter((x) => x.group === g.key).map((x) => {
                const r = rate(prog, x.ipa);
                return (
                  <button key={x.ipa} className={`ipa-tile ${sel === x.ipa ? "on" : ""} rate-${rateCls(r)}`} onClick={() => { setSel(x.ipa); say(x.ex[0].split("|")[0]); }}>
                    <span className="sym">{x.ipa}</span>
                    <span className="w">{x.ex[0].split("|")[0]}</span>
                    {r != null && <span className="r">{pct(r)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <SoundDetail s={s} prog={prog} onProg={onProg} goPairs={goPairs} />
    </div>
  );
}

// ---------------- Cặp âm dễ nhầm ----------------
function Drill({ g, mode, onProg, onExit }: { g: PairGroup; mode: "listen" | "speak"; onProg: (p: Progress) => void; onExit: () => void }) {
  const TOTAL = 10;
  const next = () => { const pair = pick(g.pairs); return { pair, idx: Math.random() < 0.5 ? 0 : 1 }; };
  const [q, setQ] = useState(next);
  const [n, setN] = useState(1);
  const [score, setScore] = useState(0);
  const [ans, setAns] = useState<{ ok: boolean; text: string } | null>(null);
  const { on, listen } = useListen();
  const target = q.pair[q.idx], other = q.pair[1 - q.idx];
  const sound = q.idx === 0 ? g.a : g.b;

  useEffect(() => { if (mode === "listen") say(target); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function mark(ok: boolean, text: string) {
    setAns({ ok, text }); if (ok) setScore((x) => x + 1);
    record(`pair:${g.key}`, ok); onProg(record(sound, ok));
  }
  function choose(i: number) { if (!ans) mark(i === q.idx, i === q.idx ? "Chính xác!" : `Máy đọc "${target}", không phải "${q.pair[i]}".`); }
  function speakIt() {
    listen((heard) => {
      if (heard === "__unsupported__") { setAns({ ok: false, text: "Trình duyệt không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge." }); return; }
      if (!heard) { setAns({ ok: false, text: "Không nghe rõ, hãy bấm mic và đọc lại." }); return; }
      const w = norm(heard);
      if (w.includes(target.toLowerCase())) mark(true, `Máy nghe đúng: "${heard}".`);
      else mark(false, w.includes(other.toLowerCase()) ? `Máy nghe thành "${other}". Xem lại mẹo bên trên rồi thử lại.` : `Máy nghe: "${heard}".`);
    });
  }
  function go() { if (n >= TOTAL) { setN(TOTAL + 1); return; } setQ(next()); setN((x) => x + 1); setAns(null); }

  if (n > TOTAL) return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="band-big">{score}/{TOTAL}<span>{g.title}</span></div>
      <p>{score >= 8 ? "Rất tốt! Bạn phân biệt được cặp âm này." : score >= 5 ? "Khá ổn, luyện thêm một lượt nữa nhé." : "Cặp âm này còn khó với bạn. Nghe kỹ từng cặp ở danh sách bên dưới rồi thử lại."}</p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button onClick={() => { setN(1); setScore(0); setAns(null); setQ(next()); }}>Làm lại</button>
        <button className="ghost" onClick={onExit}>Xong</button>
      </div>
    </div>
  );

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted">{mode === "listen" ? "Nghe và chọn" : "Nói"} · Câu {n}/{TOTAL} · Đúng {score}</span>
        <button className="ghost" onClick={onExit}>Dừng</button>
      </div>
      <div className="progress"><span style={{ width: `${(n - 1) * 10}%` }} /></div>
      {mode === "listen" ? (<>
        <p style={{ textAlign: "center" }}>Bạn nghe thấy từ nào?</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="ghost" onClick={() => say(target)}><Icon name="volume" size={16} /> Nghe lại</button>
          <button className="ghost" onClick={() => say(target, 0.55)}><Icon name="turtle" size={16} /> Chậm</button>
        </div>
        <div className="pair-choices">
          {q.pair.map((w, i) => <button key={w} className={`pair-btn ${ans ? (i === q.idx ? "right" : "wrong") : ""}`} onClick={() => choose(i)}>{w}</button>)}
        </div>
      </>) : (<>
        <p style={{ textAlign: "center" }}>Đọc to từ này (cẩn thận đừng để máy nghe thành <i>{other}</i>):</p>
        <div className="say-word">{target}</div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="ghost" onClick={() => say(target)}><Icon name="volume" size={16} /> Nghe mẫu</button>
          <button className={on ? "danger" : ""} onClick={speakIt}>{on ? "■ Dừng" : <><Icon name="mic" size={16} /> Bấm rồi đọc</>}</button>
        </div>
      </>)}
      {ans && <p className={ans.ok ? "ok" : "error"} style={{ textAlign: "center" }}>{ans.text}</p>}
      {ans && <div className="row" style={{ justifyContent: "center" }}>
        {mode === "speak" && !ans.ok && <button className="ghost" onClick={() => setAns(null)}>Thử lại</button>}
        <button onClick={go}>{n >= TOTAL ? "Xem kết quả" : "Câu tiếp"} <Icon name="arrow" size={16} /></button>
      </div>}
    </div>
  );
}

function Pairs({ prog, onProg, sel, setSel }: { prog: Progress; onProg: (p: Progress) => void; sel: string; setSel: (k: string) => void }) {
  const g = PAIRS.find((x) => x.key === sel) || PAIRS[0];
  const [mode, setMode] = useState<"" | "listen" | "speak">("");
  useEffect(() => setMode(""), [sel]);
  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        {PAIRS.map((x) => { const r = rate(prog, `pair:${x.key}`); return (
          <span key={x.key} className={`chip ${sel === x.key ? "on" : ""}`} onClick={() => setSel(x.key)}>{x.title}{r != null && <span className={`rate-txt-${rateCls(r)}`}> · {pct(r)}</span>}</span>); })}
      </div>
      <div className="exam-split">
        <div className="card exam-doc">
          <h2 style={{ marginTop: 0 }}>{g.title}</h2>
          <p>{g.tip}</p>
          <div className="row" style={{ gap: 6 }}>
            {[g.a, g.b].filter((v, i, a) => a.indexOf(v) === i).map((x) => <span key={x} className="tag">/{x}/: {SOUNDS.find((s) => s.ipa === x)!.vn}</span>)}
          </div>
          <div className="section-label">Các cặp từ · bấm để nghe</div>
          {g.pairs.map(([a, b]) => (
            <div key={a} className="ex-row">
              <button className="ghost" onClick={() => say(a)}><Icon name="volume" size={14} /> {a}</button>
              <span className="muted">và</span>
              <button className="ghost" onClick={() => say(b)}><Icon name="volume" size={14} /> {b}</button>
              <button className="ghost icon" style={{ marginLeft: "auto" }} title="Nghe cả cặp" onClick={() => speakSeq([{ text: a, lang: LANG, rate: 0.8 }, { text: b, lang: LANG, rate: 0.8 }])}><Icon name="repeat" size={15} /></button>
            </div>
          ))}
        </div>
        <div>
          {!mode ? (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Chọn bài luyện</h2>
              <div className="mode-cards">
                <button className="mode-card" onClick={() => setMode("listen")}>
                  <div className="row" style={{ gap: 8 }}><Icon name="headphones" size={18} /><b>Nghe và chọn</b></div>
                  <p>Máy đọc một trong hai từ, bạn chọn từ đúng. 10 câu.</p>
                </button>
                <button className="mode-card" onClick={() => setMode("speak")}>
                  <div className="row" style={{ gap: 8 }}><Icon name="mic" size={18} /><b>Nói</b></div>
                  <p>Bạn đọc từ được giao, máy nhận giọng xem có nghe đúng từ đó không. 10 câu.</p>
                </button>
              </div>
              <p className="muted small" style={{ marginTop: 12 }}>Phần Nói dùng nhận dạng giọng nói của Chrome hoặc Edge, không cần key Azure. Máy đôi khi nghe nhầm cả với người bản xứ, nên hãy xem kết quả là tham khảo.</p>
            </div>
          ) : <Drill key={g.key + mode} g={g} mode={mode} onProg={onProg} onExit={() => setMode("")} />}
        </div>
      </div>
    </div>
  );
}

// ---------------- Phiên âm ----------------
function Transcribe() {
  const [q, setQ] = useState(() => pick(WORDS));
  const [input, setInput] = useState("");
  const [ans, setAns] = useState<boolean | null>(null);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  function check() {
    if (ans != null || !input.trim()) return;
    const ok = input.trim().toLowerCase() === q.word.toLowerCase();
    setAns(ok); setScore(([r, t]) => [r + (ok ? 1 : 0), t + 1]); say(q.word);
  }
  function next() { let w = pick(WORDS); while (w.word === q.word) w = pick(WORDS); setQ(w); setInput(""); setAns(null); }
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Đọc phiên âm, gõ ra từ</h2>
        <span className="muted">Đúng {score[0]}/{score[1]}</span>
      </div>
      <p className="muted">Nhìn phiên âm IPA, đoán từ tiếng Anh (từ IT thông dụng) rồi gõ vào. Dấu ˈ đứng trước âm tiết được nhấn.</p>
      <div className="say-word"><IpaText ipa={q.ipa} /></div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (ans == null ? check() : next())} placeholder="Gõ từ…" style={{ flex: 1 }} autoFocus />
        {ans == null ? <button onClick={check} disabled={!input.trim()}>Kiểm tra</button> : <button onClick={next}>Từ tiếp <Icon name="arrow" size={16} /></button>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {ans == null && <button className="ghost" onClick={() => say(q.word)}><Icon name="volume" size={15} /> Gợi ý: nghe từ</button>}
        {ans != null && <span className={ans ? "ok" : "error"}>{ans ? "Chính xác!" : <>Đáp án: <b>{q.word}</b></>}</span>}
      </div>
    </div>
  );
}

// ---------------- Trọng âm ----------------
function Stress() {
  const [q, setQ] = useState(() => pick(STRESS));
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  function choose(i: number) {
    if (chosen != null) return;
    setChosen(i); setScore(([r, t]) => [r + (i === q.s ? 1 : 0), t + 1]); say(q.word, 0.8);
  }
  function next() { let w = pick(STRESS); while (w.word === q.word) w = pick(STRESS); setQ(w); setChosen(null); }
  const family = STRESS.filter((x) => x.word !== q.word && x.word.slice(0, 5) === q.word.slice(0, 5));
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Trọng âm rơi vào đâu?</h2>
        <span className="muted">Đúng {score[0]}/{score[1]}</span>
      </div>
      <p className="muted">Bấm vào âm tiết được nhấn mạnh. Nhấn sai trọng âm khiến người nghe khó hiểu hơn cả phát âm sai một âm.</p>
      <div className="syl-row">
        {q.syl.map((s, i) => (
          <button key={i} className={`syl ${chosen == null ? "" : i === q.s ? "right" : i === chosen ? "wrong" : ""}`} onClick={() => choose(i)}>{s}</button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
        <button className="ghost" onClick={() => say(q.word, 0.8)}><Icon name="volume" size={15} /> Nghe</button>
        {chosen != null && <button onClick={next}>Từ tiếp <Icon name="arrow" size={16} /></button>}
      </div>
      {chosen != null && <p className={chosen === q.s ? "ok" : "error"} style={{ textAlign: "center" }}>
        {chosen === q.s ? "Chính xác!" : "Chưa đúng."} {q.syl.map((s, i) => (i === q.s ? s.toUpperCase() : s)).join("·")}
        {family.length > 0 && <span className="muted"> · So sánh: {family.map((f) => f.syl.map((s, i) => (i === f.s ? s.toUpperCase() : s)).join("·")).join(", ")}</span>}
      </p>}
    </div>
  );
}

// ---------------- Trang ----------------
const TABS = [["chart", "Bảng IPA"], ["pairs", "Cặp âm dễ nhầm"], ["read", "Đọc phiên âm"], ["stress", "Trọng âm"]] as const;
type Tab = (typeof TABS)[number][0];

export default function Pronunciation() {
  const [tab, setTab] = useState<Tab>("chart");
  const [prog, setProg] = useState<Progress>({});
  const [sound, setSound] = useState("iː");
  const [pair, setPair] = useState(PAIRS[0].key);
  useEffect(() => {
    loadProgress().then(setProg);
    try { const t = localStorage.getItem("ipa-tab") as Tab | null; if (t && TABS.some((x) => x[0] === t)) setTab(t); } catch { /* ignore */ }
  }, []);
  function choose(t: Tab) { window.speechSynthesis?.cancel(); setTab(t); try { localStorage.setItem("ipa-tab", t); } catch { /* ignore */ } }
  const weak = useMemo(() => weakest(Object.fromEntries(Object.entries(prog).filter(([k]) => !k.startsWith("pair:")))), [prog]);
  const practised = Object.keys(prog).filter((k) => !k.startsWith("pair:")).length;

  return (
    <>
      <div className="eyebrow">Kỹ năng</div>
      <h1>Phát âm theo IPA</h1>
      <p className="lead">Học từng âm trong bảng IPA, luyện các cặp âm người Việt hay nhầm, đọc phiên âm và trọng âm. Phiên âm theo giọng Anh-Anh như từ điển Oxford/Cambridge.</p>

      <div className="card weak-strip">
        <div><b>{practised}/44</b> <span className="muted">âm đã luyện</span></div>
        {weak.length > 0 ? <div className="row" style={{ gap: 6 }}>
          <span className="muted">Nên luyện thêm:</span>
          {weak.map((w) => <span key={w.s} className="chip" onClick={() => { setSound(w.s); choose("chart"); }}>/{w.s}/ · {Math.round(w.rate * 100)}%</span>)}
        </div> : <span className="muted">Luyện vài lượt, trang sẽ gợi ý những âm bạn còn yếu.</span>}
      </div>

      <div className="tabs">
        {TABS.map(([k, name]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => choose(k)}>{name}</button>)}
      </div>
      {tab === "chart" && <Chart prog={prog} onProg={setProg} sel={sound} setSel={setSound} goPairs={(k) => { setPair(k); choose("pairs"); }} />}
      {tab === "pairs" && <Pairs prog={prog} onProg={setProg} sel={pair} setSel={setPair} />}
      {tab === "read" && <Transcribe />}
      {tab === "stress" && <Stress />}
    </>
  );
}
