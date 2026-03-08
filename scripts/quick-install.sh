#!/bin/bash
# ============================================================================
# Kaltura for Adobe Creative Cloud — One-Click Installer (macOS)
#
# Usage:
#   gh release download --repo zoharbabin/kaltura-premiere-panel --pattern 'quick-install.sh' --dir /tmp && bash /tmp/quick-install.sh
#
# This script:
#   1. Detects the latest release from GitHub
#   2. Downloads the .ccx and install-mac.sh to a temp directory
#   3. Runs the installer
#   4. Cleans up
# ============================================================================

set -euo pipefail

REPO="zoharbabin/kaltura-premiere-panel"
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

# Verify gh CLI is available
if ! command -v gh &>/dev/null; then
    echo "  ERROR: GitHub CLI (gh) is required but not installed."
    echo "  Install it from: https://cli.github.com/"
    exit 1
fi

# Verify gh is authenticated
if ! gh auth status &>/dev/null 2>&1; then
    echo "  ERROR: GitHub CLI is not authenticated."
    echo "  Run: gh auth login"
    exit 1
fi

# Step 1: Get latest release tag
echo "  Fetching latest release..."
TAG=$(gh release view --repo "$REPO" --json tagName --jq '.tagName' 2>/dev/null)

if [ -z "$TAG" ]; then
    echo "  ERROR: Could not determine latest release."
    echo "  Check: https://github.com/${REPO}/releases"
    exit 1
fi

VERSION="${TAG#v}"
echo "  Latest version: ${VERSION}"
echo ""

# Step 2: Determine which .ccx to download (prefer premierepro)
HOST_APP="${KALTURA_HOST_APP:-premierepro}"
CCX_PATTERN="kaltura-panel-${VERSION}-${HOST_APP}.ccx"

# Step 3: Download release assets
mkdir -p "$INSTALL_DIR"

echo "  Downloading ${CCX_PATTERN} and install-mac.sh..."
if ! gh release download "$TAG" --repo "$REPO" --pattern "$CCX_PATTERN" --pattern "install-mac.sh" --dir "$INSTALL_DIR"; then
    echo "  ERROR: Failed to download release assets."
    echo "  Check available assets: gh release view --repo ${REPO}"
    exit 1
fi

chmod +x "${INSTALL_DIR}/install-mac.sh"

# Step 4: Run the installer
echo ""
echo "  Running installer..."
echo ""
"${INSTALL_DIR}/install-mac.sh" "${INSTALL_DIR}/${CCX_PATTERN}"
