@echo off
setlocal enabledelayedexpansion
title Second Brain AI - Fast Update
cd /d "%~dp0"

set "ROOT=%~dp0"
set "OUT_DIR=C:\AI"
set "APP_DIR=%OUT_DIR%\SecondBrainAI"
set "VENV_PY=%ROOT%.venv\Scripts\python.exe"
set "VERSION=unknown"
if exist "%ROOT%VERSION.txt" (
    for /f "usebackq delims=" %%v in ("%ROOT%VERSION.txt") do set "VERSION=%%v"
)

:: 获取 Git Hash
set "GIT_HASH=unknown"
for /f "tokens=*" %%i in ('git rev-parse --short HEAD 2^>nul') do set "GIT_HASH=%%i"

:: 生成 metadata.json
echo { "version": "!VERSION!", "git_commit": "!GIT_HASH!", "build_time": "%date% %time%" } > "%ROOT%metadata.json"

:: 强制杀掉旧实例，防止文件被占用
taskkill /F /IM SecondBrainAI.exe /T >nul 2>&1

echo ==============================================
echo   Second Brain AI - 智能热更新 (!VERSION!)
echo ==============================================
echo.

if not exist "%VENV_PY%" (
    echo [!] 虚拟环境不存在，请先运行一次 build_windows.bat
    pause
    exit /b 1
)

echo [1/4] 正在清理旧的构建缓存并同步环境...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
"%VENV_PY%" -m pip install fastapi "uvicorn[standard]" keyboard plyer --upgrade

echo [2/4] 正在强制构建前端...
cd /d "%ROOT%frontend"
echo [*] 正在运行 npm install...
call npm install
echo [*] 正在运行 npm run build...
call npm run build
if errorlevel 1 (
    echo [!] 前端构建失败，请检查 Node.js 环境。
    pause
    exit /b 1
)
cd /d "%ROOT%"
if exist "frontend_dist" rmdir /s /q "frontend_dist"
mkdir "frontend_dist"
xcopy /e /i /y "frontend\dist" "frontend_dist" >nul
echo [*] 前端构建完成，产物已同步到 frontend_dist。

echo [3/4] 正在重新打包后端 EXE...
"%VENV_PY%" -m PyInstaller second_brain_ai.spec --noconfirm --clean
if errorlevel 1 (
    echo [!] 打包失败，请检查报错。
    pause
    exit /b 1
)

:: 显式删除根目录下的冗余单体 EXE，以防混淆
if exist "dist\SecondBrainAI.exe" del /f /q "dist\SecondBrainAI.exe"

echo [4/4] 正在覆盖更新到 %APP_DIR% ...
taskkill /f /im SecondBrainAI.exe /t >nul 2>nul
timeout /t 1 >nul

:: 记录日志信息
echo [*] 正在同步构建产物...
echo     - 源路径:   %ROOT%dist\SecondBrainAI
echo     - 目标路径: %APP_DIR%
echo     - 版本号:   !VERSION!

:: 显式删除目标路径下可能残余的旧版单文件 exe (防止运行错误)
if exist "%APP_DIR%.exe" (
    echo [*] 正在清理旧版单文件 EXE...
    del /f /q "%APP_DIR%.exe"
)

:: 使用 robocopy 并检查严格错误码 (GEQ 8)
robocopy "dist\SecondBrainAI" "%APP_DIR%" /E /IS /IT /R:3 /W:5 >nul
if %ERRORLEVEL% GEQ 8 (
    echo.
    echo [!] ==================================================
    echo [!] 覆盖失败！(Robocopy ErrorLevel: %ERRORLEVEL%)
    echo [!] 请确保程序 %APP_DIR%\SecondBrainAI.exe 已完全关闭。
    echo [!] 请尝试以管理员权限运行此脚本。
    echo [!] ==================================================
    echo.
    pause
    exit /b 1
)

echo.
echo ==============================================
echo   ✨ 更新完成！
echo ==============================================
echo   当前运行信息 (自证):
set "TARGET_EXE=%APP_DIR%\SecondBrainAI.exe"
if exist "%TARGET_EXE%" (
    for %%I in ("%TARGET_EXE%") do (
        echo   - 绝对路径: %%~fI
        echo   - 修改时间: %%~tI
        echo   - 文件大小: %%~zI bytes
    )
    echo   - 版本号:   !VERSION!
    echo   - Git Hash: !GIT_HASH!
) else (
    echo   [!] 警告: 未在预期位置找到 EXE: %TARGET_EXE%
)
echo ==============================================
echo.
pause
exit /b 0
