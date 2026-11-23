@echo off
REM Chay ban phat trien: tu nap lai khi sua code (lan dau mo moi trang se cham hon).
cd /d "%~dp0"
REM Tat tien trinh cu con giu cong 3000 (frontend) va 8000 (backend)
for %%P in (3000 8000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P *[^ ]*  *LISTENING"') do (
    echo Dang tat tien trinh PID %%I tren cong %%P
    taskkill /F /PID %%I >nul 2>&1
  )
)
start "EngAgent backend (dev)" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
start "EngAgent frontend (dev)" /D "%~dp0frontend" cmd /k "npm run dev"
timeout /t 8 >nul
start "" http://localhost:3000
