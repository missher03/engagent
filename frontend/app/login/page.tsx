"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { post } from "@/lib/api";
import { saveSession, User } from "@/lib/auth";

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (mode === "register" && password !== password2) return setErr("Hai mật khẩu chưa khớp");
    setBusy(true);
    try {
      const r = await post<{ token: string; user: User }>(`/api/auth/${mode}`, { username, password });
      saveSession(r.token, r.user);
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("/login") ? next : "/";
    } catch (e: any) {
      setErr(e.message || "Có lỗi, thử lại");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand"><span className="logo">E</span><span>EngAgent<small>Tiếng Anh cho IT &amp; AI</small></span></div>
        <div className="seg login-seg">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setErr(""); }}>Đăng nhập</button>
          <button type="button" className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setErr(""); }}>Tạo tài khoản</button>
        </div>
        <label>Tên đăng nhập
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus placeholder="vd quoc" required />
        </label>
        <label>Mật khẩu
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
        </label>
        {mode === "register" && <label>Nhập lại mật khẩu
          <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required />
        </label>}
        {err && <div className="login-err">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</button>
        <p className="muted login-note">
          {mode === "register"
            ? "Mỗi tài khoản có sổ từ, lịch ôn, bài học, điểm và tiến độ phát âm riêng. Kho từ và đề có sẵn dùng chung. Tài khoản đầu tiên nhận lại toàn bộ dữ liệu bạn đã học trước đây."
            : "Chưa có tài khoản? Chọn \"Tạo tài khoản\". Đăng nhập được nhớ 30 ngày trên trình duyệt này."}
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
