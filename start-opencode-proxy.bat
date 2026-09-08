@echo off
REM Запуск opencode через CustomVPN прокси (127.0.0.1:2080)
REM Требуется: CustomVPN подключен + сайт opencode.ai включен "через VPN"
set "HTTPS_PROXY=http://127.0.0.1:2080"
set "HTTP_PROXY=http://127.0.0.1:2080"
set "https_proxy=http://127.0.0.1:2080"
set "http_proxy=http://127.0.0.1:2080"
set "NO_PROXY=localhost,127.0.0.1,::1"
set "no_proxy=localhost,127.0.0.1,::1"
echo [CustomVPN] Proxy http://127.0.0.1:2080 -> opencode
echo [CustomVPN] NO_PROXY=%NO_PROXY%
echo.

REM Попробуем CLI
where opencode >nul 2>&1
if %errorlevel%==0 (
  echo Запуск: opencode %*
  opencode %*
  goto :eof
)

REM Fallback: OpenCode Desktop CLI
if exist "%LOCALAPPDATA%\OpenCode\opencode-cli.exe" (
  echo Запуск: opencode-cli.exe %*
  "%LOCALAPPDATA%\OpenCode\opencode-cli.exe" %*
  goto :eof
)

echo [Ошибка] opencode не найден в PATH.
echo Установи opencode или добавь в PATH, либо запусти OpenCode Desktop вручную
echo после установки переменных окружения в системе:
echo   HTTPS_PROXY=http://127.0.0.1:2080 и NO_PROXY=localhost,127.0.0.1
pause
