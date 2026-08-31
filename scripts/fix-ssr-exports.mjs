#!/usr/bin/env node
/**
 * Rolldown/Nitro node-server bug:
 * - ssr.mjs exports `ssr_exports as s` but never defines ssr_exports
 *   (should re-export server_default as s — that's the SSR fetch entry)
 * - ssr2.mjs imports __exportAll from ssr.mjs → circular init
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const EXPORT_ALL_FN = `var __exportAll$1 = (all) => {
  const target = {};
  for (const name in all) Object.defineProperty(target, name, { get: all[name], enumerable: true });
  return target;
};
`;

async function walk(dir, out = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith(".mjs")) out.push(p);
  }
  return out;
}

const root = join(process.cwd(), ".output");
const files = await walk(root);
let n = 0;
for (const file of files) {
  let text = await readFile(file, "utf8");
  let next = text;
  if (next.includes("ssr_exports as s")) {
    next = next.replace(/\bssr_exports as s\b/g, "server_default as s");
  }
  if (/import\s*\{\s*c as __exportAll\$1\s*\}\s*from\s*"\.\/ssr\.mjs"\s*;/.test(next)) {
    next = next.replace(
      /import\s*\{\s*c as __exportAll\$1\s*\}\s*from\s*"\.\/ssr\.mjs"\s*;/,
      EXPORT_ALL_FN,
    );
  }
  if (next === text) continue;
  await writeFile(file, next);
  n += 1;
  console.log("[fix-ssr-exports]", file.replace(process.cwd() + "/", ""));
}
console.log(`[fix-ssr-exports] patched ${n} file(s)`);
