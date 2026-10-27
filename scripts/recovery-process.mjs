import { spawn } from "node:child_process";

export function runRecoveryTool(program, args, environment, timeoutMs = 10 * 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { env: environment, stdio: ["ignore", "ignore", "ignore"] });
    let timedOut = false;
    let forceTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      reject(new Error("PostgreSQL client could not start; raw details withheld."));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      if (code === 0 && !timedOut) resolve();
      else reject(new Error(timedOut ? "PostgreSQL client time budget exceeded." : `PostgreSQL client failed (exit ${code ?? "signal"}); raw details withheld.`));
    });
  });
}
