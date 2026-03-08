#!/bin/bash
# ============================================================================
# Kaltura for Adobe Creative Cloud — macOS Installer
# Installs the UXP plugin via Adobe's UPIA (Unified Plugin Installer Agent)
# ============================================================================

set -euo pipefail

UPIA_DIR="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS"
UPIA_BIN="$UPIA_DIR/UnifiedPluginInstallerAgent"

echo ""
echo "  Kaltura for Adobe Creative Cloud — Installer"
echo "  ============================================="
echo ""

# Find the .ccx file
CCX_FILE=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if a .ccx was passed as argument
if [ $# -ge 1 ] && [ -f "$1" ]; then
    CCX_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
else
    # Look for .ccx files next to this script — prefer premierepro
    for pattern in "$SCRIPT_DIR"/*premierepro*.ccx "$SCRIPT_DIR"/*.ccx; do
        for f in $pattern; do
            if [ -f "$f" ]; then
                CCX_FILE="$f"
                break 2
            fi
        done
    done
fi

if [ -z "$CCX_FILE" ]; then
    echo "  ERROR: No .ccx file found."
    echo ""
    echo "  Usage: ./install-mac.sh [path/to/plugin.ccx]"
    echo ""
    echo "  Or place this script in the same folder as the .ccx file."
    exit 1
fi

echo "  Plugin:  $(basename "$CCX_FILE")"
echo ""

# Check UPIA exists
if [ ! -f "$UPIA_BIN" ]; then
    echo "  ERROR: Adobe Creative Cloud Desktop is not installed,"
    echo "  or UPIA was not found at the expected location."
    echo ""
    echo "  Please install Creative Cloud Desktop from:"
    echo "  https://creativecloud.adobe.com/apps/download/creative-cloud"
    echo ""
    echo "  Then re-run this installer."
    exit 1
fi

echo "  Installing via Adobe UPIA..."
echo ""

# Run UPIA install — capture output to detect failures
# (UPIA returns exit code 0 even on failure, so we check the output text)
UPIA_OUTPUT=$("$UPIA_BIN" --install "$CCX_FILE" 2>&1)
echo "$UPIA_OUTPUT"

echo ""
if echo "$UPIA_OUTPUT" | grep -qi "Installation Successful"; then
    echo "  SUCCESS! The plugin has been installed."
    echo ""
    echo "  Next steps:"
    echo "  1. Open (or restart) Premiere Pro, After Effects, or Audition"
    echo "  2. Go to Window > UXP Plugins > Kaltura"
    echo "  3. Sign in with your Kaltura account"
    echo ""
elif echo "$UPIA_OUTPUT" | grep -qi "status = -204"; then
    echo "  The plugin is already installed (v1.0.2)."
    echo "  To reinstall, first remove it via Creative Cloud Desktop > Manage Plugins,"
    echo "  then run this installer again."
    echo ""
elif echo "$UPIA_OUTPUT" | grep -qi "Failed to install"; then
    echo "  Installation FAILED."
    echo ""
    echo "  Troubleshooting:"
    echo "  - Make sure Creative Cloud Desktop is running and up to date"
    echo "  - Make sure you are signed into Creative Cloud"
    echo "  - Make sure Premiere Pro, After Effects, or Audition is installed"
    echo "  - Try restarting Creative Cloud Desktop and running this again"
    echo ""
    echo "  Alternative: install manually via UXP Developer Tool:"
    echo "  https://github.com/zoharbabin/kaltura-premiere-panel#install-end-users"
    exit 1
else
    echo "  Install completed (could not confirm status)."
    echo "  Please check Window > UXP Plugins > Kaltura in your Adobe app."
    echo ""
fi
