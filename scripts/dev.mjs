import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

function rootEnv() {
  const file = ".env.local";
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
        return [key, value];
      })
      .filter(([key]) => key),
  );
}

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "apps/web", ...process.argv.slice(2)],
  {
  env: { ...process.env, ...rootEnv() },
  stdio: "inherit",
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
