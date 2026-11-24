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
      <div className="eyebrow">Cá nhân</div>
      <h1>Hồ sơ người học</h1>
      <p className="lead">Nội dung trong app mặc định là IT/AI/dữ liệu nói chung. Phần dự án bên dưới là tùy chọn: nếu điền, bài đọc thỉnh thoảng có ví dụ liên quan và phần Hỏi đáp sẽ hỏi về dự án đó. Để trống thì mọi thứ giữ ở mức chung.</p>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <label>Trình độ hiện tại <select value={p.level} onChange={f("level")}><option>B1</option><option>B2</option><option>C1</option></select></label>
        <label>Dự án/đề tài của bạn (tùy chọn)<input value={p.thesis_title} onChange={f("thesis_title")} style={{ width: "100%" }} /></label>
        <label>Tóm tắt ngắn (tùy chọn)<textarea value={p.thesis_summary} onChange={f("thesis_summary")} /></label>
        <div className="row"><button onClick={save}>Lưu</button>{saved && <span className="ok">Đã lưu</span>}</div>
      </div>
    </>
  );
}
