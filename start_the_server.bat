@echo off
REM ---------------------------------------------------------------
REM  Serve the JARVIS app and open it in the browser.
REM
REM  The app MUST be reached on "localhost". Chrome only grants the
REM  microphone and Web Bluetooth on localhost or real HTTPS - over
REM  a LAN address like 192.168.1.50 it silently refuses both.
REM ---------------------------------------------------------------

REM Serve THIS folder, whatever directory we happen to be launched from.
cd /d "%~dp0"

REM Sanity check: are we actually next to the app?
if not exist "index.html" (
  echo.
  echo   ERROR: index.html not found in:
  echo   %CD%
  echo.
  echo   This .bat must sit in the same folder as the app.
  echo.
  pause
  exit /b 1
)

REM Refuse to start a second server on a port that is already taken.
netstat -ano | find ":8000" | find "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo   Port 8000 is already in use - a server is probably running.
  echo   Just open  http://localhost:8000/  in the browser,
  echo   or close the other server window and run this again.
  echo.
  pause
  exit /b 1
)

REM Warn if Ollama is down. JARVIS will still boot and run the helmet,
REM but every open-ended question will fail.
REM curl, not PowerShell: a cold powershell.exe spends seconds on proxy
REM auto-discovery and times out against localhost, giving a false warning.
curl -s -o nul -m 3 http://localhost:11434/api/tags
if errorlevel 1 (
  echo.
  echo   WARNING: Ollama is not responding on port 11434.
  echo   Local commands will work; questions will not.
  echo.
)

REM Open the browser a moment after the server below starts listening.
REM This has to happen in a separate window because "py -m http.server"
REM blocks this one - which is why the original script's browser line
REM was never reached.
start /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000/"

echo.
echo   JARVIS  -  serving %CD%
echo   http://localhost:8000/
echo.
echo   Leave this window open. Close it or press Ctrl+C to stop.
echo.

py -m http.server 8000
