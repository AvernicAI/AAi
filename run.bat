@echo off
setlocal
cd /d "%~dp0"

call "%~dp0script\windows-env.bat"
if errorlevel 1 goto failed
"%AAI_BUN%" run script/windows.ts run %*
if errorlevel 1 (
  goto failed
)

exit /b 0

:failed
echo [AAi] Desktop launch failed. Run build.bat if the executable is missing.
if not defined AAI_NO_PAUSE pause
exit /b 1
