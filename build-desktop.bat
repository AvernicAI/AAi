@echo off
setlocal
cd /d "%~dp0"

echo [AAi] Building the desktop app...
call bun run --cwd packages/desktop build %*
if errorlevel 1 (
  echo [AAi] Desktop build failed.
  pause
  exit /b 1
)

echo [AAi] Desktop build complete.
endlocal
