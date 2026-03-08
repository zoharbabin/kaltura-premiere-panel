# ============================================================================
# Kaltura for Adobe Creative Cloud — One-Click Installer (Windows)
#
# Usage (PowerShell as Administrator):
#   gh release download --repo zoharbabin/kaltura-premiere-panel --pattern 'quick-install.ps1' --dir $env:TEMP; & "$env:TEMP\quick-install.ps1"
#
# This script:
#   1. Detects the latest release from GitHub
#   2. Downloads the .ccx and install-win.bat to a temp directory
#   3. Runs the installer
#   4. Cleans up
# ============================================================================

$ErrorActionPreference = "Stop"

$repo = "zoharbabin/kaltura-premiere-panel"
$installDir = Join-Path $env:TEMP "kaltura-premiere-install-$(Get-Random)"

function Cleanup {
    if (Test-Path $installDir) {
        Remove-Item -Recurse -Force $installDir -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "  Kaltura for Adobe Creative Cloud - Quick Installer"
Write-Host "  ==================================================="
Write-Host ""

try {
    # Verify gh CLI is available
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "GitHub CLI (gh) is required but not installed. Install from: https://cli.github.com/"
    }

    # Step 1: Get latest release tag
    Write-Host "  Fetching latest release..."
    $tag = gh release view --repo $repo --json tagName --jq '.tagName' 2>$null
    if (-not $tag) {
        throw "Could not determine latest release. Check: https://github.com/$repo/releases"
    }

    $version = $tag -replace "^v", ""
    Write-Host "  Latest version: $version"
    Write-Host ""

    # Step 2: Determine which .ccx to download
    $hostApp = if ($env:KALTURA_HOST_APP) { $env:KALTURA_HOST_APP } else { "premierepro" }
    $ccxPattern = "kaltura-panel-$version-$hostApp.ccx"

    # Step 3: Download release assets
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null

    Write-Host "  Downloading $ccxPattern and install-win.bat..."
    gh release download $tag --repo $repo --pattern $ccxPattern --pattern "install-win.bat" --dir $installDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to download release assets. Run: gh release view --repo $repo"
    }

    # Step 4: Run the installer
    Write-Host ""
    Write-Host "  Running installer..."
    Write-Host ""

    $batPath = Join-Path $installDir "install-win.bat"
    $ccxPath = Join-Path $installDir $ccxPattern
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$batPath`" `"$ccxPath`"" -Wait -NoNewWindow

} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Check available releases at: https://github.com/$repo/releases" -ForegroundColor Yellow
    exit 1
} finally {
    Cleanup
}
