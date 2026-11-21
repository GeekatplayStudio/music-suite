@echo off
setlocal
cd /d "%~dp0"
echo Geekatplay Studio Music Suite - Startup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 (
  echo.
  echo Startup failed. Review the message above.
  echo The logs folder next to start.bat has the details: api.error.log and web.error.log.
  pause
  exit /b 1
)
echo.
echo Startup complete. The selected web address is shown above.
echo To stop this exact instance, double-click stop.bat.
