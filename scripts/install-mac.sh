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
UXP_EXTENSIONS_DIR="/Library/Application Support/Adobe/UXP/extensions"

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

# Extract version from the .ccx manifest
PLUGIN_VERSION=""
if command -v python3 &>/dev/null; then
    PLUGIN_VERSION=$(python3 -c "
import zipfile, json, sys
try:
    zf = zipfile.ZipFile(sys.argv[1])
    m = json.loads(zf.read('manifest.json'))
    print(m.get('version', ''))
except: pass
" "$CCX_FILE" 2>/dev/null) || true
fi

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

if [ ! -d "$UXP_EXTENSIONS_DIR" ]; then
    echo "  ERROR: UXP extensions directory not found at:"
    echo "  $UXP_EXTENSIONS_DIR"
    echo ""
    echo "  Please ensure Creative Cloud Desktop is installed."
    exit 1
fi

# Determine target directory
if [ -n "$PLUGIN_VERSION" ]; then
    TARGET_DIR="$UXP_EXTENSIONS_DIR/${PLUGIN_ID}-${PLUGIN_VERSION}"
else
    TARGET_DIR="$UXP_EXTENSIONS_DIR/${PLUGIN_ID}"
fi

# Remove any previous installation in UXP extensions
for existing in "$UXP_EXTENSIONS_DIR"/${PLUGIN_ID}*; do
    if [ -d "$existing" ]; then
        echo "  Removing previous installation: $(basename "$existing")"
        rm -rf "$existing" 2>/dev/null || sudo rm -rf "$existing"
    fi
done

# Extract .ccx (it's a ZIP archive) to the target directory
echo "  Extracting to: $TARGET_DIR"
echo ""
echo "  (You may be prompted for your password to install into the system plugins folder)"
echo ""
mkdir -p "$TARGET_DIR" 2>/dev/null || sudo mkdir -p "$TARGET_DIR"
unzip -o -q "$CCX_FILE" -d "$TARGET_DIR" 2>/dev/null || sudo unzip -o -q "$CCX_FILE" -d "$TARGET_DIR"

# Verify manifest exists in target
if [ ! -f "$TARGET_DIR/manifest.json" ]; then
    echo ""
    echo "  ERROR: Installation may have failed — manifest.json not found."
    echo "  Please try the UXP Developer Tool method instead:"
    echo "  https://github.com/zoharbabin/kaltura-premiere-panel#install-end-users"
    exit 1
fi

# Register the plugin in each host app's UXP plugin registry
# Premiere Pro reads from /Library/... (system-level), not ~/Library/...
PLUGINS_INFO_DIR="/Library/Application Support/Adobe/UXP/PluginsInfo/v1"
sudo mkdir -p "$PLUGINS_INFO_DIR" 2>/dev/null

for host_file in premierepro aftereffects audition; do
    REGISTRY_FILE="$PLUGINS_INFO_DIR/${host_file}.json"

    # Use python3 to safely update the JSON registry
    if command -v python3 &>/dev/null; then
        python3 -c "
import json, sys, subprocess, tempfile, os
registry_path = sys.argv[1]
plugin_dir = sys.argv[2]
try:
    with open(registry_path) as f:
        registry = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    registry = {'plugins': []}
plugins = registry.get('plugins', [])
plugins = [p for p in plugins if p.get('path','') != plugin_dir]
plugins.append({'path': plugin_dir})
registry['plugins'] = plugins
content = json.dumps(registry, indent=2)
# Write via sudo tee
proc = subprocess.run(['sudo', 'tee', registry_path], input=content.encode(), capture_output=True)
sys.exit(proc.returncode)
" "$REGISTRY_FILE" "$TARGET_DIR" 2>/dev/null && \
        echo "  Registered in ${host_file} plugin registry"
    fi
done

echo ""
echo "  SUCCESS! The plugin has been installed."
echo ""
echo "  Next steps:"
echo "  1. Open (or restart) Premiere Pro, After Effects, or Audition"
echo "  2. Go to Window > UXP Plugins > Kaltura"
echo "  3. Sign in with your Kaltura account"
echo ""
