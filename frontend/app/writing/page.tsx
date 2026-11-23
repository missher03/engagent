"use client";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import Scores from "@/components/Scores";

export default function Writing() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskId, setTaskId] = useState("");
  const [text, setText] = useState("");
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api("/api/writing/tasks").then((t) => { setTasks(t); setTaskId(t[0]?.id); }); }, []);
  const task = tasks.find((t) => t.id === taskId);

  async function grade() {
    setLoading(true); setErr(null);
    try { setRes(await post("/api/writing/grade", { task_id: taskId, text })); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  return (
    <>
      <div className="eyebrow">Kỹ năng</div>
      <h1>Luyện viết</h1>
      <p className="lead">Chọn đề, viết bài và nhận điểm, lỗi sai cùng bản sửa mẫu.</p>
      <select value={taskId} onChange={(e) => { setTaskId(e.target.value); setRes(null); }} style={{ width: "100%" }}>
        {tasks.map((t) => <option key={t.id} value={t.id}>{t.type} · {t.title}</option>)}
      </select>
      {task && (
        <div className="card">
          <p>{task.prompt}</p>
          {task.data && <p className="muted">Dữ liệu: {task.data}</p>}
          <p>Từ bắt buộc: {task.required_words.map((w: string) => <span key={w} className="tag">{w}</span>)}</p>
        </div>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Viết bài ở đây..." />
      <div className="row">
        <button onClick={grade} disabled={loading || text.split(/\s+/).length < 10}>{loading ? "Đang chấm..." : "Chấm bài"}</button>
        <span className="muted">{text.trim() ? text.trim().split(/\s+/).length : 0} từ</span>
      </div>
      {err && <p className="error">{err}</p>}
      {res && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Trình độ ước tính: {res.overall_level}</h2>
          <Scores scores={res.scores} />
          {res.reasons && <ul>{Object.entries(res.reasons).map(([k, v]: any) => <li key={k}><b>{k}:</b> {v}</li>)}</ul>}
          {res.missing?.length > 0 && <p className="error">Còn thiếu: {res.missing.join(", ")}</p>}
          {res.errors?.length > 0 && (
            <>
              <h2>Lỗi cần sửa</h2>
              <table><tbody>
                {res.errors.map((e: any, i: number) => (
                  <tr key={i}><td><s>{e.original}</s><br /><span className="ok">{e.correction}</span></td>
                    <td><span className="tag">{e.type}</span> {e.explanation_vi}</td></tr>
                ))}
              </tbody></table>
            </>
          )}
          <h2>Bản sửa</h2>
          <p className="text">{res.corrected_text}</p>
          {res.upgrades?.length > 0 && <><h2>Câu nâng cấp B2</h2><ul>{res.upgrades.map((u: string) => <li key={u}>{u}</li>)}</ul></>}
          <button className="ghost" onClick={() => { setRes(null); }}>Sửa bài và nộp lại</button>
        </div>
      )}
    </>
  );
}
