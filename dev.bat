@echo off
setlocal
cd /d "%~dp0"

call "%~dp0script\windows-env.bat"
if errorlevel 1 exit /b 1
echo [AAi] Starting from source...
"%AAI_BUN%" run script/windows.ts dev %*
if errorlevel 1 (
  echo [AAi] Development session exited with an error.
  if not defined AAI_NO_PAUSE pause
  exit /b 1
)

endlocal
