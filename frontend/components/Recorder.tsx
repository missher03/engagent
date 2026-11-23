"use client";
import { useRef, useState } from "react";
import { blobToWav16k } from "@/lib/wav";

/** Nút ghi âm: bấm để bắt đầu, bấm lần nữa để dừng; trả WAV 16 kHz qua onDone. */
export default function Recorder({ onDone, maxSeconds = 30 }: { onDone: (wav: Blob) => void; maxSeconds?: number }) {
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function start() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          onDone(await blobToWav16k(new Blob(chunks, { type: mr.mimeType })));
        } catch (e: any) {
          setErr("Không chuyển được audio: " + e.message);
        }
      };
      mr.start();
      rec.current = mr;
      setRecording(true);
      timer.current = setTimeout(stop, maxSeconds * 1000);
    } catch (e: any) {
      setErr("Không mở được micro: " + e.message);
    }
  }

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    rec.current?.state === "recording" && rec.current.stop();
    setRecording(false);
  }

  return (
    <span>
      <button className={recording ? "danger" : ""} onClick={recording ? stop : start}>
        {recording ? "■ Dừng ghi" : "● Ghi âm"}
      </button>
      {err && <span className="error"> {err}</span>}
    </span>
  );
}
