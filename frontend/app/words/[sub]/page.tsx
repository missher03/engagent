"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, post, speak } from "@/lib/api";

export default function Subtopic() {
  const { sub } = useParams<{ sub: string }>();
  const [words, setWords] = useState<any[] | null>(null);
  const [name, setName] = useState(sub);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api(`/api/words?subtopic=${sub}`).then(setWords);
  useEffect(() => {
    load();
    api("/api/categories").then((d) => {
      for (const c of d.categories) for (const s of c.subtopics) if (s.key === sub) setName(`${c.name} › ${s.name}`);
    });
  }, [sub]);

  async function generate() {
    setBusy(true); setMsg("Đang sinh nội dung cho cả chủ đề (khoảng 1 phút)...");
    try { const r = await post(`/api/subtopics/${sub}/enrich`, {}); setMsg(`Đã sinh ${r.enriched_now} từ.`); load(); }
    catch (e: any) { setMsg("Lỗi: " + e.message); }
    setBusy(false);
  }
  async function addAll() {
    const r = await post(`/api/subtopics/${sub}/notebook`, {});
    setMsg(`Đã thêm ${r.added} từ vào sổ, vào mục Ôn tập để học.`); load();
  }

  if (!words) return <p>Đang tải...</p>;
  const missing = words.filter((w) => !w.enriched).length;
  return (
    <>
      <p className="muted"><Link href="/words">← Kho từ</Link></p>
      <h1>{name} <span className="muted">{words.length} từ</span></h1>
      <div className="row">
        <button onClick={addAll}>+ Thêm cả chủ đề vào sổ ôn tập</button>
        {missing > 0 && <button className="ghost" onClick={generate} disabled={busy}>Sinh nội dung cho {missing} từ còn thiếu</button>}
        {words[0] && <Link href={`/word/${words[0].id}?sub=${sub}`}><button className="ghost">Học lần lượt từng từ →</button></Link>}
      </div>
      {msg && <p className="muted">{msg}</p>}
      <table>
        <thead><tr><th>Từ</th><th>Phát âm</th><th>Nghĩa</th><th></th></tr></thead>
        <tbody>
          {words.map((w) => (
            <tr key={w.id}>
              <td><Link href={`/word/${w.id}?sub=${sub}`}><b>{w.term}</b></Link>
                {w.part_of_speech && <div className="muted small">{w.part_of_speech}</div>}</td>
              <td><button className="ghost icon" onClick={() => speak(w.term)}>🔊</button> <span className="muted small">{w.ipa}<br />{w.stress}</span></td>
              <td>{w.meaning_vi || <span className="muted">chưa có (mở từ để sinh)</span>}</td>
              <td>{w.in_notebook ? <span className="ok small">✓ sổ</span> : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
