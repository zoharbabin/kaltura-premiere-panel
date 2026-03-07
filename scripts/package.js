/**
 * Package the UXP plugin into a .ccx distribution file.
 * Usage: node scripts/package.js
 *
 * Note: .ccx packaging requires the Adobe UXP Developer Tool CLI (ucf).
 * This script prepares the dist/ directory for packaging.
 * Actual .ccx creation is done via: ucf pack dist/ -o kaltura-premiere-panel.ccx
 */

const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "../dist");

function verifyBuild() {
  const requiredFiles = ["index.js", "manifest.json"];

  for (const file of requiredFiles) {
    const filePath = path.join(distDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing required file: ${file}`);
      console.error("Run 'npm run build' before packaging.");
      process.exit(1);
    }
  }

  // Verify manifest
  const manifest = JSON.parse(
    fs.readFileSync(path.join(distDir, "manifest.json"), "utf-8"),
  );
  console.log(`Plugin: ${manifest.name} v${manifest.version}`);
  console.log(`ID: ${manifest.id}`);
  console.log(`Host: ${manifest.host.app} >= ${manifest.host.minVersion}`);
  console.log("");
  console.log("Build verified. To create .ccx package:");
  console.log("  ucf pack dist/ -o kaltura-premiere-panel.ccx");
  console.log("");
  console.log("Or load in UXP Developer Tool:");
  console.log(`  Open dist/manifest.json in UXP DevTool`);
}

verifyBuild();
