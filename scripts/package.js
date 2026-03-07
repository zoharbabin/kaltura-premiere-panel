/**
 * Package the UXP plugin for distribution.
 * Usage: node scripts/package.js [--validate-only]
 *
 * This script:
 *   1. Verifies the build output in dist/
 *   2. Syncs manifest version from package.json
 *   3. Copies icons from plugin/icons/ to dist/icons/
 *   4. Reports bundle size
 *   5. Generates Exchange listing metadata
 *   6. Prints packaging instructions
 *
 * The .ccx file is created via UXP Developer Tool (GUI) or
 * `npx @anthropic/uxp-cli package dist/` (when available).
 */

const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "../dist");
const pluginDir = path.resolve(__dirname, "../plugin");
const packageJson = require("../package.json");

const REQUIRED_ICON_SIZES = [24, 48, 96, 192];
const BUNDLE_SIZE_WARN_MB = 5;
const validateOnly = process.argv.includes("--validate-only");

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
    if (!validateOnly) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    }
  }

  console.log(`  Plugin: ${manifest.name}`);
  console.log(`  Version: ${manifest.version}`);
  console.log(`  ID: ${manifest.id}`);
  console.log(`  Host: ${manifest.host.app} >= ${manifest.host.minVersion}`);

  // Validate manifest schema
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    console.error("\nManifest validation errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  return manifest;
}

function validateManifest(manifest) {
  const errors = [];
  if (manifest.manifestVersion < 5) errors.push("manifestVersion must be >= 5");
  if (!manifest.id) errors.push("Missing plugin id");
  if (!manifest.name) errors.push("Missing plugin name");
  if (!manifest.version) errors.push("Missing version");
  if (!manifest.main) errors.push("Missing main entry point");
  if (!manifest.host || !manifest.host.app) errors.push("Missing host.app");
  if (!manifest.host || !manifest.host.minVersion) errors.push("Missing host.minVersion");
  if (!manifest.entrypoints || manifest.entrypoints.length === 0) errors.push("No entrypoints defined");
  if (!manifest.requiredPermissions) errors.push("Missing requiredPermissions");
  if (!manifest.icons || manifest.icons.length === 0) errors.push("No icons defined");
  return errors;
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
    const iconName = `icon-${size}.png`;
    const distIcon = path.join(iconsDir, iconName);
    const sourceIcon = path.join(sourceIconsDir, iconName);

    if (fs.existsSync(sourceIcon)) {
      if (!validateOnly) {
        fs.copyFileSync(sourceIcon, distIcon);
        console.log(`  Copied: ${iconName}`);
      } else {
        console.log(`  Found: ${iconName} (source)`);
      }
    } else if (!fs.existsSync(distIcon)) {
      hasAllIcons = false;
      console.warn(`  WARNING: Missing icon: ${iconName} (${size}x${size})`);
    } else {
      console.log(`  Found: ${iconName}`);
    }
  }

  if (!hasAllIcons) {
    console.warn("\n  Some icons are missing. Adobe Exchange requires:");
    console.warn("  - icon-24.png (24x24) - panel title bar");
    console.warn("  - icon-48.png (48x48) - plugin manager");
    console.warn("  - icon-96.png (96x96) - Exchange listing");
    console.warn("  - icon-192.png (192x192) - Exchange hero");
    console.warn("  Place icons in plugin/icons/ and rebuild.\n");
  }

  return hasAllIcons;
}

