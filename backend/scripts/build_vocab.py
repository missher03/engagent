"""Sinh sẵn nghĩa / IPA / trọng âm / cách dùng / ví dụ cho toàn bộ kho từ bằng LLM đang cấu hình
(MiniMax hoặc Claude trong backend/.env), lưu vào app/data/vocab_content.json.

Chạy trong thư mục backend:
    python scripts/build_vocab.py                 # toàn bộ ~2000 từ (chạy tiếp được nếu bị ngắt)
    python scripts/build_vocab.py --only ml-eval  # chỉ một chủ đề nhỏ
    python scripts/build_vocab.py --limit 30      # thử 30 từ trước

Sau khi chạy xong, khởi động lại uvicorn: app tự nạp file vào DB.
"""
import argparse
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.config import get_settings  # noqa: E402
from app.services import dictionary, llm, vocab_data  # noqa: E402

lock = threading.Lock()


def save(content: dict) -> None:
    tmp = vocab_data.CONTENT.with_suffix(".tmp")
    tmp.write_text(json.dumps(content, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    tmp.replace(vocab_data.CONTENT)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="khóa chủ đề nhỏ, vd ml-eval (mặc định: tất cả)")
    ap.add_argument("--batch", type=int, default=12, help="số từ mỗi lần gọi LLM")
    ap.add_argument("--workers", type=int, default=4, help="số lời gọi song song")
    ap.add_argument("--limit", type=int, default=0, help="chỉ sinh N từ (để thử)")
    args = ap.parse_args()

    s = get_settings()
    if not s.llm_enabled:
        sys.exit("Chưa có key LLM trong backend/.env (LLM_PROVIDER + MINIMAX_API_KEY hoặc ANTHROPIC_API_KEY).")
    print(f"LLM: {s.llm_provider} ({s.minimax_model_fast if s.is_minimax else s.llm_model_fast})")

    content = {}
    if vocab_data.CONTENT.exists():
        content = json.loads(vocab_data.CONTENT.read_text(encoding="utf-8"))
    have = {k.lower() for k in content}

    jobs, seen = [], set()
    for c in vocab_data.parse_taxonomy():
        for st in c["subtopics"]:
            if args.only and st["key"] != args.only:
                continue
            todo = [t for t in st["terms"] if t.lower() not in have and t.lower() not in seen]
            seen.update(t.lower() for t in todo)
            for i in range(0, len(todo), args.batch):
                jobs.append((c["name"], st["name"], todo[i : i + args.batch]))
    if args.limit:
        kept, n = [], 0
        for j in jobs:
            if n >= args.limit:
                break
            kept.append(j)
            n += len(j[2])
        jobs = kept
    total = sum(len(j[2]) for j in jobs)
    print(f"Đã có {len(content)} từ. Cần sinh {total} từ trong {len(jobs)} lô.")
    if not jobs:
        return

    done, failed, t0 = 0, [], time.time()

    def run(job):
        cat, sub, terms = job
        for attempt in range(3):
            try:
                return job, dictionary.llm_entries(terms, subtopic=sub, category=cat)
            except llm.LLMError as e:
                if attempt == 2:
                    raise
                time.sleep(5 * (attempt + 1))
                print(f"  thử lại lô '{sub}': {e}")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run, j) for j in jobs]
        for fut in as_completed(futures):
            try:
                (cat, sub, terms), entries = fut.result()
            except Exception as e:  # noqa: BLE001
                print(f"  LỖI: {e}")
                continue
            wanted = {t.lower(): t for t in terms}
            got = 0
            with lock:
                for e in entries:
                    key = str(e.get("term", "")).lower()
                    if key in wanted and e.get("meaning_vi"):
                        e["term"] = wanted.pop(key)
                        content[e["term"]] = {k: e.get(k) for k in vocab_data.CONTENT_FIELDS}
                        got += 1
                failed += list(wanted.values())
                done += got
                save(content)
            rate = done / max(time.time() - t0, 1)
            print(f"[{done}/{total}] {sub}: +{got}  (~{rate * 60:.0f} từ/phút)")

    print(f"\nXong: {done} từ mới, tổng {len(content)} từ trong {vocab_data.CONTENT.name}.")
    if failed:
        print(f"{len(failed)} từ chưa sinh được (chạy lại lệnh để thử tiếp): {', '.join(failed[:20])}...")
    print("Khởi động lại uvicorn để nạp vào app.")


if __name__ == "__main__":
    main()
