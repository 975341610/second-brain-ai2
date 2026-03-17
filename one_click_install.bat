@echo off
setlocal
title Second Brain AI One-Click Installer

echo ==============================================
echo   Second Brain AI - One-Click Installer
echo ==============================================
echo.
echo This will install build dependencies if needed,
echo build the app, and generate C:\AI\Setup.exe
echo.

call "%~dp0build_windows.bat"
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" (
  echo.
  echo One-click install failed. Review the logs above.
  if exist "%~dp0build_windows.bat" pause
  endlocal
  exit /b %RESULT%
)

echo.
echo Done. Run the installer here:
echo C:\AI\Setup.exe
echo.
pause
endlocal
exit /b 0
