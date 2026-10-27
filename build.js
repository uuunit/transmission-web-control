#!/usr/bin/env node
/**
 * Build script for Transmission Web Control (maintained fork)
 *
 * Original TWC shipped the `min/` directory as a pre-built artifact with no
 * reproducible build configuration in the repo (package.json / Gruntfile.js
 * were both .gitignore'd). This script restores a reproducible build.
 *
 * Strategy matches the original artifacts:
 *   - syntax compression on (booleans -> !0/!1, numbers -> 5e3, comments stripped)
 *   - mangle OFF: top-level globals (`system`, `transmission`, `public`) are
 *     referenced across files and MUST keep their names; the original min
 *     artifacts also kept variable and property names intact.
 *
 * Usage:
 *   node build.js          # build min/
 *   node build.js --check  # verify outputs are syntactically valid only
 */

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "src", "tr-web-control", "script");
const OUT_DIR = path.join(SRC_DIR, "min");

// src file -> min file. Mirrors the script tags in src/index.html.
const TARGETS = [
  { src: "system.js", out: "system.min.js" },
  { src: "system.mobile.js", out: "system.mobile.min.js" },
  { src: "transmission.js", out: "transmission.min.js" },
  { src: "transmission.torrents.js", out: "transmission.torrents.min.js" },
  { src: "public.js", out: "public.min.js" },
  { src: "FileSaver.js", out: "FileSaver.min.js" },
];

const TERSER_OPTIONS = {
  compress: {
    // Keep semantics; the original artifacts used classic uglify-style compress.
    passes: 2,
    unsafe_arrows: false,
  },
  mangle: false,
  format: {
    comments: false,
    // The original artifacts are single-line-ish, but keep newlines readable
    // enough for diffing; beautify stays off.
    beautify: false,
  },
};

async function main() {
  const checkOnly = process.argv.includes("--check");

  let terser;
  try {
    terser = require("terser");
  } catch (e) {
    console.error("[build] terser is not installed. Run: npm install");
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  let ok = 0;
  let fail = 0;

  for (const t of TARGETS) {
    const srcPath = path.join(SRC_DIR, t.src);
    const outPath = path.join(OUT_DIR, t.out);

    if (!fs.existsSync(srcPath)) {
      console.error(`[build] MISSING SOURCE: ${t.src}`);
      fail++;
      continue;
    }

    const code = fs.readFileSync(srcPath, "utf8");
    const result = await terser.minify({ [t.src]: code }, TERSER_OPTIONS);

    if (result.error) {
      console.error(`[build] TERSER ERROR in ${t.src}: ${result.error}`);
      fail++;
      continue;
    }

    const out = result.code;
    const srcSize = Buffer.byteLength(code);
    const outSize = Buffer.byteLength(out);
    const ratio = ((outSize / srcSize) * 100).toFixed(1);

    if (checkOnly) {
      // Validate the generated code parses.
      try {
        new Function(out);
      } catch (e) {
        console.error(`[build] SYNTAX ERROR in output of ${t.src}: ${e.message}`);
        fail++;
        continue;
      }
      console.log(`[check] ${t.src} -> ${t.out} OK (${ratio}% of source)`);
      ok++;
      continue;
    }

    fs.writeFileSync(outPath, out, "utf8");
    console.log(
      `[build] ${t.src.padEnd(26)} -> ${t.out.padEnd(28)} ${String(srcSize).padStart(7)}B -> ${String(outSize).padStart(7)}B (${ratio}%)`
    );
    ok++;
  }

  console.log(`\n[build] done: ${ok} ok, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[build] fatal:", e);
  process.exit(1);
});
