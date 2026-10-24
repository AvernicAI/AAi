@echo off
setlocal
cd /d "%~dp0"

echo [AAi] Starting from source...
call bun run dev %*
if errorlevel 1 (
  echo [AAi] Development session exited with an error.
  pause
  exit /b 1
)

endlocal
