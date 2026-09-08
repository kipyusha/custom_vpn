# Собирает портабл-версию из свежего билда.
# Использование из корня репозитория:
#   powershell -ExecutionPolicy Bypass -File packaging/package-portable.ps1
param(
    [string]$OutZip = "CustomVPN-Portable.zip",
    [string]$OutDir = "CustomVPN-Portable"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Copy-Item -LiteralPath "src-tauri/target/release/custom-vpn.exe" -Destination (Join-Path $OutDir "CustomVPN.exe") -Force
Copy-Item -LiteralPath "src-tauri/binaries/sing-box-x86_64-pc-windows-msvc.exe" -Destination (Join-Path $OutDir "sing-box.exe") -Force
Copy-Item -LiteralPath "src-tauri/resources/libcronet.dll" -Destination (Join-Path $OutDir "libcronet.dll") -Force
Copy-Item -LiteralPath "packaging/CustomVPN.bat" -Destination (Join-Path $OutDir "CustomVPN.bat") -Force
Copy-Item -LiteralPath "packaging/README.txt" -Destination (Join-Path $OutDir "README.txt") -Force
Remove-Item -LiteralPath $OutZip -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $OutZip -Force
Get-Item $OutZip | Format-Table Name, Length, LastWriteTime
