@echo off
setlocal
cd /d "%~dp0"

set "AAI_BIN="
for /r "packages\cli\dist" %%f in (opencode.exe) do set "AAI_BIN=%%f"

if not defined AAI_BIN (
  echo [AAi] No built executable was found under packages\cli\dist.
  echo        Run build.bat first.
  pause
  exit /b 1
)

echo [AAi] Running "%AAI_BIN%"
"%AAI_BIN%" %*
if errorlevel 1 (
  echo [AAi] AAi exited with an error.
  pause
  exit /b 1
)

endlocal
