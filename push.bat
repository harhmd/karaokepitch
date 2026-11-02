@echo off
echo ========================================================
echo  Publishing KaraokePitch to GitHub: harhmd/karaokepitch
echo ========================================================
cd /d "%~dp0"
node github-publish.js
pause
