@echo off
setlocal
cd /d "%~dp0"

echo [AAi] Starting the web app in development mode...
call bun run dev:web %*
if errorlevel 1 (
  echo [AAi] Web development session exited with an error.
  pause
  exit /b 1
)

endlocal
