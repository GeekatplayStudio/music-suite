@echo off
setlocal
cd /d "%~dp0"
title Geekatplay Studio Music Suite Installer
echo Starting the Music Suite installer...
echo Keep this window open. It will explain each choice and show progress.
echo.
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
