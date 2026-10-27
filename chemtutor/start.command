#!/bin/bash
# ХимКабинет: запуск на Mac/Linux двойным щелчком (или ./start.command в терминале)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не установлен. Скачайте версию LTS с https://nodejs.org и запустите снова."
  open https://nodejs.org 2>/dev/null || xdg-open https://nodejs.org 2>/dev/null
  read -r -p "Нажмите Enter, чтобы закрыть"
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Нужен Node.js версии 22.13 или новее. Обновите его с https://nodejs.org"
  read -r -p "Нажмите Enter, чтобы закрыть"
  exit 1
fi
OPEN=1 node --disable-warning=ExperimentalWarning server/server.js
