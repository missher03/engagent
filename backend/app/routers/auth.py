"""Tài khoản: đăng ký, đăng nhập, đăng xuất. Mật khẩu băm PBKDF2, phiên đăng nhập là token 30 ngày."""
import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session, select

from ..config import get_settings
from ..db import get_session
from ..models import AuthToken, User, now
from ..scoping import SCOPED, current_user_id

router = APIRouter(prefix="/api/auth", tags=["auth"])
TOKEN_DAYS = 30
_ITER = 200_000
_NAME_OK = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")


def hash_password(pw: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), _ITER).hex()
    return f"pbkdf2_sha256${_ITER}${salt}${h}"


def check_password(pw: str, stored: str) -> bool:
    try:
        _, it, salt, h = stored.split("$")
        got = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(it)).hex()
    except ValueError:
        return False
    return hmac.compare_digest(got, h)


_token_cache: dict[str, tuple[int, float]] = {}  # token -> (user_id, hết hạn cache)
_CACHE_SECS = 300


def user_for_token(session: Session, token: str):
    """Tra token -> user_id. Nhớ 5 phút trong RAM để mỗi request không phải hỏi CSDL một lần nữa."""
    import time

    hit = _token_cache.get(token)
    if hit and hit[1] > time.monotonic():
        return hit[0]
    uid = _user_for_token_db(session, token)
    if uid is not None:
        if len(_token_cache) > 1000:
            _token_cache.clear()
        _token_cache[token] = (uid, time.monotonic() + _CACHE_SECS)
    return uid


def cached_uid(token: str):
    import time

    hit = _token_cache.get(token)
    return hit[0] if hit and hit[1] > time.monotonic() else None


def _user_for_token_db(session: Session, token: str):
    t = session.get(AuthToken, token)
    if not t:
        return None
    exp = t.expires_at if t.expires_at.tzinfo else t.expires_at.replace(tzinfo=now().tzinfo)
    if exp < now():
        session.delete(t)
        session.commit()
        return None
    return t.user_id


def claim_orphans(session: Session, uid: int) -> None:
    """Dữ liệu tạo ra trước khi có tài khoản (user_id trống) thuộc về tài khoản đầu tiên."""
    for cls in SCOPED:
        session.exec(text(f'UPDATE "{cls.__tablename__}" SET user_id = :u WHERE user_id IS NULL').bindparams(u=uid))
    session.commit()


class Credentials(BaseModel):
    username: str
    password: str
    code: str = ""


def _issue(session: Session, user: User) -> dict:
    token = secrets.token_urlsafe(32)
    session.add(AuthToken(token=token, user_id=user.id, expires_at=now() + timedelta(days=TOKEN_DAYS)))
    session.commit()
    return {"token": token, "user": {"id": user.id, "username": user.username}}


@router.post("/register")
def register(body: Credentials, session: Session = Depends(get_session)):
    need = get_settings().signup_code
    if need and not hmac.compare_digest(body.code.strip(), need):
        raise HTTPException(403, "Sai mã mời. Hỏi chủ app để lấy mã.")
    name = body.username.strip().lower()
    if not _NAME_OK.match(name):
        raise HTTPException(400, "Tên đăng nhập 3-30 ký tự, chỉ gồm chữ không dấu, số, dấu . _ -")
    if len(body.password) < 6:
        raise HTTPException(400, "Mật khẩu cần ít nhất 6 ký tự")
    if session.exec(select(User).where(User.username == name)).first():
        raise HTTPException(409, "Tên đăng nhập đã có người dùng")
    first = session.exec(select(User)).first() is None
    user = User(username=name, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    if first:
        claim_orphans(session, user.id)
    return {**_issue(session, user), "claimed_old_data": first}


@router.get("/options")
def options():
    return {"signup_code_required": bool(get_settings().signup_code)}


@router.post("/login")
def login(body: Credentials, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == body.username.strip().lower())).first()
    if not user or not check_password(body.password, user.password_hash):
        raise HTTPException(401, "Sai tên đăng nhập hoặc mật khẩu")
    return _issue(session, user)


@router.post("/logout")
def logout(request: Request, session: Session = Depends(get_session)):
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    _token_cache.pop(token, None)
    t = session.get(AuthToken, token) if token else None
    if t:
        session.delete(t)
        session.commit()
    return {"ok": True}


@router.get("/me")
def me(session: Session = Depends(get_session)):
    uid = current_user_id.get()
    user = session.get(User, uid) if uid else None
    if not user:
        raise HTTPException(401, "Chưa đăng nhập")
    return {"id": user.id, "username": user.username}
