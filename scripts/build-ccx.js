/**
 * Build .ccx packages for distribution.
 *
 * Produces one .ccx per host app (premierepro, aftereffects, audition),
 * each with a single-host manifest as Adobe recommends for production.
 *
 * Usage: node scripts/build-ccx.js [--output-dir <dir>]
 *
 * A .ccx file is a ZIP archive that Creative Cloud Desktop recognizes.
 * We use the system `zip` command (not Node.js archiver) because Adobe's
 * CExtensionUnpackager cannot handle ZIP data descriptors (flag bit 3)
 * which the `archiver` npm package sets by default.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const distDir = path.resolve(__dirname, "../dist");
const packageJson = require("../package.json");

// Files that should not be shipped in production .ccx packages
const EXCLUDED_EXTENSIONS = [".d.ts", ".d.ts.map"];
const EXCLUDED_FILES = new Set([
  "manifest.json",
  "exchange-metadata.json",
  "index.js.LICENSE.txt",
]);

const outputDir = (() => {
  const idx = process.argv.indexOf("--output-dir");
  if (idx !== -1 && process.argv[idx + 1]) {
    return path.resolve(process.argv[idx + 1]);
  }
  return path.resolve(__dirname, "../release");
})();

function readManifest() {
  const manifestPath = path.join(distDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("dist/manifest.json not found. Run 'npm run build' first.");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  // Ensure version matches package.json
  if (manifest.version !== packageJson.version) {
    manifest.version = packageJson.version;
  }

  return manifest;
}

function shouldInclude(file) {
  if (EXCLUDED_FILES.has(file)) return false;
  for (const ext of EXCLUDED_EXTENSIONS) {
    if (file.endsWith(ext)) return false;
  }
  return true;
}

/** Collect files to include from dist/, filtering dev-only artifacts */
function collectFiles(dirPath, prefix) {
  const result = [];
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    if (!shouldInclude(entry)) continue;
    const fullPath = path.join(dirPath, entry);
    const archiveName = prefix ? `${prefix}/${entry}` : entry;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...collectFiles(fullPath, archiveName));
    } else {
      result.push({ fullPath, archiveName });
    }
  }
  return result;
}

function createCcx(manifest, host) {
  const appName = host.app;
  const filename = `kaltura-panel-${manifest.version}-${appName}.ccx`;
  const outputPath = path.join(outputDir, filename);

  // Build a single-host manifest for this .ccx
  const hostManifest = {
    ...manifest,
    host: { app: host.app, minVersion: host.minVersion },
  };

  // Use a temporary staging directory to assemble the package contents
  const stagingDir = path.join(outputDir, `.staging-${appName}`);
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  // Copy dist files to staging
  const files = collectFiles(distDir, "");
  for (const { fullPath, archiveName } of files) {
    const dest = path.join(stagingDir, archiveName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(fullPath, dest);
  }

  // Write the single-host manifest (overwrites the multi-host one from dist)
  fs.writeFileSync(
    path.join(stagingDir, "manifest.json"),
    JSON.stringify(hostManifest, null, 2) + "\n",
  );

  // Remove any previous .ccx at this path
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  // Create the ZIP using the system zip command (produces standard ZIP without data descriptors)
  const absOutputPath = path.resolve(outputPath);
  execSync(`cd "${stagingDir}" && zip -r -X "${absOutputPath}" .`, {
    stdio: "pipe",
  });

  // Clean up staging
  fs.rmSync(stagingDir, { recursive: true });

  const size = fs.statSync(outputPath).size;
  const sizeStr =
    size > 1024 * 1024
      ? `${(size / (1024 * 1024)).toFixed(1)} MB`
      : `${(size / 1024).toFixed(1)} KB`;
  console.log(`  ${filename} (${sizeStr})`);

  return { filename, size };
}

async function main() {
  const manifest = readManifest();
  const hosts = Array.isArray(manifest.host) ? manifest.host : [manifest.host];

  console.log(
    `\nBuilding .ccx packages for ${manifest.name} v${manifest.version}\n`,
  );

  // Verify dist has required files
  const indexPath = path.join(distDir, "index.js");
  if (!fs.existsSync(indexPath)) {
    console.error("dist/index.js not found. Run 'npm run build' first.");
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Build one .ccx per host
  const results = [];
  for (const host of hosts) {
    const result = createCcx(manifest, host);
    results.push(result);
  }

  // Copy installer scripts into the release folder
  const scriptsDir = path.resolve(__dirname);
  for (const installer of ["install-mac.sh", "install-win.bat", "quick-install.sh", "quick-install.ps1"]) {
    const src = path.join(scriptsDir, installer);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outputDir, installer));
      console.log(`  Copied ${installer} to ${outputDir}/`);
    }
  }

  console.log(`\nDone. ${results.length} .ccx file(s) written to ${outputDir}/`);

  // Write a manifest of produced files for CI consumption
  const manifestOutput = {
    version: manifest.version,
    pluginName: manifest.name,
    files: results.map((r) => r.filename),
  };
  fs.writeFileSync(
    path.join(outputDir, "release-manifest.json"),
    JSON.stringify(manifestOutput, null, 2) + "\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
