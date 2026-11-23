"use client";
import { useEffect, useState } from "react";
import SpeakingCoach from "@/components/SpeakingCoach";
import ConversationCoach from "@/components/ConversationCoach";
import SpeakingExam from "@/components/SpeakingExam";
import DocQA from "@/components/DocQA";

const TABS = [
  ["talk", "Trò chuyện", "Hội thoại tiếng Anh theo tình huống IT. Cô Mai hỏi tiếp để bạn nói nhiều nhất có thể, giúp khi bạn bí, và sửa lỗi nhẹ nhàng."],
  ["coach", "Diễn đạt ý", "Nói ý của bạn bằng tiếng Việt. Trợ lý xác nhận lại ý, chỉ cách nói bằng tiếng Anh, giải thích vì sao, và trả lời bằng giọng nói."],
  ["exam", "Thi theo đề", "Đề thực tế: sơ đồ kiến trúc, system design, AI flow, bảng số liệu, bảng evaluation, bài viết, bài báo. Thi 3 phần như IELTS Speaking, chấm band 4.0-9.0."],
  ["docqa", "Hỏi đáp tài liệu", "Tải ảnh, báo cáo hoặc bài viết của bạn lên. AI đọc hiểu rồi hỏi bạn như một buổi hỏi đáp thật trong công việc."],
] as const;
type Tab = (typeof TABS)[number][0];

export default function Speaking() {
  const [tab, setTab] = useState<Tab>("talk");
  useEffect(() => {
    try { const t = localStorage.getItem("speaking-tab") as Tab | null; if (t && TABS.some((x) => x[0] === t)) setTab(t); } catch { /* ignore */ }
  }, []);
  function choose(t: Tab) {
    window.speechSynthesis?.cancel(); setTab(t);
    try { localStorage.setItem("speaking-tab", t); } catch { /* ignore */ }
  }
  const cur = TABS.find((t) => t[0] === tab)!;
  return (
    <>
      <div className="eyebrow">Kỹ năng</div>
      <h1>Luyện nói</h1>
      <div className="tabs">
        {TABS.map(([k, name]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => choose(k)}>{name}</button>)}
      </div>
      <p className="lead">{cur[2]}</p>
      {tab === "talk" && <ConversationCoach />}
      {tab === "coach" && <SpeakingCoach />}
      {tab === "exam" && <SpeakingExam />}
      {tab === "docqa" && <DocQA />}
    </>
  );
}
