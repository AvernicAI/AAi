@echo off
setlocal
cd /d "%~dp0"

rem Rebuild before packaging so an old bundle can never be shipped accidentally.
call "%~dp0build.bat" %*
exit /b %errorlevel%
