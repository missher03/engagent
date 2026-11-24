"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Nav from "./Nav";
import { getToken, goLogin } from "@/lib/auth";

/** Trang /login hiện riêng; mọi trang khác cần token, chưa có thì chuyển sang /login. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const isLogin = path.startsWith("/login");
  const [ok, setOk] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setSlow(!!(e as CustomEvent).detail);
    window.addEventListener("server-slow", on);
    return () => window.removeEventListener("server-slow", on);
  }, []);
  const banner = slow && <div className="slow-banner">Máy chủ đang khởi động lại sau thời gian nghỉ, lần đầu có thể mất khoảng 1 phút. Dữ liệu sẽ tự hiện khi xong.</div>;
  useEffect(() => {
    if (isLogin) return;
    if (getToken()) setOk(true); else goLogin();
  }, [isLogin, path]);
  if (isLogin) return <main className="login-main">{banner}{children}</main>;
  if (!ok) return null;
  return (
    <div className="shell">
      <Nav />
      <main>{banner}{children}</main>
    </div>
  );
}
