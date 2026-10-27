import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { Linter } from "eslint";

const require = createRequire(import.meta.url);
const glob = require("fast-glob");
const next = require("@next/eslint-plugin-next");

test("the Next root-directory dependency is the maintained glob implementation", () => {
  assert.equal(require("fast-glob/package.json").name, "@platform/lint-glob-adapter");
  assert.equal(require("fast-glob/package.json").dependencies.tinyglobby, "0.2.17");
  assert.equal(typeof glob.globSync, "function");
  // Upgrade review must catch new fast-glob API usage by the Next plugin.
  const source = readFileSync(require.resolve("@next/eslint-plugin-next/dist/utils/get-root-dirs"), "utf8");
  assert.match(source, /_fastglob\.globSync/);
  assert.doesNotMatch(source, /_fastglob\.(?:sync|stream|generateTasks|escapePath)/);
});

test("directory matching retains root, brace, missing and space-path semantics", () => {
  const root = mkdtempSync(join(tmpdir(), "bsrc-t01-lint-contract-"));
  for (const path of ["packages/one/app", "packages/two/pages", "src/app", "space name/app"])
    mkdirSync(join(root, path), { recursive: true });
  const cases = [
    ["packages/*", ["packages/one", "packages/two"]],
    ["packages/{one,two}", ["packages/one", "packages/two"]],
    ["**/app", ["packages/one/app", "space name/app", "src/app"]],
    ["space name/*", ["space name/app"]],
    ["missing/*", []],
  ];
  for (const [pattern, expected] of cases)
    assert.deepEqual(glob.globSync(pattern, { cwd: root, onlyDirectories: true }).sort(), expected);
});

test("Next still reports internal anchor violations through configured root discovery", () => {
  const root = mkdtempSync(join(tmpdir(), "bsrc-t01-next-rule-"));
  const pages = join(root, "pages");
  mkdirSync(pages);
  writeFileSync(join(pages, "about.js"), "export default function Page(){return null;}\n");
  const linter = new Linter();
  const messages = linter.verify('const Page = () => <a href="/about">About</a>;', {
    languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "@next/next": next },
    settings: { next: { rootDir: root.replaceAll("\\", "/") } },
    rules: { "@next/next/no-html-link-for-pages": "error" },
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, "@next/next/no-html-link-for-pages");
  assert.equal(messages[0].severity, 2);
});
