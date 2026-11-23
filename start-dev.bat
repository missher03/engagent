@echo off
REM Chay ban phat trien: tu nap lai khi sua code (lan dau mo moi trang se cham hon).
cd /d "%~dp0"
start "EngAgent backend (dev)" cmd /k "cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
start "EngAgent frontend (dev)" cmd /k "cd frontend && npm run dev"
timeout /t 6 >nul
start "" http://localhost:3000
