/** Nhận dạng giọng nói bằng Web Speech API của trình duyệt (Chrome/Edge). Trả null nếu không hỗ trợ. */
export function startDictation(onText: (text: string, final: boolean) => void, onEnd: () => void, lang = "en-US") {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  let finalText = "";
  r.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
      else interim += e.results[i][0].transcript;
    }
    onText((finalText + interim).trim(), !interim);
  };
  r.onend = onEnd;
  r.start();
  return r;
}
