@echo off
setlocal enabledelayedexpansion
title Second Brain AI Windows Builder

set "ROOT=%~dp0"
set "OUT_DIR=C:\AI"
set "APP_DIR=%OUT_DIR%\SecondBrainAI"
set "DIST_DIR=%ROOT%dist"
set "SETUP_EXE=%DIST_DIR%\Second Brain AI Setup 1.0.0.exe"
set "PORTABLE_ZIP=%DIST_DIR%\Second Brain AI 1.0.0.zip"
set "VERSION=unknown"
if exist "%ROOT%VERSION.txt" (
    for /f "usebackq delims=" %%v in ("%ROOT%VERSION.txt") do set "VERSION=%%v"
)

call :resolve_npm
if "%NPM_CMD%"=="" call "%ROOT%setup_build_env.bat" --quiet
call :resolve_npm
if "%NPM_CMD%"=="" goto :missing_npm

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

pushd "%ROOT%"
if errorlevel 1 goto :unc_failed

echo ==============================================
echo   Second Brain AI - Windows Electron Builder
echo   Version: !VERSION!
echo ==============================================
echo.

echo [1/6] Installing root desktop dependencies...
call :run_npm install --legacy-peer-deps
if errorlevel 1 goto :build_failed

echo [2/6] Building frontend...
call :run_npm run build:frontend
if errorlevel 1 goto :build_failed

echo [3/6] Building Python backend sidecar...
call :run_npm run build:backend
if errorlevel 1 goto :build_failed

echo [4/6] Building Electron app...
call :run_npm run build:electron
if errorlevel 1 goto :build_failed

echo [5/6] Copying frontend assets into Electron output...
call :run_npm run copy:frontend
if errorlevel 1 goto :build_failed

echo [6/6] Building Windows installer and portable zip...
call :run_npm run build:builder
if errorlevel 1 goto :build_failed

if exist "%APP_DIR%" rmdir /s /q "%APP_DIR%"
mkdir "%APP_DIR%"
xcopy /e /i /y "%DIST_DIR%\win-unpacked\*" "%APP_DIR%" >nul
if errorlevel 1 goto :build_failed

set "SETUP_EXE=%DIST_DIR%\Second Brain AI Setup !VERSION!.exe"
set "PORTABLE_ZIP=%DIST_DIR%\Second Brain AI !VERSION!.zip"

echo.
echo Build finished successfully.
echo Portable app: %APP_DIR%\Second Brain AI.exe
echo Installer: %SETUP_EXE%
echo Portable zip: %PORTABLE_ZIP%
echo.
pause
popd
endlocal
exit /b 0

:resolve_npm
set "NPM_CMD="
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do (
  set "NPM_CMD=%%I"
  goto :eof
)
for /f "delims=" %%I in ('where npm 2^>nul') do (
  set "NPM_CMD=%%I"
  goto :eof
)
if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
if defined NPM_CMD goto :eof
if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"
goto :eof

:run_npm
if "%NPM_CMD%"=="" exit /b 1
call "%NPM_CMD%" %*
exit /b %ERRORLEVEL%

:unc_failed
echo Unable to enter the project directory.
echo If you launched this from a WSL network path, copy the project to a normal Windows path first.
echo Recommended: C:\AI\second-brain-ai
echo.
pause
endlocal
exit /b 1

:missing_npm
echo npm was not found. Please install Node.js LTS and try again.
echo Or run: setup_build_env.bat
echo.
pause
endlocal
exit /b 1

:build_failed
echo.
echo Build failed. Read the errors above, fix them, and run this file again.
echo.
pause
popd
endlocal
exit /b 1
