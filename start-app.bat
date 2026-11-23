@echo off
REM Chay ban nhanh (production): build frontend 1 lan, chuyen trang gan nhu tuc thi.
REM Sau khi sua code frontend thi chay lai file nay de build lai.
cd /d "%~dp0"
REM Tat tien trinh cu con giu cong 3000 (frontend) va 8000 (backend)
for %%P in (3000 8000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P *[^ ]*  *LISTENING"') do (
    echo Dang tat tien trinh PID %%I tren cong %%P
    taskkill /F /PID %%I >nul 2>&1
  )
)
if not exist "backend\.venv\Scripts\python.exe" (
  echo Khong tim thay backend\.venv. Hay tao venv va cai thu vien theo README truoc.
  pause
  exit /b 1
)
start "EngAgent backend" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
  echo Build frontend that bai, xem loi o tren.
  pause
  exit /b 1
)
start "EngAgent frontend" /D "%~dp0frontend" cmd /k "npm run start"
timeout /t 5 >nul
start "" http://localhost:3000
