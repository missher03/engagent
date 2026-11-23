"""Kiểm tra kết nối LLM với cấu hình trong backend/.env (không in key).

Chạy trong thư mục backend:  python scripts/check_llm.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows

from app.config import get_settings  # noqa: E402
from app.services import dictionary, llm  # noqa: E402

s = get_settings()
key = s.minimax_api_key if s.is_minimax else s.anthropic_api_key
print(f"Provider : {s.llm_provider}")
print(f"Base URL : {s.minimax_base_url if s.is_minimax else 'https://api.anthropic.com'}")
print(f"Model    : {(s.minimax_model_fast if s.is_minimax else s.llm_model_fast)}")
print(f"Key      : {'có (' + str(len(key)) + ' ký tự)' if key else 'CHƯA CÓ'}")
if not s.llm_enabled:
    sys.exit("=> Chưa có key nên app đang chạy mock. Kiểm tra lại backend/.env (không có dấu cách quanh dấu =).")

print("\n1) Gọi thử một câu ngắn...")
try:
    print("   Trả lời:", llm.chat([{"role": "user", "content": "Reply with exactly: OK"}], max_tokens=50).strip()[:200])
except llm.LLMError as e:
    print("   LỖI:", e)
    if "401" in str(e) or "403" in str(e):
        print("   Gợi ý: key sai, hoặc key Token Plan cần base URL khác. Thử MINIMAX_BASE_URL=https://api.minimax.io/anthropic")
    sys.exit(1)

print("\n2) Thử giải nghĩa từ 'overfitting' (JSON)...")
try:
    print("  ", dictionary.llm_meaning("overfitting"))
except Exception as e:  # noqa: BLE001
    print("   LỖI:", e)
    sys.exit(1)
print("\n=> Kết nối LLM hoạt động.")
