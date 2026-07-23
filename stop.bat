@echo off
setlocal
cd /d "%~dp0"
echo Geekatplay Studio Music Suite - Shutdown
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
if errorlevel 1 (
  echo.
  echo Shutdown could not complete safely. Review the message above.
  pause
  exit /b 1
)
echo.
echo Music Suite has stopped.
pause
