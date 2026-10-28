@echo off
setlocal
cd /d "%~dp0"

call "%~dp0script\windows-env.bat"
if errorlevel 1 exit /b 1
echo [AAi] Syncing with upstream OpenCode...
"%AAI_BUN%" run script/windows.ts sync %*
if errorlevel 1 (
  echo [AAi] Sync stopped. Read the messages above before retrying.
  if not defined AAI_NO_PAUSE pause
  exit /b 1
)

echo [AAi] Sync complete. Nothing was pushed.
endlocal
