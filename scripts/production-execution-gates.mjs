export const masterExecutionGateNames = [
  "BILLING_EXECUTION_ENABLED",
  "AI_EXECUTION_ENABLED",
  "DEMO_CLEANUP_EXECUTION_ENABLED",
];

export function unsafeProductionMasterGates(environment, production) {
  if (!production) return [];
  return masterExecutionGateNames
    .filter((name) => environment[name] !== "false")
    .map((name) => `${name} (Production candidate requires explicit false)`);
}
