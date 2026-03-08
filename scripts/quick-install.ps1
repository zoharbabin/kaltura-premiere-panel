# ============================================================================
# Kaltura for Adobe Creative Cloud — One-Click Installer (Windows)
#
# Usage (PowerShell as Administrator):
#   irm https://raw.githubusercontent.com/zoharbabin/kaltura-premiere-panel/main/scripts/quick-install.ps1 | iex
#
# This script:
#   1. Detects the latest release from GitHub
#   2. Downloads the .ccx and install-win.bat to a temp directory
#   3. Runs the installer
#   4. Cleans up
# ============================================================================

$ErrorActionPreference = "Stop"

$repo = "zoharbabin/kaltura-premiere-panel"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"
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
    # Step 1: Get latest release info
    Write-Host "  Fetching latest release..."
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "kaltura-installer" }
    $tag = $release.tag_name
    $version = $tag -replace "^v", ""

    if (-not $version) {
        throw "Could not determine latest release version."
    }

    Write-Host "  Latest version: $version"
    Write-Host ""

    # Step 2: Determine which .ccx to download
    $hostApp = if ($env:KALTURA_HOST_APP) { $env:KALTURA_HOST_APP } else { "premierepro" }
    $ccxName = "kaltura-panel-$version-$hostApp.ccx"
    $installerName = "install-win.bat"

    $downloadBase = "https://github.com/$repo/releases/download/$tag"
    $ccxUrl = "$downloadBase/$ccxName"
    $installerUrl = "$downloadBase/$installerName"

    # Step 3: Download files
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null

    Write-Host "  Downloading $ccxName..."
    Invoke-WebRequest -Uri $ccxUrl -OutFile (Join-Path $installDir $ccxName) -UseBasicParsing

    Write-Host "  Downloading $installerName..."
    Invoke-WebRequest -Uri $installerUrl -OutFile (Join-Path $installDir $installerName) -UseBasicParsing

    # Step 4: Run the installer
    Write-Host ""
    Write-Host "  Running installer..."
    Write-Host ""

    $batPath = Join-Path $installDir $installerName
    $ccxPath = Join-Path $installDir $ccxName
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$batPath`" `"$ccxPath`"" -Wait -NoNewWindow

} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Check available releases at: https://github.com/$repo/releases" -ForegroundColor Yellow
    exit 1
} finally {
    Cleanup
}
