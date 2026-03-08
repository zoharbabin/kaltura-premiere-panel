#!/bin/bash
# ============================================================================
# Kaltura for Adobe Creative Cloud — macOS Installer
# Installs the UXP plugin via Adobe's UPIA (Unified Plugin Installer Agent)
# Falls back to direct file placement if UPIA fails
# ============================================================================

set -euo pipefail

UPIA_DIR="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS"
UPIA_BIN="$UPIA_DIR/UnifiedPluginInstallerAgent"
PLUGIN_ID="com.kaltura.premiere.panel"
UXP_PLUGINS_DIR="/Library/Application Support/Adobe/UXP/Plugins/External"

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

# --- Method 1: Try UPIA first ---
upia_install_success=false

if [ -f "$UPIA_BIN" ]; then
    echo "  Installing via Adobe UPIA..."
    echo ""

    UPIA_OUTPUT=$("$UPIA_BIN" --install "$CCX_FILE" 2>&1) || true
    echo "$UPIA_OUTPUT"
    echo ""

    if echo "$UPIA_OUTPUT" | grep -qi "Installation Successful"; then
        upia_install_success=true
    elif echo "$UPIA_OUTPUT" | grep -qi "status = -204"; then
        # -204 can mean already installed OR decompression failure
        # Try removing first, then reinstalling
        echo "  Previous installation detected. Removing and reinstalling..."
        echo ""
        "$UPIA_BIN" --remove "Kaltura for Adobe Creative Cloud" 2>&1 || true
        echo ""

        UPIA_OUTPUT=$("$UPIA_BIN" --install "$CCX_FILE" 2>&1) || true
        echo "$UPIA_OUTPUT"
        echo ""

        if echo "$UPIA_OUTPUT" | grep -qi "Installation Successful"; then
            upia_install_success=true
        fi
    fi
fi

if [ "$upia_install_success" = true ]; then
    echo "  SUCCESS! The plugin has been installed."
    echo ""
    echo "  Next steps:"
    echo "  1. Open (or restart) Premiere Pro, After Effects, or Audition"
    echo "  2. Go to Window > UXP Plugins > Kaltura"
    echo "  3. Sign in with your Kaltura account"
    echo ""
    exit 0
fi

# --- Method 2: Direct file placement (fallback) ---
echo "  UPIA install did not succeed. Using direct file placement..."
echo ""

TARGET_DIR="$UXP_PLUGINS_DIR/${PLUGIN_ID}"

echo "  (You may be prompted for your password to install into the system plugins folder)"
echo ""

# Remove any previous installation
for existing in "$UXP_PLUGINS_DIR"/${PLUGIN_ID}*; do
    if [ -d "$existing" ]; then
        echo "  Removing previous installation: $(basename "$existing")"
        rm -rf "$existing" 2>/dev/null || sudo rm -rf "$existing"
    fi
done

# Extract .ccx (it's a ZIP archive) to the target directory
echo "  Extracting to: $TARGET_DIR"
echo ""
sudo mkdir -p "$TARGET_DIR"
sudo unzip -o -q "$CCX_FILE" -d "$TARGET_DIR"

# Verify manifest exists in target
if [ ! -f "$TARGET_DIR/manifest.json" ]; then
    echo ""
    echo "  ERROR: Installation may have failed — manifest.json not found."
    echo "  Please try the UXP Developer Tool method instead:"
    echo "  https://github.com/zoharbabin/kaltura-premiere-panel#install-end-users"
    exit 1
fi

echo ""
echo "  SUCCESS! The plugin has been installed."
echo ""
echo "  Next steps:"
echo "  1. Open (or restart) Premiere Pro, After Effects, or Audition"
echo "  2. Go to Window > UXP Plugins > Kaltura"
echo "  3. Sign in with your Kaltura account"
echo ""
