@echo off
echo ========================================================
echo  Starting KaraokePitch Preview Server on Port 8080
echo  Open your browser at: http://localhost:8080
echo ========================================================
cd /d "%~dp0"
node server.js
pause
