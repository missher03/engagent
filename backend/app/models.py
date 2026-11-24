"""Bảng dữ liệu. Bảng có cột user_id là dữ liệu riêng của từng người (tự lọc theo người đang đăng nhập, xem scoping.py)."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now(timezone.utc)


class Word(SQLModel, table=True):
    """Một mục từ/cụm từ trong kho (bộ có sẵn hoặc người dùng thêm)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    term: str = Field(index=True, unique=True)
    deck: str = Field(default="custom", index=True)  # awl | ml | finance | presentation | custom
    topic: Optional[int] = None  # 1-12 theo bản đồ chủ đề bài học
    category: Optional[str] = Field(default=None, index=True)  # lĩnh vực: ai, ml, dl, ds, de, se...
    subtopic: Optional[str] = Field(default=None, index=True)  # chủ đề nhỏ chính, vd "ml-eval"
    subtopics: list = Field(default_factory=list, sa_column=Column(JSON))  # mọi chủ đề nhỏ chứa từ
    part_of_speech: Optional[str] = None
    stress: Optional[str] = None  # vd "vo-la-TIL-i-ty"
    cefr: Optional[str] = None  # B1 | B2 | C1
    kind: Optional[str] = None  # term | academic | phrase
    priority: int = 2  # 1 = từ cốt lõi, ôn kỹ hơn
    ipa: Optional[str] = None
    audio_url: Optional[str] = None
    definition_en: Optional[str] = None
    meaning_vi: Optional[str] = None
    usage_vi: Optional[str] = None  # cách dùng, cấu trúc đi kèm, lưu ý
    example: Optional[str] = None
    example_vi: Optional[str] = None
    collocations: list = Field(default_factory=list, sa_column=Column(JSON))
    enriched: bool = False  # đã tra từ điển + LLM chưa
    source: Optional[str] = None  # None/"taxonomy" = kho có sẵn | "lookup" = từ người dùng tự tra
    lookup_count: Optional[int] = 0  # số lần đã tra
    looked_up_at: Optional[datetime] = None  # lần tra gần nhất


class Card(SQLModel, table=True):
    """Thẻ ôn tập của một từ đã được thêm vào sổ từ."""

    id: Optional[int] = Field(default=None, primary_key=True)
    word_id: int = Field(foreign_key="word.id", index=True)
    user_id: Optional[int] = Field(default=None, index=True)
    level: int = 1  # 1 nhận biết, 2 nhớ lại, 3 dùng đúng, 4 sản xuất
    step: int = 0  # vị trí trong lịch ôn
    due: datetime = Field(default_factory=now, index=True)
    reps: int = 0
    lapses: int = 0
    level4_passes: int = 0
    created_at: datetime = Field(default_factory=now)


class ReviewLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    card_id: int = Field(foreign_key="card.id", index=True)
    correct: bool
    level_before: int
    reviewed_at: datetime = Field(default_factory=now)


class Lesson(SQLModel, table=True):
    """Bài đọc/nghe do LLM sinh, cache theo khóa (topic, level, format, target_words)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    cache_key: str = Field(index=True)
    title: str
    format: str
    level: str
    topic: str
    text: str
    target_words: list = Field(default_factory=list, sa_column=Column(JSON))
    questions: list = Field(default_factory=list, sa_column=Column(JSON))
    audio_path: Optional[str] = None
    qc_report: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now)


class Attempt(SQLModel, table=True):
    """Một lần nộp bài nói/viết/phát âm/hỏi đáp, lưu điểm để theo dõi tiến bộ."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    skill: str = Field(index=True)  # pronunciation | writing | speaking | examiner
    task: str = ""
    input_text: str = ""
    result: dict = Field(default_factory=dict, sa_column=Column(JSON))
    score: Optional[float] = None
    created_at: datetime = Field(default_factory=now)


class Profile(SQLModel, table=True):
    """Hồ sơ người học: trình độ, lỗi hay gặp; dự án/đề tài riêng là tùy chọn."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    level: str = "B1"
    thesis_title: str = ""  # tùy chọn: tên dự án/đề tài riêng
    thesis_summary: str = ""
    defense_date: Optional[str] = None
    common_errors: list = Field(default_factory=list, sa_column=Column(JSON))
    ipa_progress: dict = Field(default_factory=dict, sa_column=Column(JSON))  # âm -> [đúng, tổng]


class ExamItem(SQLModel, table=True):
    """Đề thi nói do AI sinh (đề làm sẵn nằm trong data/speaking_exams.json)."""

    id: str = Field(primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    type: str = Field(index=True)
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now)


class Course(SQLModel, table=True):
    """Khóa học nghe/đọc theo chủ đề người học tự nhập (vd Kafka). Các bài nằm trong cột lessons (JSON), tạo dần."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    topic: str
    title: str = ""
    level: str = "B2"
    goal: str = "overview"
    summary_vi: str = ""
    sources: list = Field(default_factory=list, sa_column=Column(JSON))   # [{title, url, text}]
    lessons: list = Field(default_factory=list, sa_column=Column(JSON))   # [{title, focus, key_points, content, listening, quiz, done, score}]
    created_at: datetime = Field(default_factory=now)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=now)


class AuthToken(SQLModel, table=True):
    token: str = Field(primary_key=True)
    user_id: int = Field(index=True)
    expires_at: datetime


class WordLookup(SQLModel, table=True):
    """Từ một người đã tra: số lần tra và lần tra gần nhất (riêng từng người)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    word_id: int = Field(foreign_key="word.id", index=True)
    count: int = 0
    last_at: datetime = Field(default_factory=now)
