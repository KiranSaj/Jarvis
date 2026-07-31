# Live view of what Ollama is doing.
# Run in its own terminal:  powershell -ExecutionPolicy Bypass -File watch-ollama.ps1
# Leave it open beside the browser while you talk to JARVIS.
# ASCII only on purpose - PowerShell 5.1 mangles non-ASCII in source files.

$log = "$env:LOCALAPPDATA\Ollama\server.log"

function Get-Ms([string]$d) {
  $d = $d.Trim()
  if ($d -match '^([0-9.]+)ms$')            { return [double]$matches[1] }
  if ($d -match '^([0-9.]+)m([0-9.]+)s$')   { return ([double]$matches[1]*60000 + [double]$matches[2]*1000) }
  if ($d -match '^([0-9.]+)s$')             { return ([double]$matches[1] * 1000) }
  return 0   # microseconds - effectively instant
}

Write-Host ""
Write-Host "  JARVIS / Ollama monitor" -ForegroundColor Cyan
Write-Host "  Every request the helmet makes appears below. Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

try {
  $ps = Invoke-RestMethod -Uri "http://localhost:11434/api/ps" -TimeoutSec 3
  if (-not $ps.models -or $ps.models.Count -eq 0) {
    Write-Host "  No model loaded - the next question pays the load cost (~30s)." -ForegroundColor Yellow
  } else {
    foreach ($m in $ps.models) {
      $mins = [math]::Round(([datetime]$m.expires_at - (Get-Date)).TotalMinutes)
      Write-Host ("  loaded: {0}  ({1} GB, unloads in {2} min)" -f $m.name, [math]::Round($m.size/1GB,1), $mins) -ForegroundColor Green
    }
  }
} catch {
  Write-Host "  Ollama is not responding on port 11434." -ForegroundColor Red
}
Write-Host ""

if (-not (Test-Path $log)) { Write-Host "  Log not found: $log" -ForegroundColor Red; exit 1 }

Get-Content $log -Tail 0 -Wait | ForEach-Object {
  $line = $_

  # [GIN] 2026/07/29 - 21:56:37 | 200 | 1.1250851s | 127.0.0.1 | POST "/api/chat"
  if ($line -match '\[GIN\].*?\|\s*(\d{3})\s*\|\s*([^|]+?)\s*\|[^|]*\|\s*(\w+)\s+"([^"]+)"') {
    $code = $matches[1]
    $ms   = [math]::Round((Get-Ms $matches[2]))
    $verb = $matches[3]
    $path = $matches[4]

    if ($path -eq '/api/tags' -or $path -eq '/api/ps') { return }   # background polling

    $colour = if ($code -ne '200') { 'Red' } elseif ($ms -gt 5000) { 'Yellow' } else { 'Green' }
    $note   = if ($ms -gt 5000) { '   <-- slow, model was probably cold' } else { '' }
    Write-Host ("  {0}  {1} {2}  {3,6} ms  [{4}]{5}" -f (Get-Date -Format 'HH:mm:ss'), $verb, $path, $ms, $code, $note) -ForegroundColor $colour
    return
  }

  if ($line -match 'starting llama server|llama runner started|loaded runner') {
    Write-Host ("  {0}  loading model into VRAM..." -f (Get-Date -Format 'HH:mm:ss')) -ForegroundColor Cyan
    return
  }
  if ($line -match 'unloading|stopping runner') {
    Write-Host ("  {0}  model unloaded from VRAM" -f (Get-Date -Format 'HH:mm:ss')) -ForegroundColor DarkYellow
    return
  }
  if ($line -match 'level=ERROR|panic:') {
    Write-Host ("  {0}  ERROR: {1}" -f (Get-Date -Format 'HH:mm:ss'), $line.Trim()) -ForegroundColor Red
    return
  }
}
