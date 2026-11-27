@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0install.ps1" (
  echo.
  echo Music Suite's files are not all here, so it cannot install.
  echo This usually means install.bat was opened straight from the downloaded ZIP file.
  echo Right-click the ZIP, choose "Extract All...", then run install.bat from the extracted folder.
  echo.
  pause
  exit /b 1
)
set MUSIC_SUITE_LAUNCHER=bat
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
