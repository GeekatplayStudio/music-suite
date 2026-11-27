@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0start.ps1" (
  echo.
  echo Music Suite's files are not all here, so it cannot start.
  echo This usually means start.bat was opened straight from the downloaded ZIP file.
  echo Right-click the ZIP, choose "Extract All...", then run start.bat from the extracted folder.
  echo.
  pause
  exit /b 1
)
set MUSIC_SUITE_LAUNCHER=bat
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
