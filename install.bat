@echo off
setlocal
cd /d "%~dp0"

where bun >nul 2>nul
if errorlevel 1 (
  echo [AAi] Bun is required but was not found on PATH.
  echo        Install it from https://bun.sh and run this script again.
  pause
  exit /b 1
)

echo [AAi] Installing workspace dependencies...
call bun install %*
if errorlevel 1 (
  echo [AAi] Install failed.
  pause
  exit /b 1
)

echo [AAi] Dependencies installed.
endlocal
