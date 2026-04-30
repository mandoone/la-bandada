#!/usr/bin/env bash

# Variables
PROJECT_DIR="/home/ubuntu/la-bandada"
LOG_DIR="$PROJECT_DIR/logs"
STATUS_FILE="$LOG_DIR/last-run-status.json"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$PROJECT_DIR" || exit 1
mkdir -p "$LOG_DIR"

FECHA_INICIO=$(date --iso-8601=seconds)
TS_INICIO=$(date +%s)

echo "===== INICIO $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG_DIR/cron-scraper.log"

SCRAPER_EXIT=0
MIGRACION_EXIT=0

if [ "$STATUS_TEST_MODE" = "1" ]; then
    echo "Modo de prueba activado. No se ejecuta scraper." >> "$LOG_DIR/cron-scraper.log"
else
    set +e
    node scraper-dlds.js >> "$LOG_DIR/cron-scraper.log" 2>&1
    SCRAPER_EXIT=$?
    set -e
fi

generar_json() {
    local resultado=$1
    local msg=$2
    
    local vigentes=0
    local ocultos=0
    
    # Consultar base de datos
    vigentes=$(sudo -u postgres psql -d labandada_stock -tAc "SELECT COUNT(*) FROM products_raw WHERE provider_id = 1 AND estado = 'Vigente';" 2>/dev/null || echo 0)
    ocultos=$(sudo -u postgres psql -d labandada_stock -tAc "SELECT COUNT(*) FROM products_raw WHERE provider_id = 1 AND estado = 'Oculto';" 2>/dev/null || echo 0)
    
    # Limpiar posibles espacios
    vigentes=$(echo "$vigentes" | xargs)
    ocultos=$(echo "$ocultos" | xargs)
    
    if ! [[ "$vigentes" =~ ^[0-9]+$ ]]; then vigentes=0; fi
    if ! [[ "$ocultos" =~ ^[0-9]+$ ]]; then ocultos=0; fi
    
    local total=$((vigentes + ocultos))
    local ts_fin=$(date +%s)
    local fecha_fin=$(date --iso-8601=seconds)
    local duracion=$((ts_fin - TS_INICIO))
    
    local horas=$((duracion / 3600))
    local minutos=$(( (duracion % 3600) / 60 ))
    local segundos=$((duracion % 60))
    local dur_texto="${horas}h ${minutos}m ${segundos}s"
    
    local msg_json="null"
    if [ "$msg" != "null" ]; then
        msg_json="\"$msg\""
    fi
    
    local extra_json=""
    if [ "$STATUS_TEST_MODE" = "1" ]; then
        extra_json=', "modo": "test"'
    fi

    cat > "$STATUS_FILE" <<EOF
{
  "fecha_inicio": "$FECHA_INICIO",
  "fecha_fin": "$fecha_fin",
  "duracion_segundos": $duracion,
  "duracion_texto": "$dur_texto",
  "vigentes_finales": $vigentes,
  "ocultos_finales": $ocultos,
  "total_sincronizado": $total,
  "resultado": "$resultado",
  "mensaje_error": $msg_json$extra_json
}
EOF

    set +e
    node registrar-scraper-run.js >> "$LOG_DIR/cron-scraper.log" 2>&1
    local REGISTRO_EXIT=$?
    set -e
    if [ $REGISTRO_EXIT -ne 0 ]; then
        echo "Advertencia: Falló el registro en Neon (registrar-scraper-run.js)" >> "$LOG_DIR/cron-scraper.log"
    fi
}

if [ $SCRAPER_EXIT -ne 0 ]; then
    generar_json "fail" "Fallo en scraper-dlds.js"
    echo "===== FIN CON ERROR (Scraper) $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG_DIR/cron-scraper.log"
    exit 1
fi

if [ "$STATUS_TEST_MODE" != "1" ]; then
    set +e
    node migrar-a-neon.js >> "$LOG_DIR/cron-scraper.log" 2>&1
    MIGRACION_EXIT=$?
    set -e
else
    echo "Modo de prueba activado. No se ejecuta migración." >> "$LOG_DIR/cron-scraper.log"
fi

if [ $MIGRACION_EXIT -ne 0 ]; then
    generar_json "fail" "Scraper OK, pero falló migrar-a-neon.js"
    echo "===== FIN CON ERROR (Migración) $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG_DIR/cron-scraper.log"
    exit 1
fi

generar_json "success" "null"
echo "===== FIN $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG_DIR/cron-scraper.log"
