"use client";
import { useEffect, useState } from "react";
import Study from "@/components/Study";
import VocabLessons from "@/components/VocabLessons";

const TABS = [
  ["topic", "Học theo chủ đề", "Gõ chủ đề bạn muốn học (Kafka, Google Cloud, RAG…). AI đọc nguồn, lập khóa 4-6 bài, mỗi bài có bài đọc dài, bài nghe, câu hỏi và hỏi đáp."],
  ["vocab", "Bài theo từ vựng", "Bài đọc hoặc hội thoại ngắn dùng đúng các từ bạn đang học trong kho từ, kèm câu hỏi."],
] as const;
type Tab = (typeof TABS)[number][0];

export default function Lessons() {
  const [tab, setTab] = useState<Tab>("topic");
  useEffect(() => { try { const t = localStorage.getItem("lessons-tab") as Tab | null; if (t === "topic" || t === "vocab") setTab(t); } catch { /* ignore */ } }, []);
  function choose(t: Tab) { window.speechSynthesis?.cancel(); setTab(t); try { localStorage.setItem("lessons-tab", t); } catch { /* ignore */ } }
  const cur = TABS.find((t) => t[0] === tab)!;
  return (
    <>
      <div className="eyebrow">Kỹ năng</div>
      <h1>Nghe & đọc</h1>
      <div className="tabs">{TABS.map(([k, n]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => choose(k)}>{n}</button>)}</div>
      <p className="lead">{cur[2]}</p>
      {tab === "topic" ? <Study /> : <VocabLessons />}
    </>
  );
}
