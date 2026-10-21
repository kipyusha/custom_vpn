@echo off
setlocal
cd /d "%~dp0"

rem Old portable builds share the WebView2 profile; the new build uses its own.
tasklist /FI "IMAGENAME eq CustomVPN.exe" 2>nul | find /I "CustomVPN.exe" >nul
if not errorlevel 1 (
    echo [CustomVPN] Note: old portable CustomVPN.exe is running.
    echo The new window will use a separate WebView2 profile.
)

set "EXE=%~dp0src-tauri\target\release\custom-vpn.exe"

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

echo [CustomVPN] Starting: %EXE%
start "" /d "%~dp0" "%EXE%"

rem timeout cannot wait when stdin is redirected (CI, some launchers).
ping -n 3 127.0.0.1 >nul

tasklist /FI "IMAGENAME eq custom-vpn.exe" 2>nul | find /I "custom-vpn.exe" >nul
if errorlevel 1 (
    echo [CustomVPN] Failed to start. Run the exe directly to see the error:
    echo   %EXE%
    pause
    exit /b 1
)

exit /b 0
