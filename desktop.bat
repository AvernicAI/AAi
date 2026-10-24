@echo off
setlocal
cd /d "%~dp0"

echo [AAi] Starting the desktop app in development mode...
call bun run dev:desktop %*
if errorlevel 1 (
  echo [AAi] Desktop development session exited with an error.
  pause
  exit /b 1
)

endlocal
