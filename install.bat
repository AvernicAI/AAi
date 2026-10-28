@echo off
setlocal
cd /d "%~dp0"

call "%~dp0script\windows-env.bat"
if errorlevel 1 goto failed

echo [AAi] Installing workspace dependencies...
"%AAI_BUN%" run script/windows.ts install %*
if errorlevel 1 (
  echo [AAi] Install failed.
  if not defined AAI_NO_PAUSE pause
  exit /b 1
)

echo [AAi] Dependencies installed.
endlocal
exit /b 0

:failed
if not defined AAI_NO_PAUSE pause
exit /b 1
