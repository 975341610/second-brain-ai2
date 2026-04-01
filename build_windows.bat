@echo off
setlocal enabledelayedexpansion
title Second Brain AI Windows Builder

set "ROOT=%~dp0"
set "OUT_DIR=C:\AI"
set "APP_DIR=%OUT_DIR%\SecondBrainAI"
set "SETUP_EXE=%OUT_DIR%\Setup.exe"
set "PORTABLE_ZIP=%OUT_DIR%\SecondBrainAI-portable.zip"
set "UPDATE_MANIFEST=%OUT_DIR%\update-manifest.json"
set "VENV_DIR=%ROOT%.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "APP_VERSION="

echo ==============================================
echo   Second Brain AI - Windows EXE Builder
echo ==============================================
echo.

call :resolve_python
if "%PY_CMD%"=="" call "%ROOT%setup_build_env.bat" --quiet
call :resolve_python
if "%PY_CMD%"=="" goto :missing_python

call :resolve_app_version
if "%APP_VERSION%"=="" goto :missing_version

call :resolve_npm
if "%NPM_CMD%"=="" call "%ROOT%setup_build_env.bat" --quiet
call :resolve_npm
if "%NPM_CMD%"=="" goto :missing_npm

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

echo Building version %APP_VERSION%
echo.

echo [1/8] Building frontend...
pushd "%ROOT%frontend"
if errorlevel 1 goto :unc_failed
call :run_npm install
if errorlevel 1 goto :build_failed
call :run_npm run build
if errorlevel 1 goto :build_failed
popd

echo [2/8] Preparing Python environment...
pushd "%ROOT%"
if errorlevel 1 goto :unc_failed
if not exist "%VENV_PY%" "%PY_CMD%" -m venv "%VENV_DIR%"
if errorlevel 1 goto :build_failed
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 goto :build_failed
"%VENV_PY%" -m pip install -r backend\requirements.txt pyinstaller
if errorlevel 1 goto :build_failed

echo [3/8] Staging frontend assets...
if exist frontend_dist rmdir /s /q frontend_dist
xcopy /e /i /y frontend\dist frontend_dist >nul
if errorlevel 1 goto :build_failed

echo [4/8] Cleaning old bundle...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo [5/8] Running PyInstaller...
"%VENV_PY%" -m PyInstaller second_brain_ai.spec --noconfirm --clean
if errorlevel 1 goto :build_failed

echo [6/8] Copying app to %APP_DIR% ...
if exist "%APP_DIR%" rmdir /s /q "%APP_DIR%"
mkdir "%APP_DIR%"
xcopy /e /i /y dist\SecondBrainAI "%APP_DIR%" >nul
if errorlevel 1 goto :build_failed
copy /y windows\Start SecondBrainAI.bat "%APP_DIR%\Start SecondBrainAI.bat" >nul
copy /y windows\README-Windows.txt "%APP_DIR%\README-Windows.txt" >nul

echo [7/8] Building Setup.exe installer...
call :find_inno_setup
if "%ISCC_EXE%"=="" call "%ROOT%setup_build_env.bat" --quiet
call :find_inno_setup
if "%ISCC_EXE%"=="" goto :missing_inno
if exist "%SETUP_EXE%" del /f /q "%SETUP_EXE%"
"%ISCC_EXE%" "/DMyAppVersion=%APP_VERSION%" "%ROOT%installer.iss"
if errorlevel 1 goto :build_failed

