import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("data")
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp}/test.db"
    os.environ["STORAGE_DIR"] = str(tmp / "storage")
    os.environ["FORCE_MOCK"] = "1"
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        r = c.post("/api/auth/register", json={"username": "tester", "password": "secret123"})
        c.headers["Authorization"] = f"Bearer {r.json()['token']}"
        yield c
