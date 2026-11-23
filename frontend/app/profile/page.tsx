"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Profile() {
  const [p, setP] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api("/api/profile").then(setP); }, []);
  if (!p) return <p>Đang tải...</p>;

  async function save() {
    setP(await api("/api/profile", { method: "PUT", body: JSON.stringify(p) }));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  const f = (k: string) => (e: any) => setP({ ...p, [k]: e.target.value });

  return (
    <>
      <h1>Hồ sơ người học</h1>
      <p className="muted">Thông tin luận văn dùng để sinh bài đọc và câu hỏi hội đồng sát với đề tài của bạn.</p>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <label>Trình độ hiện tại <select value={p.level} onChange={f("level")}><option>B1</option><option>B2</option></select></label>
        <label>Ngày bảo vệ <input type="date" value={p.defense_date || ""} onChange={f("defense_date")} /></label>
        <label>Tên đề tài<input value={p.thesis_title} onChange={f("thesis_title")} style={{ width: "100%" }} /></label>
        <label>Tóm tắt (mô hình, dữ liệu, thị trường, kết quả)<textarea value={p.thesis_summary} onChange={f("thesis_summary")} /></label>
        <div className="row"><button onClick={save}>Lưu</button>{saved && <span className="ok">Đã lưu</span>}</div>
      </div>
    </>
  );
}
