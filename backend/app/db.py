from sqlmodel import Session, SQLModel, create_engine

from . import scoping  # noqa: F401  (lọc dữ liệu theo người dùng)

from .config import get_settings

_settings = get_settings()


def _normalize(url: str) -> str:
    """Render/Neon/Supabase hay cho dạng postgres:// hoặc postgresql://; SQLAlchemy cần ghi rõ driver psycopg."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _normalize(_settings.database_url)
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)


def init_db() -> None:
    from . import models  # noqa: F401  (đăng ký bảng)

    SQLModel.metadata.create_all(engine)
    _add_missing_columns()


def _add_missing_columns() -> None:
    """Tự thêm cột mới vào bảng cũ (thay cho migration khi còn dùng SQLite cá nhân).
    Khi schema phức tạp hơn, chuyển sang Alembic."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name not in existing:
                    ddl = col.type.compile(dialect=engine.dialect)
                    conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl}'))
        # Trước đây mỗi từ chỉ có một thẻ (unique); giờ mỗi người một thẻ riêng.
        if insp.has_table("card"):
            for ix in insp.get_indexes("card"):
                if ix["name"] == "ix_card_word_id" and ix.get("unique"):
                    conn.execute(text("DROP INDEX ix_card_word_id"))
                    conn.execute(text("CREATE INDEX ix_card_word_id ON card (word_id)"))


def get_session():
    with Session(engine) as session:
        yield session
