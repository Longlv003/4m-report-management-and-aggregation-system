@echo off
setlocal

echo ========================================================
echo        SCAN 4M - START SYSTEM
echo ========================================================
echo.

for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI\"
set "NODE_HOME=%ROOT_DIR%runtime\node\node-v22.14.0-win-x64"
set "NODE_EXE=%NODE_HOME%\node.exe"
set "NPM_CLI=%NODE_HOME%\node_modules\npm\bin\npm-cli.js"

if not exist "%NODE_EXE%" (
    echo [ERROR] Node.js not found: "%NODE_EXE%"
    if /i "%~1"=="--check" exit /b 1
    pause
    exit /b 1
)
if not exist "%NPM_CLI%" (
    echo [ERROR] npm not found: "%NPM_CLI%"
    if /i "%~1"=="--check" exit /b 1
    pause
    exit /b 1
)

set "PATH=%NODE_HOME%;%PATH%"
cd /d "%ROOT_DIR%"
if errorlevel 1 exit /b 1

rem Detect the LAN address each time, including after DHCP changes.
set "HOST_IP=127.0.0.1"
set "IP_FILE=%TEMP%\scan4m-ip-%RANDOM%-%RANDOM%.tmp"
"%NODE_EXE%" "%ROOT_DIR%scripts\detect-lan-ip.cjs" > "%IP_FILE%"
set /p "HOST_IP="<"%IP_FILE%"
del "%IP_FILE%" >nul 2>&1
set "SCAN4M_HOST_IP=%HOST_IP%"

rem Validate this batch file without starting services.
if /i "%~1"=="--check" (
    "%NODE_EXE%" --version
    if errorlevel 1 exit /b 1
    "%NODE_EXE%" "%NPM_CLI%" --version
    if errorlevel 1 exit /b 1
    "%NODE_EXE%" "%ROOT_DIR%scripts\start-services.cjs" --check
    if errorlevel 1 exit /b 1
    echo [OK] Runtime paths and batch parsing verified.
    echo [OK] Web URL: http://%HOST_IP%:5173
    exit /b 0
)

echo Starting backend and frontend in the background...
"%NODE_EXE%" "%ROOT_DIR%scripts\start-services.cjs"
if errorlevel 1 (
    echo [ERROR] Startup failed. Check data\logs for details.
    if /i "%~1"=="--background" exit /b 1
    pause
    exit /b 1
)

if /i "%~1"=="--background" exit /b 0

echo Opening browser...
start "" "http://%HOST_IP%:5173"
echo.
echo ========================================================
echo   Backend API : http://%HOST_IP%:4000
echo   Web UI      : http://%HOST_IP%:5173
echo   Services run in the background; this window can be closed.
echo   Logs: data\logs\backend-start.stdout.log
echo         data\logs\frontend-start.stdout.log
echo   To stop services, run scripts\stop-all.bat
echo ========================================================
pause
