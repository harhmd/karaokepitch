@echo off
echo ========================================================
echo  Starting KaraokePitch Preview Server on Port 3001
echo  Open your browser at: http://localhost:3001
echo ========================================================
cd /d "%~dp0"
node server.js
pause
