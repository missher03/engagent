"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

const SKILLS: [string, string, string, string, string][] = [
  ["/words", "Kho từ vựng", "Hơn 2.000 thuật ngữ IT, AI, dữ liệu chia theo chủ đề nhỏ.", "layers", "var(--c1)"],
  ["/pronunciation", "Phát âm", "Đọc to, được chấm từng từ và từng âm.", "mic", "var(--c4)"],
  ["/lessons", "Nghe & đọc", "Bài đọc, hội thoại sinh từ chính các từ bạn đang học.", "headphones", "var(--c2)"],
  ["/writing", "Viết", "Email, tóm tắt kết quả, abstract, có chấm theo tiêu chí.", "pen", "var(--c3)"],
  ["/speaking", "Nói", "Trình bày slide, stand-up, mô tả biểu đồ.", "chat", "var(--c5)"],
  ["/examiner", "Hỏi đáp kỹ thuật", "Luyện trả lời câu hỏi sau bài thuyết trình.", "users", "var(--c6)"],
];

const LABELS: Record<string, string> = { writing: "Viết", speaking: "Nói", pronunciation: "Phát âm", examiner: "Hỏi đáp", sentence: "Đặt câu", "sentence-writing": "Đặt câu (viết)", "sentence-speaking": "Đặt câu (nói)" };

export default function Home() {
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api("/api/health"), api("/api/stats"), api("/api/progress")])
      .then(([h, s, p]) => { setHealth(h); setStats(s); setProgress(p); })
      .catch((e) => setErr(`Không kết nối được backend (${e.message}). Hãy chạy start-app.bat.`));
  }, []);

  const hour = new Date().getHours();
  const hello = hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const due = stats?.due_today ?? 0;

  return (
    <>
      <section className="hero">
        <div className="eyebrow" style={{ color: "rgba(255,255,255,.8)" }}>{hello} 👋</div>
        <h1>{due > 0 ? `Hôm nay bạn có ${due} thẻ cần ôn` : "Hôm nay học gì nhỉ?"}</h1>
        <p>Ôn vài phút mỗi ngày giúp bạn nhớ từ lâu hơn. Sau đó thử một bài nghe hoặc luyện nói ngắn.</p>
        <div className="row">
          <Link href={due > 0 ? "/review" : "/words"}><button className="big">{due > 0 ? "Bắt đầu ôn tập" : "Học từ mới"} <Icon name="arrow" size={18} /></button></Link>
          <Link href="/lessons"><button className="ghost big">Tạo bài nghe</button></Link>
        </div>
        <svg className="deco" width="220" height="220" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 10h5" /></svg>
      </section>

      {err && <p className="notice">{err}</p>}

      <div className="tiles">
        {[
          ["repeat", "var(--c1)", stats?.due_today, "thẻ cần ôn"],
          ["book", "var(--c2)", stats?.notebook, "từ trong sổ"],
          ["star", "var(--c3)", stats?.mastered, "từ đã thuộc"],
          ["target", "var(--c4)", stats?.retention != null ? `${stats.retention}%` : "–", "tỉ lệ nhớ"],
        ].map(([icon, c, v, label]) => (
          <div key={label as string} className="tile">
            <div className="ic" style={{ ["--c" as any]: c }}><Icon name={icon as string} size={22} /></div>
            <div><b>{v ?? "–"}</b><span>{label}</span></div>
          </div>
        ))}
      </div>

      <h2>Luyện kỹ năng</h2>
      <div className="skills">
        {SKILLS.map(([href, title, desc, icon, c]) => (
          <Link key={href} href={href} className="skill" style={{ ["--c" as any]: c }}>
            <div className="ic"><Icon name={icon} size={22} /></div>
            <h3>{title}</h3>
            <p>{desc}</p>
            <span className="go">Bắt đầu <Icon name="arrow" size={14} /></span>
          </Link>
        ))}
      </div>

      {progress && Object.keys(progress).length > 0 && (
        <>
          <h2>Tiến bộ gần đây</h2>
          <table>
            <thead><tr><th>Kỹ năng</th><th>Điểm TB 5 lần gần nhất</th><th>Số lần</th></tr></thead>
            <tbody>
              {Object.entries(progress).map(([k, v]: any) => (
                <tr key={k}><td><b>{LABELS[k] || k}</b></td><td>{v.avg_last5}</td><td className="muted">{v.count}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {health && (
        <div className="status">
          {[["LLM", health.services.llm], ["Phát âm", health.services.pronunciation], ["Giọng đọc", health.services.tts]].map(([k, v]) => (
            <span key={k} className="tag"><span className={`dot ${v === "mock" ? "off" : ""}`} />{k}: {v}</span>
          ))}
        </div>
      )}
    </>
  );
}
