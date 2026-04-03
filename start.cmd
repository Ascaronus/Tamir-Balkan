@echo off
setlocal
cd /d %~dp0

echo Starting Tamir Balkan (docker + backend + frontend)...
echo.
echo If Docker Desktop is not running, start it first.
echo.

call npm run dev

