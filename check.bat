@echo off
setlocal
cd /d "%~dp0"

call "%~dp0script\windows-env.bat"
if errorlevel 1 exit /b 1
echo [AAi] Running lint and type checks...
"%AAI_BUN%" run script/windows.ts check %*
if errorlevel 1 (
  echo [AAi] Checks failed.
  if not defined AAI_NO_PAUSE pause
  exit /b 1
)

echo [AAi] Checks passed.
endlocal
