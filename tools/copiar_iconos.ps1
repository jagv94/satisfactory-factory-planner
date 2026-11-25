# Copia los iconos exportados con FModel a la carpeta icons/ del planificador, con el nombre que espera la herramienta.
# Uso (PowerShell):  .\copiar_iconos.ps1 -Exports "C:\ruta\FModel\Output\Exports"
# En FModel exporta como PNG (Save Texture) la carpeta FactoryGame/Content/FactoryGame/Resource (y, si quieres, Equipment y Prototype).
param([Parameter(Mandatory = $true)][string]$Exports)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$db = Get-Content -Raw -Encoding UTF8 (Join-Path $root "data\satisfactory_db.json") | ConvertFrom-Json
$dest = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Indexando PNG en $Exports ..."
$index = @{}
Get-ChildItem -Path $Exports -Recurse -Filter *.png | ForEach-Object { if (-not $index.ContainsKey($_.BaseName)) { $index[$_.BaseName] = $_.FullName } }
$ok = 0; $missing = @()
foreach ($p in $db.items.PSObject.Properties) {
  $icon = $p.Value.icon
  if (-not $icon) { continue }
  if ($index.ContainsKey($icon)) { Copy-Item $index[$icon] (Join-Path $dest ($p.Name + ".png")) -Force; $ok++ }
  else { $missing += "$($p.Value.es) ($icon)" }
}
Write-Host "Copiados: $ok iconos a $dest"
if ($missing.Count) { Write-Host "No encontrados ($($missing.Count)):"; $missing | ForEach-Object { Write-Host "  $_" } }
