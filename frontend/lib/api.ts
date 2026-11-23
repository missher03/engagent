// Trên Windows "localhost" thường thử IPv6 (::1) trước rồi mới về 127.0.0.1, mỗi request có thể chậm thêm
// vài trăm ms đến ~2 giây. Uvicorn chỉ nghe 127.0.0.1 nên đổi thẳng sang địa chỉ này.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace("//localhost:", "//127.0.0.1:");

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const post = <T = any>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

/** Chọn giọng đọc tốt nhất của trình duyệt cho một ngôn ngữ (ưu tiên giọng "Natural/Online" của Edge). */
function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const exact = voices.filter((v) => v.lang.toLowerCase() === lang.toLowerCase());
  const pool = exact.length ? exact : voices;
  return pool.find((v) => /natural|online|neural/i.test(v.name)) || pool.find((v) => /google/i.test(v.name)) || pool[0];
}

export function hasVoice(lang: string) {
  return typeof window !== "undefined" && !!window.speechSynthesis && !!pickVoice(lang);
}

/** Đọc lần lượt nhiều đoạn (mỗi đoạn một ngôn ngữ). Trả về Promise xong khi đọc hết hoặc bị dừng. */
export function speakSeq(parts: { text: string; lang?: string; rate?: number }[]): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve();
  const synth = window.speechSynthesis;
  synth.cancel();
  return new Promise((resolve) => {
    const items = parts.filter((p) => p.text && p.text.trim());
    if (!items.length) return resolve();
    items.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.text);
      u.lang = p.lang || "en-US";
      const v = pickVoice(u.lang);
      if (v) u.voice = v;
      u.rate = p.rate ?? 1;
      if (i === items.length - 1) { u.onend = () => resolve(); u.onerror = () => resolve(); }
      synth.speak(u);
    });
  });
}

/** Đọc bằng giọng trình duyệt khi backend chưa bật Google TTS. */
export function speak(text: string, rate = 1, lang = "en-US") {
  speakSeq([{ text, rate, lang }]);
}

export function audioSrc(url?: string | null) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}
