@echo off
setlocal
cd /d "%~dp0"

call "%~dp0script\windows-env.bat"
if errorlevel 1 goto failed
if "%~1"=="--help" "%AAI_BUN%" run script/windows.ts build --help
if "%~1"=="--help" exit /b %errorlevel%
echo [AAi] Building the CLI, desktop app, and Windows installer...
"%AAI_BUN%" run script/windows.ts build %*
if errorlevel 1 (
  goto failed
)

echo [AAi] Build complete. Use run.bat for the desktop or run-cli.bat for the terminal.
exit /b 0

:failed
echo [AAi] Build failed. See the error above.
if not defined AAI_NO_PAUSE pause
exit /b 1
