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
  useEffect(() => {
    if (isLogin) return;
    if (getToken()) setOk(true); else goLogin();
  }, [isLogin, path]);
  if (isLogin) return <main className="login-main">{children}</main>;
  if (!ok) return null;
  return (
    <div className="shell">
      <Nav />
      <main>{children}</main>
    </div>
  );
}
