@echo off
rem Called inside each launcher's setlocal so PATH changes stay local to that launcher.
set "AAI_BUN="
where bun >nul 2>nul
if errorlevel 1 set "PATH=%USERPROFILE%\.bun\bin;%APPDATA%\npm;%PATH%"
where bun >nul 2>nul
if errorlevel 1 (
  echo [AAi] Bun is missing. Install the version in package.json from https://bun.sh.
  exit /b 1
)

rem npm installs Bun behind a .cmd shim. Child tools need the native executable on PATH.
for /f "delims=" %%B in ('bun -p "process.execPath"') do set "AAI_BUN=%%B"
if not defined AAI_BUN exit /b 1
for %%B in ("%AAI_BUN%") do set "PATH=%%~dpB;%PATH%"
exit /b 0
