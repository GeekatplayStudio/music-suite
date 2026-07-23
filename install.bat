@echo off
setlocal
cd /d "%~dp0"
echo Geekatplay Studio Music Suite - Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
if errorlevel 1 (
  echo.
  echo Installation failed. Review the message above.
  pause
  exit /b 1
)
echo.
echo Installation complete. Run start.bat to launch Music Suite.
pause
