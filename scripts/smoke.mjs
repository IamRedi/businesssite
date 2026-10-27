const origin = process.env.PUBLIC_APP_URL?.trim();
if (!origin) {
  console.error("MISSING  PUBLIC_APP_URL — set the deployed application origin before smoke checks.");
  process.exit(1);
}
try {
  const response = await fetch(new URL("/api/health", origin), { redirect: "error" });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== "ok") throw new Error("health endpoint is not healthy");
  console.log("OK       /api/health — application and database are healthy");
} catch {
  console.error("INVALID  /api/health — could not verify the deployed application");
  process.exitCode = 1;
}
