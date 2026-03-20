/**
 * Build .ccx packages for distribution.
 *
 * Produces one .ccx per host application (Premiere Pro, After Effects, Audition).
 * Adobe requires each .ccx to target exactly one host — the manifest `host`
 * field must be a single HostDefinition object, not an array.
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

// Host applications to build .ccx packages for
const HOST_APPS = [
  { app: "premierepro", minVersion: "25.6", label: "Premiere Pro" },
  { app: "aftereffects", minVersion: "25.6", label: "After Effects" },
  { app: "audition", minVersion: "25.6", label: "Audition" },
];

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

/** Build a single .ccx for the given host app */
function buildCcxForHost(manifest, hostDef) {
  const filename = `kaltura-panel-${manifest.version}_${hostDef.app}.ccx`;
  const outputPath = path.join(outputDir, filename);

  console.log(`  Building ${filename} (${hostDef.label})...`);

  // Create a host-specific manifest with a single HostDefinition object
  const hostManifest = {
    ...manifest,
    host: { app: hostDef.app, minVersion: hostDef.minVersion },
  };

  // Use a temporary staging directory to assemble the package contents
  const stagingDir = path.join(outputDir, `.staging-${hostDef.app}`);
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

  // Write the host-specific manifest
  fs.writeFileSync(
    path.join(stagingDir, "manifest.json"),
    JSON.stringify(hostManifest, null, 2) + "\n",
  );

  // Remove any previous .ccx at this path
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  // Create the ZIP using the system zip command
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
  console.log(`    ${filename} (${sizeStr})`);

  return filename;
}

async function main() {
  const manifest = readManifest();

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

  // Build one .ccx per host app
  const producedFiles = [];
  for (const hostDef of HOST_APPS) {
    const filename = buildCcxForHost(manifest, hostDef);
    producedFiles.push(filename);
  }

  console.log(`\nDone. ${producedFiles.length} packages written to ${outputDir}/`);

  // Write a manifest of produced files for CI consumption
  const releaseManifest = {
    version: manifest.version,
    pluginName: manifest.name,
    hosts: HOST_APPS.map((h) => h.app),
    files: producedFiles,
  };
  fs.writeFileSync(
    path.join(outputDir, "release-manifest.json"),
    JSON.stringify(releaseManifest, null, 2) + "\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
