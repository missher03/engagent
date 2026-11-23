import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "EngAgent",
  description: "Tiếng Anh cho Data Science & AI (B1-B2)",
  manifest: "/manifest.json",
};

const LINKS = [
  ["/", "Tổng quan"],
  ["/dictionary", "Tra từ"],
  ["/words", "Kho từ"],
  ["/review", "Ôn tập"],
  ["/pronunciation", "Phát âm"],
  ["/lessons", "Bài nghe/đọc"],
  ["/writing", "Viết"],
  ["/speaking", "Nói"],
  ["/examiner", "Hỏi đáp"],
  ["/profile", "Hồ sơ"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <nav>
          <Link href="/" className="brand">EngAgent</Link>
          {LINKS.slice(1).map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
