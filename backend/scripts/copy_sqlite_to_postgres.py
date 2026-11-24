"""Chép toàn bộ dữ liệu từ SQLite trên máy lên Postgres (Neon/Supabase/Render) một lần, trước khi dùng bản online.

Cách chạy (trong thư mục backend, đã kích hoạt .venv):
    python scripts/copy_sqlite_to_postgres.py sqlite:///./engagent.db "postgresql://user:pass@host/db"
Postgres phải trống (chưa ai mở bản online). Script tạo bảng, chép từng bảng rồi chỉnh lại bộ đếm id.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, func, inspect, select, text  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app import models  # noqa: E402,F401
from app.db import _normalize  # noqa: E402


def main(src_url: str, dst_url: str) -> None:
    src = create_engine(src_url)
    dst = create_engine(_normalize(dst_url))
    SQLModel.metadata.create_all(dst)
    src_tables = set(inspect(src).get_table_names())
    with src.connect() as s, dst.begin() as d:
        for table in SQLModel.metadata.sorted_tables:
            if d.execute(select(func.count()).select_from(table)).scalar():
                raise SystemExit(f"Bảng {table.name} trên Postgres đã có dữ liệu, dừng để không ghi đè.")
        for table in SQLModel.metadata.sorted_tables:
            if table.name not in src_tables:
                continue
            have = {c["name"] for c in inspect(src).get_columns(table.name)}
            cols = [c for c in table.columns if c.name in have]
            rows = [dict(r._mapping) for r in s.execute(select(*cols))]
            if rows:
                d.execute(table.insert(), rows)
            pk = [c for c in table.primary_key.columns]
            if len(pk) == 1 and pk[0].autoincrement and str(pk[0].type) == "INTEGER":
                d.execute(text(f"SELECT setval(pg_get_serial_sequence('\"{table.name}\"', '{pk[0].name}'), "
                               f"COALESCE((SELECT MAX({pk[0].name}) FROM \"{table.name}\"), 0) + 1, false)"))
            print(f"{table.name}: {len(rows)} dòng")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
