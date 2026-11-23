@echo off
REM Chay ban nhanh (production): build frontend 1 lan, chuyen trang gan nhu tuc thi.
REM Sau khi sua code frontend thi chay lai file nay de build lai.
cd /d "%~dp0"
start "EngAgent backend" cmd /k "cd backend && .venv\Scripts\activate && uvicorn app.main:app --host 127.0.0.1 --port 8000"
cd frontend
call npm run build
start "EngAgent frontend" cmd /k "npm run start"
timeout /t 4 >nul
start "" http://localhost:3000
