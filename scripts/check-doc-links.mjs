import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".git", ".next", "node_modules", ".worktrees"]);

function collectMarkdown(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectMarkdown(path);
    return extname(entry.name).toLowerCase() === ".md" ? [path] : [];
  });
}

const missing = [];
const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;

for (const file of collectMarkdown(repositoryRoot)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(markdownLink)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (!rawTarget || rawTarget.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(rawTarget)) continue;

    const decodedTarget = decodeURIComponent(rawTarget.split("#", 1)[0]);
    const target = resolve(dirname(file), decodedTarget);
    if (!existsSync(target) || (!statSync(target).isFile() && !statSync(target).isDirectory())) {
      missing.push(`${file.slice(repositoryRoot.length + 1)} -> ${rawTarget}`);
    }
  }
}

if (missing.length > 0) {
  console.error("Broken local documentation links:\n" + missing.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Documentation links are valid.");
}
