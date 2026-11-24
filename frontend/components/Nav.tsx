"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { clearSession, currentUser } from "@/lib/auth";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

const GROUPS: { title: string; links: [string, string, string][] }[] = [
  { title: "", links: [["/", "Tổng quan", "home"]] },
  { title: "Từ vựng", links: [["/words", "Kho từ", "layers"], ["/review", "Ôn tập", "repeat"], ["/dictionary", "Tra từ", "search"]] },
  { title: "Kỹ năng", links: [["/pronunciation", "Phát âm", "mic"], ["/lessons", "Nghe & đọc", "headphones"], ["/writing", "Viết", "pen"], ["/speaking", "Nói", "chat"]] },
  { title: "", links: [["/profile", "Hồ sơ", "user"]] },
];

export default function Nav() {
  const path = usePathname() || "/";
  const [level, setLevel] = useState("");
  const [user, setUser] = useState("");
  useEffect(() => {
    setUser(currentUser()?.username || "");
    api("/api/auth/me").then((u) => setUser(u.username)).catch(() => {});
    api("/api/profile").then((p) => setLevel(p.level || "B1")).catch(() => {});
  }, []);
  async function logout() {
    try { await post("/api/auth/logout", {}); } catch { /* ignore */ }
    clearSession();
    window.location.href = "/login";
  }
  async function choose(l: string) {
    setLevel(l);
    try { await api("/api/profile", { method: "PUT", body: JSON.stringify({ level: l }) }); window.dispatchEvent(new CustomEvent("level-change", { detail: l })); } catch { /* ignore */ }
  }
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/words" && path.startsWith("/word/")));
  return (
    <aside className="side">
      <Link href="/" className="brand">
        <span className="logo">E</span>
        <span>EngAgent<small>Tiếng Anh cho IT &amp; AI</small></span>
      </Link>
      <nav>
        {GROUPS.map((g, i) => (
          <div key={i} className="navgroup">
            {g.title && <div className="navtitle">{g.title}</div>}
            {g.links.map(([href, label, icon]) => (
              <Link key={href} href={href} className={active(href) ? "on" : ""}>
                <Icon name={icon} size={18} /> <span>{label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {level && <div className="level-switch" title="Trình độ dùng cho bài AI tạo, chấm điểm và trò chuyện">
        <div className="navtitle">Trình độ</div>
        <div className="seg">{["B1", "B2", "C1"].map((l) => <button key={l} className={level === l ? "on" : ""} onClick={() => choose(l)}>{l}</button>)}</div>
      </div>}
      {user && <div className="userbox">
        <span className="avatar">{user[0].toUpperCase()}</span>
        <span className="uname" title={user}>{user}</span>
        <button className="ghost small" onClick={logout} title="Đăng xuất">Đăng xuất</button>
      </div>}
    </aside>
  );
}
