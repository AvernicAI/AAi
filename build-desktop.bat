@echo off
setlocal
cd /d "%~dp0"

rem The desktop always ships with a matching CLI and a fresh installer.
call "%~dp0build.bat" %*
exit /b %errorlevel%
