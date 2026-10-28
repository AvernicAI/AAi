@echo off
setlocal
cd /d "%~dp0"

call "%~dp0script\windows-env.bat"
if errorlevel 1 exit /b 1
echo [AAi] Starting the web app in development mode...
"%AAI_BUN%" run script/windows.ts web %*
if errorlevel 1 (
  echo [AAi] Web development session exited with an error.
  if not defined AAI_NO_PAUSE pause
  exit /b 1
)

endlocal
