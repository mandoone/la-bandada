#!/usr/bin/env bash
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$HOME/la-bandada"

mkdir -p "$HOME/la-bandada/logs"

echo "===== INICIO $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$HOME/la-bandada/logs/cron-scraper.log"
node scraper-dlds.js >> "$HOME/la-bandada/logs/cron-scraper.log" 2>&1
node migrar-a-neon.js >> "$HOME/la-bandada/logs/cron-scraper.log" 2>&1
echo "===== FIN $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$HOME/la-bandada/logs/cron-scraper.log"
