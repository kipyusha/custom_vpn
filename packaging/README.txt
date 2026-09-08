CustomVPN - portable version
=============================

How to run
----------
1. Extract the whole archive to any folder (do NOT run from inside the zip).
2. Double-click CustomVPN.bat.
3. The app window opens.

If Windows shows "Windows protected your PC" (SmartScreen),
click "More info" -> "Run anyway". The program is not digitally signed.

Requirements
------------
- Windows 10 or 11 (WebView2 runtime must be present - it is preinstalled
  on most systems).
- A VPN profile. The app does not ship with one: paste your own
  vless:// link (or JSON config) on the "Connection" tab, then
  press "Save profile" and "Connect".
  Example: vless://uuid@server:443?security=reality&sni=...#Name

Notes
-----
- Proxy mode (no admin rights needed).
- All settings are stored in the app config folder, not in this folder.
- Telegram Desktop: add "Telegram.exe" under Rules -> Apps -> Via VPN
  to route Telegram traffic through the VPN.
