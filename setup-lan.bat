@echo off
REM ---------------------------------------------------------------
REM  One-time setup so other devices on the LAN can reach JARVIS.
REM  Double-click this. It will ask for administrator rights.
REM
REM  Does two things:
REM    1. Trusts Caddy's root certificate on THIS PC
REM    2. Opens ports 80 and 443 to the local subnet only
REM ---------------------------------------------------------------

cd /d "%~dp0"

REM Re-launch elevated if we are not already.
net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo   Running as administrator.
echo.

if not exist "root.crt" (
  echo   ERROR: root.crt not found in %CD%
  echo   Extract it first:  docker cp jarvis-caddy:/data/caddy/pki/authorities/local/root.crt .\root.crt
  echo.
  pause
  exit /b 1
)

echo   [1/2] Trusting Caddy's root certificate...
certutil -addstore -f "Root" "root.crt"
if errorlevel 1 (echo         FAILED) else (echo         done)
echo.

echo   [2/2] Opening ports 80 and 443 to the local subnet...
REM Remove any previous copies first so re-running does not stack duplicates.
netsh advfirewall firewall delete rule name="JARVIS Caddy HTTPS" >nul 2>&1
netsh advfirewall firewall delete rule name="JARVIS Caddy HTTP" >nul 2>&1

netsh advfirewall firewall add rule name="JARVIS Caddy HTTPS" dir=in action=allow protocol=TCP localport=443 remoteip=LocalSubnet >nul
if errorlevel 1 (echo         443 FAILED) else (echo         443 open  ^(local subnet only^))

netsh advfirewall firewall add rule name="JARVIS Caddy HTTP" dir=in action=allow protocol=TCP localport=80 remoteip=LocalSubnet >nul
if errorlevel 1 (echo         80 FAILED) else (echo         80 open   ^(local subnet only^))

echo.
echo   ------------------------------------------------------------
echo    Done. Now QUIT CHROME COMPLETELY and reopen it - it caches
echo    certificate decisions, so refreshing alone will not clear
echo    the warning.
echo.
echo    Then open:  https://192.168.0.243/
echo.
echo    On phones and tablets, install the certificate separately
echo    from http://192.168.0.243/root.crt - see LAN-SETUP.md
echo   ------------------------------------------------------------
echo.
pause
