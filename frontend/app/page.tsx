"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Home() {
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api("/api/health"), api("/api/stats"), api("/api/progress")])
      .then(([h, s, p]) => { setHealth(h); setStats(s); setProgress(p); })
      .catch((e) => setErr(`Không kết nối được backend (${e.message}). Đã chạy uvicorn chưa?`));
  }, []);

  return (
    <>
      <h1>Hôm nay học gì?</h1>
      {err && <p className="error">{err}</p>}
      {stats && (
        <div className="grid">
          <div className="score"><b>{stats.due_today}</b><span>thẻ cần ôn</span></div>
          <div className="score"><b>{stats.notebook}</b><span>từ trong sổ</span></div>
          <div className="score"><b>{stats.mastered}</b><span>từ đã thuộc</span></div>
          <div className="score"><b>{stats.retention ?? "–"}%</b><span>tỉ lệ nhớ</span></div>
        </div>
      )}
      <div className="card row">
        <Link href="/review"><button>Ôn {stats?.due_today ?? ""} thẻ</button></Link>
        <Link href="/lessons"><button className="ghost">Tạo bài nghe</button></Link>
        <Link href="/examiner"><button className="ghost">Luyện hỏi đáp hội đồng</button></Link>
      </div>
      {progress && Object.keys(progress).length > 0 && (
        <div className="card">
          <h2>Điểm trung bình 5 lần gần nhất</h2>
          <table><tbody>
            {Object.entries(progress).map(([k, v]: any) => (
              <tr key={k}><td>{k}</td><td>{v.avg_last5}</td><td className="muted">{v.count} lần</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
      {health && (
        <p className="muted">
          Dịch vụ: LLM <b>{health.services.llm}</b> · Phát âm <b>{health.services.pronunciation}</b> · TTS <b>{health.services.tts}</b>
          {Object.values(health.services).some((s: any) => s === "mock" || s === "browser-fallback") && " (điền key trong backend/.env để bật bản thật)"}
        </p>
      )}
    </>
  );
}
