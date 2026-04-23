# NEXT TASK — La Bandada Growshop

## Tarea actual recomendada
Validar y cerrar la automatización del scraper en VPS Oracle.

## Objetivo
Confirmar que el sistema ya corre solo todos los días desde el VPS y dejar una capa mínima de monitoreo para no depender de revisar logs manualmente.

## Estado previo
Ya está completado:
- VPS Oracle configurado
- SSH funcionando
- Node + Playwright + PostgreSQL instalados
- scraper funcionando en Linux headless
- migración a Neon validada
- `run-scraper.sh` creado
- cron activo a las 03:00 con `flock`

## Resultado esperado de esta tarea
- Confirmar que la corrida automática por cron se ejecutó sola
- Confirmar que al finalizar:
  - `cron-scraper.log` muestra nuevo bloque `===== INICIO ... =====`
  - hay scraping completo
  - hay migración completa a Neon
- Dejar un método simple para revisar última corrida sin leer todo el log

## Subtareas exactas

### 1. Verificar primera corrida automática por cron
Revisar en VPS:

```bash
grep "===== INICIO" ~/la-bandada/logs/cron-scraper.log
tail -n 80 ~/la-bandada/logs/cron-scraper.log