"use client";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";

export default function Words() {
  const [decks, setDecks] = useState<any[]>([]);
  const [deck, setDeck] = useState("");
  const [onlyNotebook, setOnlyNotebook] = useState(false);
  const [words, setWords] = useState<any[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => {
    if (onlyNotebook) api("/api/notebook").then((w) => setWords(w.map((x: any) => ({ ...x, in_notebook: true }))));
    else api(`/api/words${deck ? `?deck=${deck}` : ""}`).then(setWords);
  };
  useEffect(() => { api("/api/decks").then(setDecks); }, []);
  useEffect(load, [deck, onlyNotebook]);

  async function toggle(w: any) {
    setBusy(w.id);
    if (w.in_notebook) await api(`/api/notebook/${w.id}`, { method: "DELETE" });
    else await post("/api/notebook", { term: w.term });
    setBusy(null);
    load();
  }

  return (
    <>
      <h1>Kho từ vựng</h1>
      <div className="row">
        <select value={deck} onChange={(e) => setDeck(e.target.value)} disabled={onlyNotebook}>
          <option value="">Tất cả bộ</option>
          {decks.map((d) => <option key={d.deck} value={d.deck}>{d.deck} ({d.count})</option>)}
        </select>
        <label><input type="checkbox" checked={onlyNotebook} onChange={(e) => setOnlyNotebook(e.target.checked)} /> Chỉ sổ từ của tôi</label>
      </div>
      <p className="muted">Thêm từ vào sổ sẽ tự tra nghĩa (lần đầu mất vài giây) và tạo thẻ ôn tập.</p>
      <table>
        <thead><tr><th>Từ</th><th>Nghĩa</th><th>Bộ</th><th></th></tr></thead>
        <tbody>
          {words.map((w) => (
            <tr key={w.id}>
              <td><b>{w.term}</b> {w.priority === 1 && <span className="tag">luận văn</span>}
                {w.mastered && <span className="tag ok">đã thuộc</span>}</td>
              <td>{w.meaning_vi || <span className="muted">—</span>}</td>
              <td className="muted">{w.deck}{w.topic ? ` · chủ đề ${w.topic}` : ""}</td>
              <td><button className={w.in_notebook ? "ghost" : ""} disabled={busy === w.id} onClick={() => toggle(w)}>
                {busy === w.id ? "..." : w.in_notebook ? "Bỏ" : "+ Sổ"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
