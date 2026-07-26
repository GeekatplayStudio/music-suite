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
echo Startup complete. The selected web address is shown above.
echo To stop this exact instance, double-click stop.bat.
