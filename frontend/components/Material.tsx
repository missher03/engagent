"use client";
import { useEffect, useId, useState } from "react";

/** Hiển thị tài liệu của đề: sơ đồ Mermaid, bảng, văn bản, biểu đồ, khung màn hình (wireframe). */
export type Block =
  | { kind: "mermaid"; code: string; caption?: string }
  | { kind: "table"; columns: string[]; rows: string[][]; caption?: string }
  | { kind: "text"; title?: string; body: string }
  | { kind: "chart"; x: string[]; series: { name: string; values: number[] }[]; unit?: string; caption?: string }
  | { kind: "screen"; title?: string; regions: { label: string; items: string[] }[] };

const MERMAID_URL = "/vendor/mermaid-11.4.1.min.js"; // đóng gói sẵn trong public/, không cần mạng
let mermaidLoading: Promise<any> | null = null;

function loadMermaid(): Promise<any> {
  const w = window as any;
  if (w.mermaid) return Promise.resolve(w.mermaid);
  if (!mermaidLoading) {
    mermaidLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = MERMAID_URL;
      s.onload = () => {
        w.mermaid.initialize({
          startOnLoad: false, theme: "dark", securityLevel: "strict",
          themeVariables: { background: "#1f1f22", primaryColor: "#2d2c42", primaryTextColor: "#ececef", primaryBorderColor: "#9b98f5",
            lineColor: "#a0a0a8", secondaryColor: "#2a2a2e", tertiaryColor: "#26262b", fontFamily: "Be Vietnam Pro, system-ui, sans-serif" },
        });
        resolve(w.mermaid);
      };
      s.onerror = () => { mermaidLoading = null; reject(new Error("Không tải được thư viện vẽ sơ đồ.")); };
      document.head.appendChild(s);
    });
  }
  return mermaidLoading;
}

function Mermaid({ code }: { code: string }) {
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadMermaid()
      .then((m) => m.render(id, code))
      .then((r: any) => alive && setSvg(r.svg))
      .catch((e: any) => alive && setErr(e?.message || "Sơ đồ lỗi"));
    return () => { alive = false; };
  }, [code, id]);
  const [zoom, setZoom] = useState(false);
  if (err) return <pre className="mermaid-fallback">{code}</pre>;
  if (!svg) return <p className="muted">Đang vẽ sơ đồ…</p>;
  // Giữ kích thước thật của sơ đồ (chữ đọc được), khung tự cuộn ngang; bấm để phóng to toàn màn hình.
  const natural = svg.match(/max-width:\s*([\d.]+)px/);
  const sized = natural ? svg.replace('width="100%"', `width="${Math.round(Number(natural[1]) * 0.62)}"`) : svg;
  return (
    <>
      <div className="mermaid-box" title="Bấm để phóng to" onClick={() => setZoom(true)} dangerouslySetInnerHTML={{ __html: sized }} />
      <div className="muted small">Kéo ngang để xem hết, hoặc bấm vào sơ đồ để phóng to.</div>
      {zoom && <div className="zoom-overlay" onClick={() => setZoom(false)}><div className="zoom-inner" dangerouslySetInnerHTML={{ __html: svg }} /></div>}
    </>
  );
}

function Chart({ b }: { b: Extract<Block, { kind: "chart" }> }) {
  const W = 560, H = 240, P = { l: 44, r: 16, t: 16, b: 32 };
  const all = b.series.flatMap((s) => s.values);
  const max = Math.max(...all) * 1.1, min = Math.min(0, ...all);
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, b.x.length - 1);
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - (v - min) / (max - min || 1));
  const colors = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * (max - min));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={b.caption}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(t)}</text>
          </g>
        ))}
        {b.x.map((lab, i) => <text key={lab} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">{lab}</text>)}
        {b.series.map((s, si) => (
          <g key={s.name}>
            <polyline fill="none" stroke={colors[si % 4]} strokeWidth="2.5" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {s.values.map((v, i) => (
              <g key={i}><circle cx={x(i)} cy={y(v)} r="3.5" fill={colors[si % 4]} />
                <text x={x(i)} y={y(v) - 8} textAnchor="middle" fontSize="10.5" fill="var(--fg)">{v}</text></g>
            ))}
          </g>
        ))}
      </svg>
      <div className="muted small">{b.series.map((s, si) => <span key={s.name} style={{ marginRight: 12 }}><span style={{ color: colors[si % 4] }}>●</span> {s.name}</span>)} {b.unit && `(${b.unit})`}</div>
    </div>
  );
}

export default function Material({ blocks }: { blocks: Block[] }) {
  return (
    <div className="material">
      {blocks.map((b, i) => (
        <figure key={i} className="mat-block">
          {b.kind === "mermaid" && <Mermaid code={b.code} />}
          {b.kind === "table" && (
            <div style={{ overflowX: "auto" }}>
              <table><thead><tr>{b.columns.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table>
            </div>
          )}
          {b.kind === "text" && <div className="mat-text">{b.title && <div className="section-label" style={{ marginTop: 0 }}>{b.title}</div>}<p className="text" style={{ fontSize: 15 }}>{b.body}</p></div>}
          {b.kind === "chart" && <Chart b={b} />}
          {b.kind === "screen" && (
            <div className="screen">
              {b.title && <div className="screen-title">{b.title}</div>}
              <div className="screen-grid">
                {b.regions.map((r) => (
                  <div key={r.label} className="screen-region">
                    <div className="section-label" style={{ margin: "0 0 4px" }}>{r.label}</div>
                    {r.items.map((it, k) => <div key={k} className="small">{it}</div>)}
                  </div>
                ))}
              </div>
            </div>
          )}
          {"caption" in b && b.caption && <figcaption className="muted small">{b.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
