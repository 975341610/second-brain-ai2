@echo off
setlocal
title Second Brain AI One-Click EXE Packager

set "ROOT=%~dp0"
set "OUT_DIR=C:\AI"
set "APP_DIR=%OUT_DIR%\SecondBrainAI"
set "SETUP_EXE=%OUT_DIR%\Setup.exe"
set "PORTABLE_ZIP=%OUT_DIR%\SecondBrainAI-portable.zip"
set "UPDATE_MANIFEST=%OUT_DIR%\update-manifest.json"

echo ==================================================
echo   Second Brain AI - One-Click EXE Packager
echo ==================================================
echo.
echo This script will:
echo   1. install missing build dependencies if needed
echo   2. build the frontend
echo   3. package the desktop app into SecondBrainAI.exe
echo   4. generate Setup.exe and portable update assets
echo.
echo Output directory: %OUT_DIR%
echo.

if "%ROOT:~0,2%"=="\\" goto :unc_path

call "%ROOT%build_windows.bat"
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" goto :build_failed

echo.
echo ==================================================
echo Build completed successfully.
echo ==================================================
echo EXE:          %APP_DIR%\SecondBrainAI.exe
echo Launcher:     %APP_DIR%\Start SecondBrainAI.bat
echo Installer:    %SETUP_EXE%
echo Portable ZIP: %PORTABLE_ZIP%
echo Manifest:     %UPDATE_MANIFEST%
echo.
echo You can now distribute either:
echo   - %SETUP_EXE%
echo   - %PORTABLE_ZIP%
echo.
pause
endlocal
exit /b 0

:unc_path
echo This script is running from a network or WSL-mounted path.
echo Copy the project to a normal Windows path first, for example:
echo   C:\AI\second-brain-ai
echo Then run this file again.
echo.
pause
endlocal
exit /b 1

:build_failed
echo.
echo Packaging failed. Review the logs above, fix the issue, then run this file again.
echo.
pause
endlocal
exit /b %RESULT%
