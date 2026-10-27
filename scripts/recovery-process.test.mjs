import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { runRecoveryTool } from "./recovery-process.mjs";

test("client success completes without forwarding child output", async () => {
  await runRecoveryTool(process.execPath, ["-e", "console.log('simulated private row');console.error('simulated private diagnostic')"], process.env);
});

test("private client output never reaches captured operator logs", () => {
  const module = new URL("./recovery-process.mjs", import.meta.url).href;
  const code = `import {runRecoveryTool} from ${JSON.stringify(module)};
    try { await runRecoveryTool(process.execPath,['-e',"console.log('PRIVATE_COPY_ROW');console.error('PRIVATE_DIAGNOSTIC');process.exit(2)"],process.env); }
    catch(error){ console.log(error.message); }`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_COPY_ROW|PRIVATE_DIAGNOSTIC/);
  assert.match(result.stdout, /exit 2/);
});

test("timeout is rejected instead of producing a success receipt", async () => {
  await assert.rejects(runRecoveryTool(process.execPath, ["-e", "setInterval(()=>{},1000)"], process.env, 50), /time budget/);
});

test("a client ignoring SIGTERM is forcibly stopped within a bounded grace period", { skip: process.platform === "win32" }, async () => {
  const started = Date.now();
  await assert.rejects(runRecoveryTool(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], process.env, 1000), /time budget/);
  assert.ok(Date.now() - started < 6000, "Ignoring SIGTERM must not leave recovery waiting indefinitely");
});
