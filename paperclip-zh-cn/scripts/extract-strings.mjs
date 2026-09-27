#!/usr/bin/env node
/**
 * Extract user-visible English strings from the Paperclip web app so the
 * zh-CN dictionary is built from real host vocabulary instead of guesses.
 *
 * Usage: node scripts/extract-strings.mjs [--repo <path>] [--out <file>]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { repo: path.resolve(packageRoot, ".."), out: path.join(packageRoot, "analysis", "ui-strings.json") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--repo") args.repo = path.resolve(argv[++i]);
    if (argv[i] === "--out") args.out = path.resolve(argv[++i]);
  }
  return args;
}

async function walk(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      await walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Candidate = a short English phrase with no CJK, URL, or template placeholder. */
export function isTranslatableCandidate(value) {
  const text = value.trim();
  if (!text || text.length > 60 || text.length < 2) return false;
  if (/[一-鿿]/.test(text)) return false;
  if (/https?:\/\//.test(text)) return false;
  if (/[{}<>$]/.test(text)) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  return true;
}

const JSX_TEXT = />([^<>{}]*[A-Za-z][^<>{}]*)</g;
const PROP_STRING = /\b(?:title|placeholder|aria-label|alt|label|description|confirmLabel|cancelLabel|emptyMessage|helperText)\s*=\s*"([^"]{2,60})"/g;

export function extractFromSource(source) {
  const found = new Set();
  for (const match of source.matchAll(JSX_TEXT)) {
    const value = decodeEntities(match[1]);
    if (isTranslatableCandidate(value)) found.add(value);
  }
  for (const match of source.matchAll(PROP_STRING)) {
    const value = decodeEntities(match[1]);
    if (isTranslatableCandidate(value)) found.add(value);
  }
  return [...found];
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uiDir = path.join(args.repo, "ui", "src");
  const files = await walk(uiDir);
  const byString = new Map();
  let occurrences = 0;
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    for (const value of extractFromSource(source)) {
      occurrences += 1;
      const entry = byString.get(value) ?? { text: value, files: new Set(), count: 0 };
      entry.files.add(path.relative(args.repo, file));
      entry.count += 1;
      byString.set(value, entry);
    }
  }
  const ranked = [...byString.values()]
    .map((entry) => ({ text: entry.text, count: entry.count, files: [...entry.files].slice(0, 3) }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  const payload = {
    generatedFrom: path.relative(args.repo, uiDir),
    filesScanned: files.length,
    occurrences,
    uniqueCandidates: ranked.length,
    strings: ranked,
  };
  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`scanned ${files.length} files, ${occurrences} occurrences, ${ranked.length} unique candidates -> ${args.out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
