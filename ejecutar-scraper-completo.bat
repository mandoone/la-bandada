@echo off
setlocal

set "BASE_DIR=C:\Users\Coope\Dropbox\LA BANDADA\2026\GROWSHOP\LABANDADA WEB\CARPETAS DEL PROEYCTO WEB\la-bandada"
set "LOG_DIR=%BASE_DIR%\logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "TS=%%i"
set "LOG_FILE=%LOG_DIR%\scraper_%TS%.log"

cd /d "%BASE_DIR%"

echo ========================================== >> "%LOG_FILE%"
echo INICIO %DATE% %TIME% >> "%LOG_FILE%"
echo ========================================== >> "%LOG_FILE%"

where node >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo ERROR: Node no encontrado en PATH
    echo ERROR: Node no encontrado en PATH >> "%LOG_FILE%"
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo [1/2] Ejecutando scraper-dlds.js >> "%LOG_FILE%"
echo [1/2] Ejecutando scraper-dlds.js
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; node scraper-dlds.js 2>&1 | Tee-Object -Append -FilePath '%LOG_FILE%'; exit $LASTEXITCODE"
set STEP1_EC=%errorlevel%
if %STEP1_EC% NEQ 0 (
    echo ERROR en scraper-dlds.js >> "%LOG_FILE%"
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo [2/2] Ejecutando migrar-a-neon.js >> "%LOG_FILE%"
echo [2/2] Ejecutando migrar-a-neon.js
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; node migrar-a-neon.js 2>&1 | Tee-Object -Append -FilePath '%LOG_FILE%'; exit $LASTEXITCODE"
set STEP2_EC=%errorlevel%
if %STEP2_EC% NEQ 0 (
    echo ERROR en migrar-a-neon.js >> "%LOG_FILE%"
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo OK FINALIZADO %DATE% %TIME% >> "%LOG_FILE%"
echo OK FINALIZADO

exit /b 0
