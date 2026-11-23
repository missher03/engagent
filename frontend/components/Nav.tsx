"use client";
import Link from "next/link";
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
    </aside>
  );
}
