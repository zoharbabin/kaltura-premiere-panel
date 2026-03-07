/**
 * Package the UXP plugin into a .ccx distribution file.
 * Usage: node scripts/package.js
 *
 * This script verifies the build, generates icon placeholders if missing,
 * and prepares the dist/ directory for .ccx packaging.
 *
 * Packaging options:
 *   - ucf pack dist/ -o kaltura-premiere-panel.ccx (Adobe UXP CLI)
 *   - Or load dist/manifest.json directly in UXP Developer Tool
 */

const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "../dist");
const pluginDir = path.resolve(__dirname, "../plugin");
const packageJson = require("../package.json");

const REQUIRED_ICON_SIZES = [24, 48, 96, 192];

function verifyBuild() {
  console.log("Verifying build...\n");

  const requiredFiles = ["index.js", "manifest.json"];
  const missing = [];

  for (const file of requiredFiles) {
    const filePath = path.join(distDir, file);
    if (!fs.existsSync(filePath)) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    console.error(`Missing required files: ${missing.join(", ")}`);
    console.error("Run 'npm run build' before packaging.");
    process.exit(1);
  }

  // Verify and update manifest version from package.json
  const manifestPath = path.join(distDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  if (manifest.version !== packageJson.version) {
    console.log(`Updating manifest version: ${manifest.version} -> ${packageJson.version}`);
    manifest.version = packageJson.version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }

  console.log(`  Plugin: ${manifest.name}`);
  console.log(`  Version: ${manifest.version}`);
  console.log(`  ID: ${manifest.id}`);
  console.log(`  Host: ${manifest.host.app} >= ${manifest.host.minVersion}`);

  return manifest;
}

function verifyIcons() {
  console.log("\nVerifying icons...");

  const iconsDir = path.join(distDir, "icons");
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const sourceIconsDir = path.join(pluginDir, "icons");
  let hasAllIcons = true;

  for (const size of REQUIRED_ICON_SIZES) {
    const iconName = `icon_${size}.png`;
    const distIcon = path.join(iconsDir, iconName);
    const sourceIcon = path.join(sourceIconsDir, iconName);

    if (fs.existsSync(sourceIcon)) {
      fs.copyFileSync(sourceIcon, distIcon);
      console.log(`  Copied: ${iconName}`);
    } else if (!fs.existsSync(distIcon)) {
      hasAllIcons = false;
      console.warn(`  WARNING: Missing icon: ${iconName} (${size}x${size})`);
    } else {
      console.log(`  Found: ${iconName}`);
    }
  }

  if (!hasAllIcons) {
    console.warn("\n  Some icons are missing. Adobe Exchange requires:");
    console.warn("  - icon_24.png (24x24) - panel title bar");
    console.warn("  - icon_48.png (48x48) - plugin manager");
    console.warn("  - icon_96.png (96x96) - Exchange listing");
    console.warn("  - icon_192.png (192x192) - Exchange hero");
    console.warn("  Place icons in plugin/icons/ and rebuild.\n");
  }

  return hasAllIcons;
}

function reportBundleSize() {
  console.log("\nBundle analysis:");

  const files = fs.readdirSync(distDir).filter((f) => !fs.statSync(path.join(distDir, f)).isDirectory());
  let totalSize = 0;

  for (const file of files) {
    const size = fs.statSync(path.join(distDir, file)).size;
    totalSize += size;
    const sizeStr = size > 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(1)} MB`
      : `${(size / 1024).toFixed(1)} KB`;
    console.log(`  ${file}: ${sizeStr}`);
  }

  const totalStr = totalSize > 1024 * 1024
    ? `${(totalSize / 1024 / 1024).toFixed(1)} MB`
    : `${(totalSize / 1024).toFixed(1)} KB`;
  console.log(`  Total: ${totalStr}`);

  if (totalSize > 5 * 1024 * 1024) {
    console.warn("\n  WARNING: Bundle exceeds 5 MB. Consider optimizing.");
  }
}

function printInstructions(manifest) {
  console.log("\n--- Packaging Instructions ---\n");
  console.log("Option 1: UXP Developer Tool (development)");
  console.log("  Load dist/manifest.json in UXP Developer Tool\n");
  console.log("Option 2: Create .ccx package (distribution)");
  console.log("  npx @anthropic-ai/ucf pack dist/ -o kaltura-premiere-panel.ccx\n");
  console.log("Option 3: Adobe Admin Console (enterprise)");
  console.log("  Upload .ccx via Adobe Admin Console > Packages\n");
  console.log("Adobe Exchange submission checklist:");
  console.log("  [ ] All icons present (24, 48, 96, 192 px)");
  console.log("  [ ] Screenshots (min 3): browse, publish, settings");
  console.log("  [ ] Short description (< 80 chars)");
  console.log("  [ ] Long description with features list");
  console.log("  [ ] Support URL");
  console.log("  [ ] Privacy policy URL");
  console.log(`  [ ] Compatible: Premiere Pro >= ${manifest.host.minVersion}`);
}

// Main
const manifest = verifyBuild();
const hasIcons = verifyIcons();
reportBundleSize();
printInstructions(manifest);

if (!hasIcons) {
  process.exit(0); // Warn but don't fail — icons can be added later
}

console.log("\nPackage preparation complete.");
