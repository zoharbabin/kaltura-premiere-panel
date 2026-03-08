#!/bin/bash
# ============================================================================
# Kaltura for Adobe Creative Cloud — One-Click Installer (macOS)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/zoharbabin/kaltura-premiere-panel/main/scripts/quick-install.sh | bash
#
# This script:
#   1. Detects the latest release from GitHub
#   2. Downloads the .ccx and install-mac.sh to a temp directory
#   3. Runs the installer
#   4. Cleans up
# ============================================================================

set -euo pipefail

REPO="zoharbabin/kaltura-premiere-panel"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
TMPDIR_BASE="${TMPDIR:-/tmp}"
INSTALL_DIR="${TMPDIR_BASE}/kaltura-premiere-install-$$"

cleanup() {
    rm -rf "$INSTALL_DIR" 2>/dev/null || true
}
trap cleanup EXIT

echo ""
echo "  Kaltura for Adobe Creative Cloud — Quick Installer"
echo "  ==================================================="
echo ""

# Step 1: Get latest release info
echo "  Fetching latest release..."
RELEASE_JSON=$(curl -fsSL "$API_URL")

TAG=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
VERSION="${TAG#v}"

if [ -z "$VERSION" ]; then
    echo "  ERROR: Could not determine latest release version."
    exit 1
fi

echo "  Latest version: ${VERSION}"
echo ""

# Step 2: Determine which .ccx to download (prefer premierepro)
HOST_APP="${KALTURA_HOST_APP:-premierepro}"
CCX_NAME="kaltura-panel-${VERSION}-${HOST_APP}.ccx"
INSTALLER_NAME="install-mac.sh"

# Build download URLs from release assets
DOWNLOAD_BASE="https://github.com/${REPO}/releases/download/${TAG}"
CCX_URL="${DOWNLOAD_BASE}/${CCX_NAME}"
INSTALLER_URL="${DOWNLOAD_BASE}/${INSTALLER_NAME}"

# Step 3: Download files
mkdir -p "$INSTALL_DIR"

echo "  Downloading ${CCX_NAME}..."
if ! curl -fsSL -o "${INSTALL_DIR}/${CCX_NAME}" "$CCX_URL"; then
    echo "  ERROR: Failed to download ${CCX_NAME}"
    echo "  Check available assets at: https://github.com/${REPO}/releases/tag/${TAG}"
    exit 1
fi

echo "  Downloading ${INSTALLER_NAME}..."
if ! curl -fsSL -o "${INSTALL_DIR}/${INSTALLER_NAME}" "$INSTALLER_URL"; then
    echo "  ERROR: Failed to download ${INSTALLER_NAME}"
    exit 1
fi

chmod +x "${INSTALL_DIR}/${INSTALLER_NAME}"

# Step 4: Run the installer
echo ""
echo "  Running installer..."
echo ""
"${INSTALL_DIR}/${INSTALLER_NAME}" "${INSTALL_DIR}/${CCX_NAME}"
