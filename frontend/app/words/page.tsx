"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

export default function Categories() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api("/api/categories").then(setData).catch((e) => setErr(e.message)); }, []);

  if (err) return <p className="error">{err}</p>;
  if (!data) return <p>Đang tải...</p>;
  const { total, ready, categories: cats } = data;

  return (
    <>
      <div className="eyebrow">Từ vựng</div>
      <h1>Kho từ vựng <span className="muted">{total} từ · {ready} đã có nội dung</span></h1>
      <p className="lead">Chọn một chủ đề nhỏ để học: nghĩa, cách dùng, ví dụ, phát âm, đặt câu và luyện nói.
        {ready < total && " Từ chưa có nội dung sẽ được sinh khi bạn mở (hoặc chạy scripts/build_vocab.py để sinh sẵn tất cả)."}</p>
      {cats.map((c: any, i: number) => (
        <section key={c.key} style={{ ["--c" as any]: COLORS[i % COLORS.length] }}>
          <div className="cat-head"><div className="ic"><Icon name={c.key === "mine" ? "search" : "layers"} size={20} /></div><h2>{c.name} <span className="muted">{c.count} từ</span></h2></div>
          <div className="grid">
            {c.subtopics.map((s: any) => (
              <Link key={s.key} href={`/words/${s.key}`} className="card topic">
                <b>{s.name}</b>
                <div className="muted" style={{ marginTop: 4 }}>{s.count} từ · {s.ready} sẵn sàng{s.in_notebook ? ` · ${s.in_notebook} trong sổ` : ""}{s.mine && c.key !== "mine" ? ` · ${s.mine} từ bạn tra` : ""}</div>
                <div className="bar"><span style={{ width: `${(100 * s.in_notebook) / Math.max(s.count, 1)}%` }} /></div>
                <div className="muted small">{s.preview.join(", ")}…</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
