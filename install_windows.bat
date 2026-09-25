@echo off
rem Zhuge Liang Sangso - register the daily 7AM task (double-click to run)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\windows_install.ps1" %*
pause
