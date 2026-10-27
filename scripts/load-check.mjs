const targetValue = process.env.LOAD_TEST_URL?.trim();
if (!targetValue) {
  console.error("MISSING  LOAD_TEST_URL — set an explicit local or staging URL.");
  process.exit(1);
}

let target;
try {
  target = new URL(targetValue);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error();
} catch {
  console.error("INVALID  LOAD_TEST_URL — use a complete HTTP(S) URL.");
  process.exit(1);
}

const boundedInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};
const requestCount = boundedInteger(process.env.LOAD_TEST_REQUESTS, 100, 1_000);
const concurrency = boundedInteger(process.env.LOAD_TEST_CONCURRENCY, 10, 50);
const timeoutMs = boundedInteger(process.env.LOAD_TEST_TIMEOUT_MS, 10_000, 60_000);
const durations = [];
const statuses = new Map();
let cursor = 0;
let failures = 0;

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= requestCount) return;
    const started = performance.now();
    try {
      const response = await fetch(target, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "WhiteLabelLoadCheck/1.0" },
      });
      durations.push(performance.now() - started);
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      if (!response.ok) failures += 1;
      await response.body?.cancel();
    } catch {
      durations.push(performance.now() - started);
      failures += 1;
    }
  }
}

const runStarted = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, worker));
const elapsedMs = performance.now() - runStarted;
durations.sort((a, b) => a - b);
const percentile = (ratio) => durations[Math.min(durations.length - 1, Math.floor(durations.length * ratio))] ?? 0;

console.log(`Target: ${target.origin}${target.pathname}`);
console.log(`Requests: ${requestCount}; concurrency: ${concurrency}; failures: ${failures}`);
console.log(`Statuses: ${[...statuses].map(([status, count]) => `${status}=${count}`).join(", ") || "none"}`);
console.log(`Latency ms: p50=${percentile(0.5).toFixed(1)} p95=${percentile(0.95).toFixed(1)} max=${percentile(1).toFixed(1)}`);
console.log(`Throughput: ${(requestCount / (elapsedMs / 1000)).toFixed(1)} requests/second`);

if (failures) process.exitCode = 1;
