param(
  [string]$ExecutablePath = "src-tauri/target/release/agent-buddy-workbuddy.exe"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$clientExe = Join-Path $repoRoot $ExecutablePath
if (-not (Test-Path -LiteralPath $clientExe -PathType Leaf)) {
  throw "Desktop client executable not found: $clientExe"
}

$package = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = (Get-Item -LiteralPath $clientExe).VersionInfo.FileVersion
if ($version -ne $package.version) {
  throw "Version mismatch: EXE is $version but package.json is $($package.version)."
}

$bytes = [System.IO.File]::ReadAllBytes($clientExe)
$peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
$subsystem = [BitConverter]::ToUInt16($bytes, $peOffset + 24 + 0x44)
if ($subsystem -ne 2) {
  throw "The artifact is not a Windows GUI executable (subsystem: $subsystem); it can show a console window."
}

$buildRoot = Join-Path $repoRoot "src-tauri/target/release/build"
$assetBuild = Get-ChildItem -LiteralPath $buildRoot -Directory -Filter "agent-buddy-workbuddy-*" |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "out/tauri-codegen-assets") } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $assetBuild) {
  throw "No Tauri embedded frontend assets were found. Do not ship a development build that accesses localhost."
}

$assets = Join-Path $assetBuild.FullName "out/tauri-codegen-assets"
$assetFiles = @(Get-ChildItem -LiteralPath $assets -File)
if ($assetFiles.Count -lt 2 -or -not ($assetFiles.Extension -contains ".html")) {
  throw "Tauri frontend assets are incomplete. Do not ship this executable."
}

$fingerprintRoot = Join-Path $repoRoot "src-tauri/target/release/.fingerprint"
$clientFingerprint = Get-ChildItem -LiteralPath $fingerprintRoot -Directory -Filter "agent-buddy-workbuddy-*" |
  ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter "bin-agent-buddy-workbuddy.json" -File } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $clientFingerprint) {
  throw "No desktop-client Cargo fingerprint was found. Run npm run build:desktop-client again."
}

$fingerprint = Get-Content -LiteralPath $clientFingerprint.FullName -Raw | ConvertFrom-Json
if ($fingerprint.features -notmatch "custom-protocol") {
  throw "The desktop client was built without custom-protocol. Do not ship an executable that can access localhost."
}

Write-Host "Desktop client release gate passed: version $version; Windows GUI subsystem; custom-protocol; $($assetFiles.Count) embedded frontend assets."
