"""Tách dữ liệu theo người dùng.

Mỗi request đặt `current_user_id` (middleware trong main.py). Mọi câu SELECT qua ORM trên bảng có cột
user_id tự thêm điều kiện `user_id = <người đang đăng nhập>`, và mọi bản ghi mới tự gắn user_id.
Nhờ vậy các router cũ không phải sửa từng truy vấn."""
from contextvars import ContextVar
from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session as OrmSession, with_loader_criteria

from . import models

current_user_id: ContextVar[Optional[int]] = ContextVar("current_user_id", default=None)

SCOPED = (models.Card, models.ReviewLog, models.Lesson, models.Attempt, models.Profile,
          models.ExamItem, models.Course, models.WordLookup)


@event.listens_for(OrmSession, "do_orm_execute")
def _scope_selects(state):
    uid = current_user_id.get()
    if uid is None or not state.is_select or state.execution_options.get("unscoped"):
        return
    state.statement = state.statement.options(
        *(with_loader_criteria(cls, cls.user_id == uid, include_aliases=True) for cls in SCOPED)
    )


@event.listens_for(OrmSession, "before_flush")
def _stamp_new(session, flush_context, instances):
    uid = current_user_id.get()
    if uid is None:
        return
    for obj in session.new:
        if isinstance(obj, SCOPED) and getattr(obj, "user_id", None) is None:
            obj.user_id = uid
