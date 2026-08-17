param(
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "build-desktop-client.ps1") -SkipTests:$SkipTests

$package = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = $package.version
$source = Join-Path $repoRoot "src-tauri/target/release/agent-buddy-workbuddy.exe"
$releaseDir = Join-Path $repoRoot "release"
$clientName = "Agent-Buddy-WorkBuddy-Windows-v$version.exe"
$zipName = "Agent-Buddy-WorkBuddy-Windows-v$version.zip"
$shaName = "Agent-Buddy-WorkBuddy-Windows-v$version.sha256"
$client = Join-Path $releaseDir $clientName
$zip = Join-Path $releaseDir $zipName
$checksum = Join-Path $releaseDir $shaName

if ((Test-Path -LiteralPath $client) -or (Test-Path -LiteralPath $zip) -or (Test-Path -LiteralPath $checksum)) {
  throw "Release files for v$version already exist. Increment the version before packaging a new release."
}

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $client -ErrorAction Stop
Compress-Archive -LiteralPath $client -DestinationPath $zip -ErrorAction Stop

$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$clientHash = (Get-FileHash -LiteralPath $client -Algorithm SHA256).Hash
if ($sourceHash -ne $clientHash) {
  throw "Delivered executable hash does not match the verified build output."
}

"$clientHash *$clientName" | Set-Content -LiteralPath $checksum -Encoding ascii -NoNewline
Write-Host "Desktop client package created: $client"
Write-Host "Desktop client archive created: $zip"
Write-Host "SHA256: $clientHash"
