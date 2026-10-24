@echo off
setlocal
cd /d "%~dp0"

echo [AAi] Syncing with upstream OpenCode...
call bun run sync:upstream %*
if errorlevel 1 (
  echo [AAi] Sync stopped. Read the messages above before retrying.
  pause
  exit /b 1
)

echo [AAi] Sync complete. Nothing was pushed.
endlocal
