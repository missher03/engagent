import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from .config import get_settings
from .db import engine, init_db
from .models import Word
from .routers import coach, exam, learn, speech, study, vocab, writing
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
    yield


settings = get_settings()
app = FastAPI(title="EngAgent API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
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
