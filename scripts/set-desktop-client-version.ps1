param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$")]
  [string]$Version,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8File([string]$Path) {
  [System.IO.File]::ReadAllText($Path, $utf8)
}

function Write-Utf8File([string]$Path, [string]$Content) {
  if (-not $DryRun) {
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
  }
}

$packagePath = Join-Path $repoRoot "package.json"
$package = Read-Utf8File $packagePath
$updatedPackage = [regex]::Replace($package, '(?m)^  "version": "[^"]+",$', "  `"version`": `"$Version`",", 1)
if ($updatedPackage -eq $package) { throw "Could not update package.json version." }
Write-Utf8File $packagePath $updatedPackage

$lockPath = Join-Path $repoRoot "package-lock.json"
$lock = Read-Utf8File $lockPath
$lockMatches = [regex]::Matches($lock, '(?m)^(\s*)"version": "[^"]+",$')
if ($lockMatches.Count -lt 2) { throw "Could not find the two root version fields in package-lock.json." }
for ($index = 1; $index -ge 0; $index--) {
  $match = $lockMatches[$index]
  $replacement = $match.Groups[1].Value + "`"version`": `"$Version`","
  $lock = $lock.Remove($match.Index, $match.Length).Insert($match.Index, $replacement)
}
Write-Utf8File $lockPath $lock

$cargoPath = Join-Path $repoRoot "src-tauri/Cargo.toml"
$cargo = Read-Utf8File $cargoPath
$updatedCargo = [regex]::Replace($cargo, '(?m)^version = "[^"]+"$', "version = `"$Version`"", 1)
if ($updatedCargo -eq $cargo) { throw "Could not update src-tauri/Cargo.toml version." }
Write-Utf8File $cargoPath $updatedCargo

$tauriConfigPath = Join-Path $repoRoot "src-tauri/tauri.conf.json"
$tauriConfig = Read-Utf8File $tauriConfigPath
$updatedTauriConfig = [regex]::Replace($tauriConfig, '(?m)^  "version": "[^"]+",$', "  `"version`": `"$Version`",", 1)
if ($updatedTauriConfig -eq $tauriConfig) { throw "Could not update src-tauri/tauri.conf.json version." }
Write-Utf8File $tauriConfigPath $updatedTauriConfig

if ($DryRun) {
  Write-Host "Version update validated for v$Version. No files were changed."
} else {
  Write-Host "Desktop client version updated to v$Version. Run npm run package:desktop-client next."
}
