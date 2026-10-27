export function billingExecutionEnabled() {
  return process.env.BILLING_EXECUTION_ENABLED === "true";
}

export function aiExecutionEnabled() {
  return process.env.AI_EXECUTION_ENABLED === "true";
}

export function demoCleanupExecutionEnabled() {
  return process.env.DEMO_CLEANUP_EXECUTION_ENABLED === "true";
}
