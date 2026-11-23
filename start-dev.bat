@echo off
REM Chay ban phat trien: tu nap lai khi sua code (lan dau mo moi trang se cham hon).
cd /d "%~dp0"
start "EngAgent backend (dev)" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
start "EngAgent frontend (dev)" /D "%~dp0frontend" cmd /k "npm run dev"
timeout /t 8 >nul
start "" http://localhost:3000
