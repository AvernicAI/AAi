@echo off
setlocal
cd /d "%~dp0"

echo [AAi] Compiling a standalone CLI executable for this machine...
call bun run --cwd packages/cli build --single %*
if errorlevel 1 (
  echo [AAi] Build failed.
  pause
  exit /b 1
)

echo [AAi] Build complete. Run it with run.bat.
endlocal
