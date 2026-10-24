@echo off
setlocal
cd /d "%~dp0"

echo [AAi] Building desktop installers...
call bun run --cwd packages/desktop package %*
if errorlevel 1 (
  echo [AAi] Desktop packaging failed.
  pause
  exit /b 1
)

echo [AAi] Installers are in packages\desktop\dist.
endlocal
