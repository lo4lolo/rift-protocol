import { reportDate } from "./report-time.mjs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const skip = new Set([
  "node_modules",
  "dist",
  ".runtime",
  "evidence",
  "releases",
  ".git",
]);
const files = [];
async function scan(dir = ".") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(relative);
    else if (entry.isFile())
      files.push({
        path: relative.replaceAll("\\", "/"),
        sha256: createHash("sha256")
          .update(await readFile(relative))
          .digest("hex"),
      });
  }
}
await scan();
files.sort((a, b) => a.path.localeCompare(b.path));
if (process.argv.includes("--check")) {
  const previous = JSON.parse(
    await readFile("evidence/source-manifest.json", "utf8"),
  );
  const old = new Map(previous.files.map((f) => [f.path, f.sha256])),
    now = new Map(files.map((f) => [f.path, f.sha256]));
  const changed = [...new Set([...old.keys(), ...now.keys()])].filter(
    (name) => old.get(name) !== now.get(name),
  );
  console.log(
    changed.length
      ? `Changed files:\n${changed.join("\n")}`
      : `All ${files.length} source files match.`,
  );
  process.exitCode = changed.length ? 1 : 0;
} else {
  await writeFile(
    "evidence/source-manifest.json",
    JSON.stringify({ date: reportDate(), version: "0.54.0", files }, null, 2),
  );
  console.log(`Recorded ${files.length} source hashes.`);
}
