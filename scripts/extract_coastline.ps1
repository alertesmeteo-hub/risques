# Extrait les lignes de côte de France métropolitaine depuis le shapefile
# Natural Earth (ne_50m_coastline.shp), déjà utilisé par le pipeline HARMONIE
# pour les cartes raster (cf. harmonie_maps.py::_iter_shapefile_parts) — même
# format, relu ici en PowerShell (pas de Python disponible sur ce poste),
# pour produire un GeoJSON statique embarqué dans le widget WordPress.
#
# Bornes de clip généreuses autour de la France métropolitaine (déborde un
# peu en mer et sur les pays voisins pour ne pas couper une côte pile à la
# frontière) : long. -6..10, lat. 41..51.5.

param(
    [string]$ShpPath = "C:\Users\franc\Downloads\github-meteo-forets\harmonie\config\natural-earth\ne_50m_coastline.shp",
    [string]$OutPath = "C:\Users\franc\Downloads\github-meteo-forets\risques\wordpress\harmonie-risques-widget\assets\littoral-coastline.geojson",
    [double]$West = -6.0,
    [double]$East = 10.0,
    [double]$South = 41.0,
    [double]$North = 51.5
)

function Read-BEInt32([System.IO.BinaryReader]$r) {
    $bytes = $r.ReadBytes(4)
    [array]::Reverse($bytes)
    return [BitConverter]::ToInt32($bytes, 0)
}

$stream = [System.IO.File]::OpenRead($ShpPath)
$reader = New-Object System.IO.BinaryReader($stream)

# En-tête principal (100 octets) : code fichier (BE) puis reste peu utile ici.
$fileCode = Read-BEInt32 $reader
if ($fileCode -ne 9994) { throw "En-tête Shapefile invalide : $ShpPath" }
$reader.BaseStream.Seek(100, [System.IO.SeekOrigin]::Begin) | Out-Null

$lines = New-Object System.Collections.Generic.List[object]

while ($reader.BaseStream.Position -lt $reader.BaseStream.Length) {
    $recordNumber = Read-BEInt32 $reader
    $contentWords = Read-BEInt32 $reader
    $contentBytes = $contentWords * 2
    $contentStart = $reader.BaseStream.Position

    $shapeType = $reader.ReadInt32()
    if ($shapeType -eq 0) {
        $reader.BaseStream.Seek($contentStart + $contentBytes, [System.IO.SeekOrigin]::Begin) | Out-Null
        continue
    }
    # 3 = PolyLine, 5 = Polygon — la côte Natural Earth est en PolyLine (3).
    if ($shapeType -ne 3 -and $shapeType -ne 5) {
        $reader.BaseStream.Seek($contentStart + $contentBytes, [System.IO.SeekOrigin]::Begin) | Out-Null
        continue
    }

    # Bounding box (4 doubles) ignorée.
    $reader.BaseStream.Seek(32, [System.IO.SeekOrigin]::Current) | Out-Null
    $numParts = $reader.ReadInt32()
    $numPoints = $reader.ReadInt32()
    $parts = New-Object int[] $numParts
    for ($i = 0; $i -lt $numParts; $i++) { $parts[$i] = $reader.ReadInt32() }
    $points = New-Object 'double[,]' $numPoints, 2
    for ($i = 0; $i -lt $numPoints; $i++) {
        $points[$i, 0] = $reader.ReadDouble()
        $points[$i, 1] = $reader.ReadDouble()
    }

    for ($p = 0; $p -lt $numParts; $p++) {
        $start = $parts[$p]
        $end = if ($p -lt $numParts - 1) { $parts[$p + 1] } else { $numPoints }
        if ($end -le $start) { continue }

        $segment = New-Object System.Collections.Generic.List[double[]]
        for ($i = $start; $i -lt $end; $i++) {
            $lon = $points[$i, 0]
            $lat = $points[$i, 1]
            if ($lon -ge $West -and $lon -le $East -and $lat -ge $South -and $lat -le $North) {
                $segment.Add(@($lon, $lat))
            } elseif ($segment.Count -gt 0) {
                if ($segment.Count -ge 2) { [void]$lines.Add($segment.ToArray()) }
                $segment = New-Object System.Collections.Generic.List[double[]]
            }
        }
        if ($segment.Count -ge 2) { [void]$lines.Add($segment.ToArray()) }
    }

    $reader.BaseStream.Seek($contentStart + $contentBytes, [System.IO.SeekOrigin]::Begin) | Out-Null
}

$reader.Dispose()
$stream.Dispose()

# Sérialisation GeoJSON manuelle (évite ConvertTo-Json, lent et peu fiable
# sur des tableaux imbriqués de cette taille).
$sb = New-Object System.Text.StringBuilder
$sb.Append('{"type":"FeatureCollection","features":[') | Out-Null
for ($f = 0; $f -lt $lines.Count; $f++) {
    if ($f -gt 0) { $sb.Append(',') | Out-Null }
    $sb.Append('{"type":"Feature","properties":{},"geometry":{"type":"LineString","coordinates":[') | Out-Null
    $line = $lines[$f]
    for ($i = 0; $i -lt $line.Length; $i++) {
        if ($i -gt 0) { $sb.Append(',') | Out-Null }
        $lon = $line[$i][0].ToString('0.00000', [System.Globalization.CultureInfo]::InvariantCulture)
        $lat = $line[$i][1].ToString('0.00000', [System.Globalization.CultureInfo]::InvariantCulture)
        $sb.Append("[$lon,$lat]") | Out-Null
    }
    $sb.Append(']}}') | Out-Null
}
$sb.Append(']}') | Out-Null

[System.IO.File]::WriteAllText($OutPath, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Écrit $OutPath : $($lines.Count) segments"
