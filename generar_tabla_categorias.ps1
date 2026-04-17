$basePath = "C:\Users\Coope\Dropbox\LA BANDADA\2026\GROWSHOP\LABANDADA WEB\CARPETAS DEL PROEYCTO WEB\la-bandada"
$listaPath = Join-Path $basePath "lista_categorias_referencia.txt"
$reportePath = Join-Path $basePath "reporte-scraping.csv"
$salidaPath = Join-Path $basePath "tabla_categorias_con_cantidades.csv"

function Parse-UrlParts {
    param([string]$url)

    $path = ([uri]$url).AbsolutePath.Trim('/')
    $parts = $path -split '/'

    # Quitar "c"
    if ($parts.Count -gt 0 -and $parts[0] -eq 'c') {
        $parts = $parts[1..($parts.Count - 1)]
    }

    $categoria = ''
    $subcategoria = ''
    $sub2 = ''

    if ($parts.Count -ge 1) {
        if ($parts[0] -in @('grow','smoke')) {
            $categoria = $parts[0]
            if ($parts.Count -ge 2) { $subcategoria = $parts[1] }
            if ($parts.Count -ge 3) { $sub2 = $parts[2] }
        }
        else {
            # Semillas y rutas especiales
            $categoria = 'semillas'
            $subcategoria = $parts[0]
            if ($parts.Count -ge 2) { $sub2 = $parts[1] }
        }
    }

    [PSCustomObject]@{
        CATEGORIA = $categoria
        SUBCATEGORIA = $subcategoria
        SUB2 = $sub2
    }
}

# 1) Leer lista base
$lineas = Get-Content $listaPath | Where-Object { $_ -match '^\d+\s*-' }

$tablaBase = foreach ($line in $lineas) {
    if ($line -match '^\s*(\d+)\s*-\s*(https?://\S+)\s*$') {
        $id = [int]$matches[1]
        $url = $matches[2]
        $parts = Parse-UrlParts -url $url

        [PSCustomObject]@{
            ID = $id
            CATEGORIA = $parts.CATEGORIA
            SUBCATEGORIA = $parts.SUBCATEGORIA
            SUB2 = $parts.SUB2
            URL = $url
        }
    }
}

# 2) Leer reporte de scraping
$reporte = Import-Csv $reportePath

# 3) Agrupar cantidades por URL
$mapa = @{}

foreach ($row in $reporte) {
    $url = $row.url
    if ([string]::IsNullOrWhiteSpace($url)) { continue }

    if (-not $mapa.ContainsKey($url)) {
        $mapa[$url] = [PSCustomObject]@{
            detectada = 0
            con_stock = 0
        }
    }

    $mapa[$url].detectada++

    if ($row.estado -and $row.estado -notin @('sin_stock','error')) {
        $mapa[$url].con_stock++
    }
}

# 4) Unir tabla base + cantidades
$salida = foreach ($item in $tablaBase) {
    $detectada = 0
    $conStock = 0

    if ($mapa.ContainsKey($item.URL)) {
        $detectada = $mapa[$item.URL].detectada
        $conStock = $mapa[$item.URL].con_stock
    }

    [PSCustomObject]@{
        ID = $item.ID
        CATEGORIA = $item.CATEGORIA
        SUBCATEGORIA = $item.SUBCATEGORIA
        SUB2 = $item.SUB2
        CANTIDAD_DETECTADA = $detectada
        CANTIDAD_CON_STOCK = $conStock
        URL = $item.URL
    }
}

# 5) Guardar CSV
$salida | Export-Csv -Path $salidaPath -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "Archivo generado correctamente:"
Write-Host $salidaPath
