@echo off
setlocal
cd /d "%~dp0"

echo [AAi] Running lint and type checks...
call bun run check %*
if errorlevel 1 (
  echo [AAi] Checks failed.
  pause
  exit /b 1
)

echo [AAi] Checks passed.
endlocal
