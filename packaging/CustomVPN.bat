@echo off
title CustomVPN
if not exist "%~dp0CustomVPN.exe" (
  echo [ERROR] CustomVPN.exe not found next to this file.
  echo Make sure the archive is fully extracted before running.
  pause
  exit /b 1
)
if not exist "%~dp0sing-box.exe" (
  echo [ERROR] sing-box.exe is missing. Re-download the archive.
  pause
  exit /b 1
)
start "" "%~dp0CustomVPN.exe"
