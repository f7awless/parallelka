@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ХимКабинет
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не установлен. Скачайте версию LTS с https://nodejs.org , установите и запустите этот файл снова.
  start "" https://nodejs.org
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Нужен Node.js версии 22.13 или новее. Обновите его с https://nodejs.org
  start "" https://nodejs.org
  pause
  exit /b 1
)
set OPEN=1
node --disable-warning=ExperimentalWarning server/server.js
pause
