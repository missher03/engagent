"""Bộ nhớ đệm kho từ (dùng chung mọi người, ~2.000 dòng).

Trang Kho từ, cây chủ đề và tra Việt-Anh đều cần cả kho. Đọc lại 2.000 dòng từ Postgres ở xa cho mỗi request
rất chậm, nên giữ một bản trong RAM. Bản này tự làm mới khi có từ được thêm hoặc sửa (sự kiện after_flush)."""
import threading

from sqlalchemy import event
from sqlalchemy.orm import Session as OrmSession
from sqlmodel import Session, select

from ..models import Word

_lock = threading.Lock()
_version = 0
_cache: tuple[int, list[Word]] | None = None


@event.listens_for(OrmSession, "after_flush")
def _mark(session, flush_context):
    if any(isinstance(o, Word) for o in (*session.new, *session.dirty, *session.deleted)):
        session.info["word_changed"] = True


@event.listens_for(OrmSession, "after_commit")
def _invalidate(session):
    global _version
    if session.info.pop("word_changed", False):
        _version += 1


def all_words(session: Session) -> list[Word]:
    """Mọi từ trong kho, đã tách khỏi session (chỉ để đọc, không sửa trực tiếp)."""
    global _cache
    c = _cache
    if c is not None and c[0] == _version:
        return c[1]
    with _lock:
        v = _version
        with Session(session.get_bind()) as s:
            words = list(s.exec(select(Word)).all())
            s.expunge_all()
        _cache = (v, words)
        return words
