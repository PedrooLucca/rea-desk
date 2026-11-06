# Vigia de atualização do REA Desk. NÃO roda dentro do app: o app copia este script para fora da pasta de instalação e o
# dispara de forma desacoplada. Usa apenas componentes assinados do Windows (PowerShell, robocopy, taskkill).
#
# Fluxo: espera o app antigo fechar -> espera a versão nova avisar que está saudável (arquivo healthy.json)
#        -> se avisar: apaga o backup. Se não avisar a tempo: encerra a versão nova, restaura o backup e reabre.
param([Parameter(Mandatory = $true)][string]$ConfigFile)
$ErrorActionPreference = 'Continue'
$cfg = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
function Log($m) { try { Add-Content -LiteralPath $cfg.logFile -Value ("{0} [vigia] {1}" -f (Get-Date -Format o), $m) -Encoding UTF8 } catch {} }
Log "iniciado token=$($cfg.token) : $($cfg.fromVersion) -> $($cfg.toVersion)"

function Test-Healthy {
  if (-not (Test-Path -LiteralPath $cfg.healthFile)) { return $false }
  try { return ((Get-Content -LiteralPath $cfg.healthFile -Raw | ConvertFrom-Json).version -eq $cfg.toVersion) } catch { return $false }
}

# 1) espera o app antigo fechar (o instalador só começa depois disso)
try { Wait-Process -Id $cfg.oldPid -Timeout 120 -ErrorAction SilentlyContinue } catch {}

# 2) espera a versão nova avisar que está saudável
$deadline = (Get-Date).AddSeconds([int]$cfg.timeoutSec)
while ((Get-Date) -lt $deadline) {
  if (Test-Healthy) {
    Log "versão $($cfg.toVersion) saudável; nada a fazer"
    Remove-Item -LiteralPath $cfg.backupDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
  }
  Start-Sleep -Seconds 2
}

# 3) ROLLBACK
Log "versão $($cfg.toVersion) NÃO ficou saudável em $($cfg.timeoutSec) s; restaurando $($cfg.fromVersion)"
if (-not (Test-Path -LiteralPath $cfg.backupDir)) { Log "sem backup; rollback impossível"; exit 2 }

# encerra o que estiver rodando da pasta de instalação e espera o instalador terminar
$installPrefix = ([string]$cfg.installDir).TrimEnd('\') + '\'
for ($i = 0; $i -lt 30; $i++) {
  Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  $installer = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.ProcessName -match '^REA-Desk.*Instalar' }
  if (-not $installer) { break }
  Start-Sleep -Seconds 2
}
Start-Sleep -Seconds 1

robocopy $cfg.backupDir $cfg.installDir /MIR /R:10 /W:2 /NFL /NDL /NP /NJH /NJS | Out-Null
$code = $LASTEXITCODE
Log "robocopy terminou com código $code (0-7 = sucesso)"
if ($code -ge 8) { Log "falha ao restaurar os arquivos"; exit 3 }

# corrige a versão exibida em "Aplicativos instalados"
try {
  Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { ($_.UninstallString -and $_.UninstallString.IndexOf(([string]$cfg.installDir).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0) -or ($_.InstallLocation -and ($_.InstallLocation.TrimEnd('\') -ieq ([string]$cfg.installDir).TrimEnd('\'))) } |
    ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name DisplayVersion -Value $cfg.fromVersion }
} catch {}

@{ fromVersion = $cfg.fromVersion; toVersion = $cfg.toVersion; at = (Get-Date -Format o); reason = 'a nova versão não ficou saudável' } |
  ConvertTo-Json | Set-Content -LiteralPath $cfg.rollbackFile -Encoding UTF8
Log "rollback concluído; reabrindo $($cfg.exePath)"
Start-Process -FilePath $cfg.exePath -ArgumentList '--rolled-back'
Remove-Item -LiteralPath $cfg.backupDir -Recurse -Force -ErrorAction SilentlyContinue
exit 0
