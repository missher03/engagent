"""Tìm tài liệu nền cho bài đọc: Wikipedia tiếng Anh + các link người học dán vào. Không cần key."""
from __future__ import annotations

import html
import re

import httpx

UA = {"User-Agent": "EngAgent/1.0 (personal English-learning app)"}
WIKI = "https://en.wikipedia.org/w/api.php"
TIMEOUT = httpx.Timeout(12.0)
PER_SOURCE = 9000


def _clean(text: str) -> str:
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def wikipedia(topic: str, n: int = 3) -> list[dict]:
    """Tìm n trang Wikipedia phù hợp nhất và lấy phần chữ (bỏ mục References, See also...)."""
    try:
        r = httpx.get(WIKI, params={"action": "query", "list": "search", "srsearch": topic, "srlimit": n, "format": "json"},
                      headers=UA, timeout=TIMEOUT)
        r.raise_for_status()
        titles = [h["title"] for h in r.json().get("query", {}).get("search", [])]
        out = []
        for t in titles:
            r = httpx.get(WIKI, params={"action": "query", "prop": "extracts", "explaintext": 1, "titles": t, "redirects": 1, "format": "json"},
                          headers=UA, timeout=TIMEOUT)
            r.raise_for_status()
            for page in r.json().get("query", {}).get("pages", {}).values():
                text = page.get("extract") or ""
                text = re.split(r"\n== (See also|References|External links|Further reading|Notes) ==", text)[0]
                if len(text) > 300:
                    out.append({"title": f"Wikipedia: {page.get('title', t)}",
                                "url": "https://en.wikipedia.org/wiki/" + page.get("title", t).replace(" ", "_"),
                                "text": _clean(text)[:PER_SOURCE]})
        return out
    except (httpx.HTTPError, ValueError):
        return []


def fetch_url(url: str) -> dict | None:
    """Tải một trang web và lấy phần chữ chính (đơn giản: bỏ script/style/nav rồi bỏ thẻ)."""
    if not re.match(r"^https?://", url.strip()):
        return None
    try:
        r = httpx.get(url.strip(), headers=UA, timeout=TIMEOUT, follow_redirects=True)
        r.raise_for_status()
    except httpx.HTTPError:
        return None
    raw = r.text
    m = re.search(r"<title[^>]*>(.*?)</title>", raw, re.S | re.I)
    title = html.unescape(m.group(1)).strip() if m else url
    body = re.sub(r"(?is)<(head|script|style|nav|header|footer|aside|noscript|svg)[^>]*>.*?</\1>", " ", raw)
    body = re.sub(r"(?i)<(br|/p|/div|/h[1-6]|/li|/tr)[^>]*>", "\n", body)
    body = html.unescape(re.sub(r"<[^>]+>", " ", body))
    text = _clean(body)
    return {"title": title[:150], "url": url.strip(), "text": text[:PER_SOURCE]} if len(text) > 300 else None


def gather(topic: str, urls: list[str]) -> list[dict]:
    sources = [s for s in (fetch_url(u) for u in urls[:5] if u.strip()) if s]
    return sources + wikipedia(topic)
