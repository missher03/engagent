"""Lớp bọc LLM. Mọi chỗ gọi LLM đi qua đây để dễ đổi model/nhà cung cấp.

LLM_PROVIDER=anthropic dùng Claude; LLM_PROVIDER=minimax dùng MiniMax qua endpoint
tương thích Anthropic (cùng SDK, chỉ đổi base_url + key + tên model).

Khi chưa có key của provider đang chọn, `complete_json` trả về `mock` do nơi gọi cung cấp,
nên toàn bộ app vẫn chạy được để phát triển giao diện.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Callable

import anthropic

from ..config import get_settings

log = logging.getLogger(__name__)
_client: anthropic.Anthropic | None = None


class LLMError(RuntimeError):
    pass


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        s = get_settings()
        if s.is_minimax:
            # MiniMax xác thực bằng "Authorization: Bearer <key>"
            _client = anthropic.Anthropic(auth_token=s.minimax_api_key, base_url=s.minimax_base_url)
        else:
            _client = anthropic.Anthropic(api_key=s.anthropic_api_key)
    return _client


def extract_json(text: str) -> Any:
    """Lấy JSON từ câu trả lời (chịu được ```json ... ``` hoặc chữ thừa trước/sau)."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = min([i for i in (text.find("{"), text.find("[")) if i != -1], default=-1)
        end = max(text.rfind("}"), text.rfind("]"))
        if start == -1 or end == -1:
            raise
        return json.loads(text[start : end + 1])


def chat(
    messages: list[dict],
    *,
    system: str | None = None,
    smart: bool = False,
    max_tokens: int = 4000,
    effort: str = "low",
) -> str:
    """Gọi Claude, trả về text. smart=True dùng model mạnh (chấm bài, giám khảo)."""
    s = get_settings()
    if s.is_minimax:
        model = s.minimax_model_smart if smart else s.minimax_model_fast
        # Token suy nghĩ của MiniMax tính vào max_tokens, nên nới rộng để không bị cắt mất phần trả lời.
        kwargs: dict[str, Any] = dict(model=model, max_tokens=max_tokens * 2 + 4000, messages=messages)
        if "flash" in model.lower():  # chỉ M3.1-Flash nhận output_config.effort (mặc định "max")
            kwargs["output_config"] = {"effort": effort}
    else:
        model = s.llm_model_smart if smart else s.llm_model_fast
        kwargs = dict(
            model=model,
            max_tokens=max_tokens,
            messages=messages,
            output_config={"effort": effort},
        )
    if system:
        kwargs["system"] = system
    try:
        resp = _get_client().messages.create(**kwargs)
    except anthropic.RateLimitError as e:
        raise LLMError("LLM đang bị giới hạn tốc độ, thử lại sau ít giây") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"LLM lỗi {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise LLMError(f"Không kết nối được tới {'MiniMax' if s.is_minimax else 'Anthropic'} API") from e
    if resp.stop_reason == "refusal":
        raise LLMError("LLM từ chối yêu cầu này")
    text = "".join(b.text for b in resp.content if b.type == "text")
    if not text and resp.stop_reason == "max_tokens":
        raise LLMError("LLM hết max_tokens trước khi trả lời (phần suy nghĩ quá dài)")
    return text


def complete_json(
    prompt: str,
    *,
    mock: Callable[[], Any],
    system: str | None = None,
    smart: bool = False,
    max_tokens: int = 4000,
    effort: str = "low",
    retries: int = 1,
) -> Any:
    """Gửi prompt yêu cầu trả JSON. Thiếu key -> trả mock()."""
    if not get_settings().llm_enabled:
        return mock()
    last_err: Exception | None = None
    for _ in range(retries + 1):
        text = chat(
            [{"role": "user", "content": prompt}],
            system=system,
            smart=smart,
            max_tokens=max_tokens,
            effort=effort,
        )
        try:
            return extract_json(text)
        except (json.JSONDecodeError, ValueError) as e:
            last_err = e
            log.warning("LLM trả JSON không hợp lệ, thử lại: %s", text[:200])
    raise LLMError(f"LLM không trả JSON hợp lệ: {last_err}")


def chat_json(
    messages: list[dict],
    *,
    mock: Callable[[], Any],
    system: str | None = None,
    smart: bool = False,
    max_tokens: int = 3000,
    effort: str = "low",
) -> Any:
    """Như chat() nhưng đọc JSON từ câu trả lời; thiếu key -> mock(); thử lại 1 lần nếu JSON hỏng."""
    if not get_settings().llm_enabled:
        return mock()
    last: Exception | None = None
    for _ in range(2):
        text = chat(messages, system=system, smart=smart, max_tokens=max_tokens, effort=effort)
        try:
            return extract_json(text)
        except (json.JSONDecodeError, ValueError) as e:
            last = e
    raise LLMError(f"LLM không trả JSON hợp lệ: {last}")
