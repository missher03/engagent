import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from .config import get_settings
from .db import engine, init_db
from .models import User, Word
from .scoping import current_user_id
from .routers import auth, coach, exam, learn, speech, study, vocab, writing
from .services.tts import audio_dir
from .services.vocab_data import sync_words

logging.basicConfig(level=logging.INFO)


def seed_words() -> None:
    seed = json.loads((Path(__file__).parent / "data" / "seed_words.json").read_text(encoding="utf-8"))
    with Session(engine) as s:
        existing = {w for w in s.exec(select(Word.term)).all()}
        for item in seed:
            if item["term"] not in existing:
                existing.add(item["term"])
                s.add(Word(**item))
        s.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_words()
    with Session(engine) as s:
        logging.getLogger("engagent").info("Kho từ: %s", sync_words(s))
        from .routers.vocab import backfill_lookup_cards

        logging.getLogger("engagent").info("Thẻ ôn mới cho từ đã tra: %s", backfill_lookup_cards(s))
        first = s.exec(select(User).order_by(User.id)).first()
        if first:
            auth.claim_orphans(s, first.id)
    yield


class AuthMiddleware:
    """Đọc token (Authorization: Bearer ...), đặt người dùng hiện tại cho cả request.
    Mọi /api/* trừ /api/auth/* và /api/health cần đăng nhập."""

    OPEN = ("/api/auth/", "/api/health")

    def __init__(self, app):
        self.app = app

    @staticmethod
    def _lookup(token: str):
        with Session(engine) as s:
            return auth.user_for_token(s, token)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        token = headers.get(b"authorization", b"").decode().removeprefix("Bearer ").strip()
        uid = None
        if token:
            uid = auth.cached_uid(token)
            if uid is None:
                uid = await run_in_threadpool(self._lookup, token)
        path = scope.get("path", "")
        if uid is None and path.startswith("/api/") and not path.startswith(self.OPEN) and scope.get("method") != "OPTIONS":
            await JSONResponse({"detail": "Chưa đăng nhập"}, status_code=401)(scope, receive, send)
            return
        reset = current_user_id.set(uid)
        try:
            await self.app(scope, receive, send)
        finally:
            current_user_id.reset(reset)


settings = get_settings()
app = FastAPI(title="EngAgent API", version="0.1.0", lifespan=lifespan)
app.add_middleware(AuthMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(vocab.router)
app.include_router(speech.router)
app.include_router(learn.router)
app.include_router(coach.router)
app.include_router(exam.router)
app.include_router(writing.router)
app.include_router(study.router)
app.mount("/audio", StaticFiles(directory=audio_dir()), name="audio")


@app.get("/api/health")
def health():
    s = get_settings()
    return {
        "ok": True,
        "services": {
            "llm": ("minimax" if s.is_minimax else "claude") if s.llm_enabled else "mock",
            "pronunciation": "on" if s.azure_enabled else "mock",
            "tts": "on" if s.tts_enabled else "browser-fallback",
        },
    }
