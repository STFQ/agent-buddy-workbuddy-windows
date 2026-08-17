param(
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [string]$Program,
    [string[]]$Arguments
  )

  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $Program $($Arguments -join ' ')"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  Invoke-Checked "npm" @("run", "build")

  if (-not $SkipTests) {
    Invoke-Checked "cargo" @("test", "--manifest-path", "src-tauri/Cargo.toml", "--features", "custom-protocol")
  }

  Invoke-Checked "cargo" @("build", "--manifest-path", "src-tauri/Cargo.toml", "--release", "--features", "custom-protocol", "--bin", "agent-buddy-workbuddy")
  & (Join-Path $PSScriptRoot "verify-desktop-client-build.ps1")
} finally {
  Pop-Location
}