function reportBundleSize() {
  console.log("\nBundle analysis:");

  const files = fs
    .readdirSync(distDir)
    .filter((f) => !fs.statSync(path.join(distDir, f)).isDirectory());
  let totalSize = 0;

  for (const file of files) {
    const size = fs.statSync(path.join(distDir, file)).size;
    totalSize += size;
    const sizeStr =
      size > 1024 * 1024
        ? `${(size / 1024 / 1024).toFixed(1)} MB`
        : `${(size / 1024).toFixed(1)} KB`;
    console.log(`  ${file}: ${sizeStr}`);
  }

  const totalStr =
    totalSize > 1024 * 1024
      ? `${(totalSize / 1024 / 1024).toFixed(1)} MB`
      : `${(totalSize / 1024).toFixed(1)} KB`;
  console.log(`  Total: ${totalStr}`);

  if (totalSize > BUNDLE_SIZE_WARN_MB * 1024 * 1024) {
    console.warn(`\n  WARNING: Bundle exceeds ${BUNDLE_SIZE_WARN_MB} MB. Consider optimizing.`);
  }

  return totalSize;
}

function generateExchangeMetadata(manifest) {
  console.log("\nGenerating Exchange listing metadata...");

  const metadata = {
    name: manifest.name,
    version: manifest.version,
    id: manifest.id,
    shortDescription: "Browse, import, publish, and manage Kaltura media directly from Premiere Pro.",
    longDescription: [
      `${manifest.name} integrates Adobe Premiere Pro with Kaltura's video platform.`,
      "",
      "Features:",
      "- Browse and search your Kaltura media library",
      "- Import assets directly into Premiere Pro timelines",
      "- Publish sequences to Kaltura with metadata and categories",
      "- AI-powered captioning via Kaltura REACH",
      "- Real-time collaboration with time-coded annotations",
      "- Analytics dashboard with engagement data",
      "- Interactive video: chapters, cue points, quizzes",
      "- Enterprise governance: content holds, audit trail, DRM",
      "- Proxy workflow for large files",
      "",
      `Requires Premiere Pro ${manifest.host.minVersion} or later.`,
      "Requires an active Kaltura account.",
    ].join("\n"),
    supportUrl: `https://github.com/${packageJson.repository || "zoharbabin/kaltura-premiere-panel"}/issues`,
    privacyPolicyUrl: "https://corp.kaltura.com/privacy-policy/",
    compatibility: {
      host: manifest.host.app,
      minVersion: manifest.host.minVersion,
    },
    categories: ["Video", "Collaboration", "Media Management"],
    keywords: ["kaltura", "video", "media", "publishing", "captioning", "analytics"],
  };

  const metadataPath = path.join(distDir, "exchange-metadata.json");
  if (!validateOnly) {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
    console.log(`  Written: exchange-metadata.json`);
  } else {
    console.log("  Exchange metadata validated (not written in validate-only mode)");
  }

  return metadata;
}

function printInstructions(manifest) {
  console.log("\n--- Packaging Instructions ---\n");
  console.log("Option 1: UXP Developer Tool (development)");
  console.log("  Load dist/manifest.json in UXP Developer Tool\n");
  console.log("Option 2: Create .ccx package (distribution)");
  console.log("  Use UXP Developer Tool > Package Plugin > Select dist/\n");
  console.log("Option 3: Adobe Admin Console (enterprise)");
  console.log("  Upload .ccx via Adobe Admin Console > Packages\n");
  console.log("Option 4: UPIA command-line (IT automation)");
  console.log(
    '  upia install --path "kaltura-premiere-panel.ccx" --targets "premierepro"\n',
  );
  console.log("Adobe Exchange submission checklist:");
  console.log("  [ ] All icons present (24, 48, 96, 192 px)");
  console.log("  [ ] Screenshots (min 3): browse, publish, settings");
  console.log("  [ ] exchange-metadata.json reviewed and customized");
  console.log("  [ ] Support URL verified");
  console.log("  [ ] Privacy policy URL verified");
  console.log(`  [ ] Compatible: Premiere Pro >= ${manifest.host.minVersion}`);
}

// Main
const manifest = verifyBuild();
const hasIcons = verifyIcons();
reportBundleSize();
generateExchangeMetadata(manifest);
printInstructions(manifest);

if (!hasIcons) {
  process.exit(0); // Warn but don't fail — icons can be added later
}

console.log("\nPackage preparation complete.");
