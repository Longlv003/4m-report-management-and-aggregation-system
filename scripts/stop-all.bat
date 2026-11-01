@echo off
setlocal
echo ========================================================
echo        SCAN 4M - STOP SYSTEM
echo ========================================================
echo.

echo Stopping Backend on port 4000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Stopping Frontend on port 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Stop commands completed.
pause
