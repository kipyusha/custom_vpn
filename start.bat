@echo off
setlocal
cd /d "%~dp0"

set "EXE=src-tauri\target\release\custom-vpn.exe"

if not exist "%EXE%" (
    echo [CustomVPN] Release exe not found, building...
    call npm run tauri build
    if errorlevel 1 (
        echo [CustomVPN] Build failed. Make sure Node.js and Rust are installed.
        pause
        exit /b 1
    )
)

if not exist "%EXE%" (
    echo [CustomVPN] Executable not found: %EXE%
    pause
    exit /b 1
)

echo [CustomVPN] Starting...
start "" "%EXE%"
timeout /t 1 /nobreak >nul
exit /b 0