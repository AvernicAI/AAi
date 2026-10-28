@echo off
setlocal
cd /d "%~dp0"

call "%~dp0script\windows-env.bat"
if errorlevel 1 exit /b 1
echo [AAi] Starting the desktop app in development mode...
"%AAI_BUN%" run script/windows.ts desktop-dev %*
if errorlevel 1 (
  echo [AAi] Desktop development session exited with an error.
  if not defined AAI_NO_PAUSE pause
  exit /b 1
)

endlocal
