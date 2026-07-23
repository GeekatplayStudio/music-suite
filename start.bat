@echo off
setlocal
cd /d "%~dp0"
echo Geekatplay Studio Music Suite - Startup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 (
  echo.
  echo Startup failed. Review the message above.
  pause
  exit /b 1
)
echo.
echo Music Suite is running at http://127.0.0.1:3000
echo To stop it, double-click stop.bat.
start "" "http://127.0.0.1:3000"
