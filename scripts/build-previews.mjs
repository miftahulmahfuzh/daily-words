#!/usr/bin/env node
/**
 * Inline the app's real tokens into every design preview.
 *
 * Each preview owns its body. This script owns everything between
 * `<!-- @dw:tokens:start -->` and `<!-- @dw:tokens:end -->`, and it writes
 * src/styles/tokens.css followed by design/previews/_shared.css into that gap.
 * A preview therefore cannot drift from the shipped colours: change a token and
 * every preview changes with it on the next build.
 *
 * It also enforces the one rule the Design System pane has: the @dsCard comment
 * must be the very first line of the file. Anything before it — a doctype, a
 * blank line, a BOM — and no preview card renders, silently.
 *
 *   node scripts/build-previews.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const previewDir = join(root, "design", "previews");

const START = "<!-- @dw:tokens:start -->";
const END = "<!-- @dw:tokens:end -->";
const CARD = /^<!-- @dsCard group="[^"]+" -->$/;

const tokens = readFileSync(join(root, "src", "styles", "tokens.css"), "utf8");
const shared = readFileSync(join(previewDir, "_shared.css"), "utf8");

const block = [
  START,
  "<style>",
  "/* GENERATED — do not edit between the markers.",
  "   Source: src/styles/tokens.css + design/previews/_shared.css",
  "   Regenerate with `npm run design:build`. */",
  tokens.trimEnd(),
  "",
  shared.trimEnd(),
  "</style>",
  END,
].join("\n");

const files = readdirSync(previewDir)
  .filter((f) => f.endsWith(".html"))
  .sort();

if (files.length === 0) {
  console.error("No previews found in design/previews/.");
  process.exit(1);
}

let failed = false;

for (const file of files) {
  const path = join(previewDir, file);
  const source = readFileSync(path, "utf8");
  const firstLine = source.split("\n", 1)[0];

  if (!CARD.test(firstLine)) {
    console.error(
      `${file}: line 1 must be \`<!-- @dsCard group="…" -->\`, found: ${JSON.stringify(firstLine.slice(0, 60))}`,
    );
    failed = true;
    continue;
  }

  const from = source.indexOf(START);
  const to = source.indexOf(END);
  if (from === -1 || to === -1 || to < from) {
    console.error(`${file}: missing or malformed @dw:tokens markers.`);
    failed = true;
    continue;
  }

  const next = source.slice(0, from) + block + source.slice(to + END.length);
  if (next !== source) {
    writeFileSync(path, next);
    console.log(`updated  ${file}`);
  } else {
    console.log(`unchanged ${file}`);
  }
}

if (failed) process.exit(1);
console.log(`\n${files.length} previews built.`);
