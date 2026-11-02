@echo off
title Penny Kopru
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js kurulu degil. https://nodejs.org adresinden LTS surumunu kurun, sonra bunu yeniden acin.
    pause
    exit /b 1
)

node penny-kopru.mjs %*
pause
