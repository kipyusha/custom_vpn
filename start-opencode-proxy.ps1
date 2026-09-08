# Запуск opencode через CustomVPN (127.0.0.1:2080)
# Требуется: CustomVPN подключен + opencode.ai = через VPN (тумблер в Правилах)
$env:HTTPS_PROXY="http://127.0.0.1:2080"
$env:HTTP_PROXY="http://127.0.0.1:2080"
$env:https_proxy="http://127.0.0.1:2080"
$env:http_proxy="http://127.0.0.1:2080"
$env:NO_PROXY="localhost,127.0.0.1,::1"
$env:no_proxy="localhost,127.0.0.1,::1"
Write-Host "[CustomVPN] Proxy http://127.0.0.1:2080 включен для opencode" -ForegroundColor Green
Write-Host "[CustomVPN] NO_PROXY=$env:NO_PROXY"

if (Get-Command opencode -ErrorAction SilentlyContinue) {
  Write-Host "Запуск: opencode $args" -ForegroundColor Cyan
  & opencode @args
} elseif (Test-Path "$env:LOCALAPPDATA\OpenCode\opencode-cli.exe") {
  Write-Host "Запуск: opencode-cli.exe $args" -ForegroundColor Cyan
  & "$env:LOCALAPPDATA\OpenCode\opencode-cli.exe" @args
} else {
  Write-Host "[Ошибка] opencode не найден. Установи opencode или добавь в PATH" -ForegroundColor Red
  Write-Host "Для OpenCode Desktop: задай системные переменные HTTPS_PROXY/NO_PROXY и перезапусти приложение"
}
