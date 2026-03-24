@echo off
setlocal enabledelayedexpansion
title Second Brain AI - Fast Update
cd /d "%~dp0"

set "ROOT=%~dp0"
set "OUT_DIR=C:\AI"
set "APP_DIR=%OUT_DIR%\SecondBrainAI"
set "VENV_PY=%ROOT%.venv\Scripts\python.exe"

echo ==============================================
echo   Second Brain AI - 智能热更新
echo ==============================================
echo.

if not exist "%VENV_PY%" (
    echo [!] 虚拟环境不存在，请先运行一次 build_windows.bat
    pause
    exit /b 1
)

echo [1/4] 正在清理旧的构建缓存...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo [2/4] 智能检测前端是否需要重新构建...

:: 默认不构建
set "BUILD_FRONTEND=0"

:: 用 PowerShell 检测：frontend/src 中是否有比 frontend_dist 更新的文件
if not exist "%ROOT%frontend_dist" (
    echo [*] 未找到 frontend_dist，强制构建前端...
    set "BUILD_FRONTEND=1"
) else (
    for /f %%R in ('powershell -NoProfile -Command "if ((Get-ChildItem -Recurse '%ROOT%frontend\src' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime -gt (Get-ChildItem -Recurse '%ROOT%frontend_dist' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime) { echo 1 } else { echo 0 }"') do set "BUILD_FRONTEND=%%R"

    if "!BUILD_FRONTEND!"=="1" (
        echo [*] 检测到前端源码有更新，将重新构建...
    ) else (
        echo [*] 前端代码无变化，跳过构建。
    )
)

if "!BUILD_FRONTEND!"=="1" (
    echo [*] 正在执行前端构建 npm run build...
    cd /d "%ROOT%frontend"
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
)

echo [3/4] 正在重新打包后端 EXE...
"%VENV_PY%" -m PyInstaller second_brain_ai.spec --noconfirm --clean
if errorlevel 1 (
    echo [!] 打包失败，请检查报错。
    pause
    exit /b 1
)

echo [4/4] 正在覆盖更新到 %APP_DIR% ...
taskkill /f /im SecondBrainAI.exe >nul 2>nul
timeout /t 1 >nul

xcopy /e /i /y dist\SecondBrainAI "%APP_DIR%" >nul
if errorlevel 1 (
    echo [!] 覆盖失败！请确保程序已完全关闭，或尝试以管理员权限运行。
    pause
    exit /b 1
)

echo.
echo ==============================================
echo   ✨ 更新完成！
echo   程序位置: %APP_DIR%
echo ==============================================
echo.
pause
exit /b 0