echo [8/8] Creating offline update assets...
if exist "%PORTABLE_ZIP%" del /f /q "%PORTABLE_ZIP%"
if exist "%UPDATE_MANIFEST%" del /f /q "%UPDATE_MANIFEST%"
powershell -NoProfile -Command "Compress-Archive -Path '%APP_DIR%\*' -DestinationPath '%PORTABLE_ZIP%' -Force"
if errorlevel 1 goto :build_failed
for %%F in ("%PORTABLE_ZIP%") do set "PORTABLE_SIZE=%%~zF"
for %%F in ("%SETUP_EXE%") do set "SETUP_SIZE=%%~zF"
for /f %%H in ('"%VENV_PY%" -c "import hashlib, pathlib; p=pathlib.Path(r'''%PORTABLE_ZIP%'''); print(hashlib.sha256(p.read_bytes()).hexdigest())"') do set "PORTABLE_SHA=%%H"
for /f %%H in ('"%VENV_PY%" -c "import hashlib, pathlib; p=pathlib.Path(r'''%SETUP_EXE%'''); print(hashlib.sha256(p.read_bytes()).hexdigest())"') do set "SETUP_SHA=%%H"
> "%UPDATE_MANIFEST%" (
  echo {
  echo   "version": "%APP_VERSION%",
  echo   "packages": [
  echo     {"kind": "portable_zip", "file": "SecondBrainAI-portable.zip", "sha256": "!PORTABLE_SHA!", "size_bytes": !PORTABLE_SIZE!},
  echo     {"kind": "setup_exe", "file": "Setup.exe", "sha256": "!SETUP_SHA!", "size_bytes": !SETUP_SIZE!}
  echo   ]
  echo }
)
if errorlevel 1 goto :build_failed
popd

echo.
echo Build finished successfully.
echo Version: %APP_VERSION%
echo EXE: %APP_DIR%\SecondBrainAI.exe
echo Launcher: %APP_DIR%\Start SecondBrainAI.bat
echo Installer: %SETUP_EXE%
echo Portable zip: %PORTABLE_ZIP%
echo Manifest: %UPDATE_MANIFEST%
echo.
pause
endlocal
exit /b 0

:resolve_python
set "PY_CMD="
where py >nul 2>nul
if not errorlevel 1 set "PY_CMD=py"
if defined PY_CMD goto :eof
if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "PY_CMD=%LocalAppData%\Programs\Python\Python311\python.exe"
if defined PY_CMD goto :eof
if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PY_CMD=%LocalAppData%\Programs\Python\Python312\python.exe"
goto :eof

:resolve_app_version
set "APP_VERSION="
for /f "usebackq tokens=2 delims==" %%V in (`findstr /b /c:"APP_VERSION =" "%ROOT%backend\version.py"`) do set "APP_VERSION=%%~V"
set "APP_VERSION=%APP_VERSION: =%"
set "APP_VERSION=%APP_VERSION:"=%"
set "APP_VERSION=%APP_VERSION:'=%"
goto :eof

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

:find_inno_setup
set "ISCC_EXE="
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC_EXE=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC_EXE=%ProgramFiles%\Inno Setup 6\ISCC.exe"
goto :eof

:missing_python
echo Python launcher ^(py^) was not found. Please install Python 3.11+ and try again.
echo Or run: setup_build_env.bat
echo Download: https://www.python.org/downloads/windows/
echo.
pause
endlocal
exit /b 1

:missing_version
echo Failed to resolve APP_VERSION from backend\version.py.
echo.
pause
endlocal
exit /b 1

:unc_failed
echo Unable to enter the project directory.
echo If you launched this from a WSL network path, copy the project to a normal Windows path first.
echo Recommended: C:\AI\second-brain-ai
echo.
pause
endlocal
exit /b 1

:missing_npm
echo npm was not found. Please install Node.js 20+ and try again.
echo Or run: setup_build_env.bat
echo Download: https://nodejs.org/
echo.
pause
endlocal
exit /b 1

:missing_inno
echo Inno Setup 6 was not found. Please install it and run build_windows.bat again.
echo Or run: setup_build_env.bat
echo Download: https://jrsoftware.org/isinfo.php
echo.
pause
endlocal
exit /b 1

:build_failed
echo.
echo Build failed. Read the errors above, fix them, and run this file again.
echo.
if exist "%ROOT%frontend\node_modules\npm" (
  echo Detected a broken local npm package under frontend\node_modules.
  echo Delete frontend\node_modules and rerun one_click_install.bat if this keeps happening.
  echo.
)
pause
endlocal
exit /b 1
