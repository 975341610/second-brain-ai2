@echo off
setlocal
title Second Brain AI Build Dependency Installer

set "QUIET=0"
if /i "%~1"=="--quiet" set "QUIET=1"

echo ==============================================
echo   Second Brain AI - Build Dependency Installer
echo ==============================================
echo.

where winget >nul 2>nul
if errorlevel 1 goto :missing_winget

echo Installing Python 3...
winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo Python install may already be present or requires attention.

echo.
echo Installing Node.js LTS...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo Node.js install may already be present or requires attention.

echo.
echo Installing Inno Setup 6...
winget install -e --id JRSoftware.InnoSetup --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo Inno Setup install may already be present or requires attention.

echo.
echo Done. Please close this window, open a new terminal or Explorer session, then run:
echo build_windows.bat
echo.
if "%QUIET%"=="0" pause
endlocal
exit /b 0

:missing_winget
echo winget was not found on this Windows machine.
echo Please install these manually, then run build_windows.bat:
echo - Python 3.11+
echo - Node.js LTS
echo - Inno Setup 6
echo.
if "%QUIET%"=="0" pause
endlocal
exit /b 1
