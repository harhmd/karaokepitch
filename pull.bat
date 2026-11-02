@echo off
echo ========================================================
echo  Pulling KaraokePitch from GitHub: harhmd/karaokepitch
echo ========================================================
cd /d "%~dp0"
git pull origin main
echo ========================================================
echo Done!
pause
