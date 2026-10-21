@echo off
title CustomVPN
setlocal
cd /d "%~dp0"

set "APP=%~dp0CustomVPN.exe"
if not exist "%APP%" set "APP=%~dp0..\src-tauri\target\release\custom-vpn.exe"

if not exist "%APP%" (
  echo [ERROR] CustomVPN.exe not found next to this file.
  echo Make sure the archive is fully extracted before running.
  pause
  exit /b 1
)

if not exist "%~dp0sing-box.exe" (
  if /I "%APP%"=="%~dp0CustomVPN.exe" (
    echo [ERROR] sing-box.exe is missing. Re-download the archive.
    pause
    exit /b 1
  )
)

start "" /d "%~dp0" "%APP%"
