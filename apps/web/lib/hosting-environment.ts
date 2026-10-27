type Environment = Record<string, string | undefined>;

// RELEASE_TARGET identifies the data/operations target; NODE_ENV only selects
// optimized Node/Next behavior. Never impersonate Vercel on a private VPS.
export function isProductionHostingTarget(environment: Environment = process.env) {
  const provider = environment.HOSTING_PROVIDER?.trim();
  if (provider === "clouvider") {
    return environment.RELEASE_TARGET?.trim() === "production" && !environment.VERCEL_ENV;
  }
  if (provider && provider !== "vercel") return false;
  return environment.VERCEL_ENV?.trim() === "production";
}

export function isStagingHostingTarget(environment: Environment = process.env) {
  const provider = environment.HOSTING_PROVIDER?.trim();
  if (provider && provider !== "vercel" && provider !== "clouvider") return false;
  return environment.RELEASE_TARGET?.trim() === "staging" &&
    environment.VERCEL_ENV?.trim() !== "production";
}
