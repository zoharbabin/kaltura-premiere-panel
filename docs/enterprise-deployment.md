# Enterprise Deployment Guide

## Overview

This guide covers deploying the Kaltura for Adobe Creative Cloud plugin in enterprise environments via Adobe Admin Console and UPIA command-line tools.

## Prerequisites

- Adobe Admin Console administrator access
- Kaltura partner account with API access
- `.ccx` package file (see [Packaging](#packaging))

## Packaging

Build and prepare the plugin package:

```bash
npm run package
```

This runs the build, validates the manifest, copies icons, and generates Exchange metadata.

To create per-host `.ccx` files:

```bash
node scripts/build-ccx.js
```

This outputs one `.ccx` per host app (Premiere Pro, After Effects, Audition) into the `release/` directory, each with a single-host manifest.

Alternatively, push a version tag (e.g. `git tag v1.1.0 && git push --tags`) to trigger the automated [Release workflow](./../.github/workflows/release.yml) which builds and publishes `.ccx` files as GitHub Release assets.

## Adobe Admin Console Deployment

1. Sign in to [Adobe Admin Console](https://adminconsole.adobe.com/)
2. Navigate to **Packages** > **Admin Packages**
3. Click **Create a Package**
4. Select **Managed Package**
5. Choose target apps (Premiere Pro)
6. Upload the `.ccx` file under **Plugins**
7. Assign the package to user groups or deploy globally

## UPIA Command-Line Installation

For IT automation and scripting:

**macOS:**

```bash
UPIA="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/macOS/UnifiedPluginInstallerAgent"

# Install
"$UPIA" --install "/path/to/kaltura-panel-1.0.0-premierepro.ccx"

# List installed plugins
"$UPIA" --list

# Uninstall
"$UPIA" --uninstall "com.kaltura.premiere.panel"
```

**Windows:**

```cmd
set UPIA="C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"

%UPIA% /install "C:\path\to\kaltura-panel-1.0.0-premierepro.ccx"
%UPIA% /list
%UPIA% /uninstall "com.kaltura.premiere.panel"
```

## Pre-Configuration

Enterprise admins can pre-configure the plugin by placing a configuration file before first launch.

### Configuration File Location

| Platform | Path                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Adobe/UXP/PluginsStorage/PPRO/Internal/com.kaltura.premiere.panel/config.json` |
| Windows  | `%APPDATA%\Adobe\UXP\PluginsStorage\PPRO\Internal\com.kaltura.premiere.panel\config.json`                     |

### Configuration Options

```json
{
  "serverUrl": "https://your-kaltura-instance.com",
  "partnerId": 12345,
  "authMethod": "sso",
  "ssoProvider": "okta",
  "enforceGovernance": true,
  "defaultAccessControlId": 100,
  "disableLocalCache": false
}
```

| Option                   | Type                       | Description                                    |
| ------------------------ | -------------------------- | ---------------------------------------------- |
| `serverUrl`              | string                     | Kaltura API endpoint URL                       |
| `partnerId`              | number                     | Kaltura partner/account ID                     |
| `authMethod`             | `"credentials"` \| `"sso"` | Default authentication method                  |
| `ssoProvider`            | string                     | SSO provider name (displayed in login UI)      |
| `enforceGovernance`      | boolean                    | Enforce content holds and audit trail          |
| `defaultAccessControlId` | number                     | Default access control profile for new entries |
| `disableLocalCache`      | boolean                    | Disable local metadata caching                 |

## Network Requirements

The plugin requires network access to:

| Domain                | Purpose                             |
| --------------------- | ----------------------------------- |
| `*.kaltura.com`       | Kaltura API and CDN                 |
| `*.kaltura.cloud`     | Kaltura cloud endpoints             |
| `wss://*.kaltura.com` | Real-time notifications (WebSocket) |

Ensure these domains are allowlisted in corporate firewalls and proxy servers.

## Troubleshooting

### Plugin not loading

- Verify Premiere Pro version >= 25.2.0
- Check UXP Developer Tool for error logs
- Re-download or rebuild the `.ccx` file (no signing required for UXP plugins)

### Authentication failures

- Verify `serverUrl` and `partnerId` in config
- Check network connectivity to Kaltura endpoints
- For SSO: verify SSO provider configuration in Kaltura KMC

### Content governance not working

- Ensure `enforceGovernance: true` in config
- Verify audit trail plugin is enabled on the Kaltura account
- Check that admin user has audit trail permissions
