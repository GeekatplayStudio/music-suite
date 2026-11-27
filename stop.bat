@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0stop.ps1" (
  echo.
  echo Music Suite's files are not all here, so it cannot stop.
  echo This usually means stop.bat was opened straight from the downloaded ZIP file.
  echo Right-click the ZIP, choose "Extract All...", then run stop.bat from the extracted folder.
  echo.
  pause
  exit /b 1
)
set MUSIC_SUITE_LAUNCHER=bat
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
