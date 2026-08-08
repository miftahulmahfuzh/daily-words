#!/usr/bin/env node
/**
 * Which previews differ from what was last pushed to claude.ai/design.
 *
 * The design project is a shared surface with a human working in it. Pushing
 * everything on every run would overwrite whatever they did in the browser
 * since the last sync, so the push is always incremental and this script is
 * what makes "incremental" mechanical rather than a judgement call.
 *
 *   node scripts/dssync-changed.mjs                 list changed files
 *   node scripts/dssync-changed.mjs --write-manifest  record the current hashes
 *
 * Run the plain form before a push; run --write-manifest immediately after one
 * succeeds, and commit the manifest.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const previewDir = join(root, "design", "previews");
const manifestPath = join(root, "design", ".dssync-manifest.json");

const write = process.argv.includes("--write-manifest");

const hashes = Object.fromEntries(
  readdirSync(previewDir)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => [
      f,
      createHash("sha256").update(readFileSync(join(previewDir, f))).digest("hex"),
    ]),
);

if (write) {
  writeFileSync(manifestPath, `${JSON.stringify(hashes, null, 2)}\n`);
  console.error(`Manifest written: ${Object.keys(hashes).length} files.`);
  process.exit(0);
}

const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : {};

const changed = Object.keys(hashes).filter((f) => manifest[f] !== hashes[f]);
const removed = Object.keys(manifest).filter((f) => !(f in hashes));

// The file list goes to stdout so it can be piped; commentary goes to stderr.
for (const f of changed) console.log(f);

if (removed.length) {
  console.error(`\nGone from disk but still in the manifest: ${removed.join(", ")}`);
}
if (changed.length === 0) {
  console.error("Nothing to push.");
}
