import type { OperationalSignal } from "@platform/site-data";

type ErrorRequest = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type ErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
  revalidateReason?: string;
  renderType?: string;
};

type ErrorTransport = typeof fetch;
type Environment = Record<string, string | undefined>;

const enabled = (environment: Environment) =>
  environment.CENTRAL_ERROR_REPORTING_ENABLED?.trim() === "true";

const productionTarget = (environment: Environment) =>
  environment.RELEASE_TARGET?.trim() === "production" ||
  environment.VERCEL_ENV?.trim() === "production";

const strongCentralSinkSecret = (secret: string | undefined, hostname: string) =>
  Boolean(secret && (secret.length >= 32 || (/^[A-Za-z0-9]{24}$/.test(secret) && (hostname === "betterstackdata.com" || hostname.endsWith(".betterstackdata.com")))));

const bounded = (value: string, maximum: number) => value.slice(0, maximum);
const sha256 = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

const safePath = (value: string) => {
  try {
    return bounded(new URL(value, "https://monitoring.invalid").pathname, 500);
  } catch {
    return "/invalid-path";
  }
};

const stackFrames = (error: unknown) => {
  if (!(error instanceof Error) || !error.stack) return [];
  return error.stack
    .split("\n")
    .slice(1, 41)
    .map((line) =>
      bounded(
        line
          .replace(
            /([?&](?:token|key|secret|signature|code)=)[^&\s)]+/gi,
            "$1[redacted]",
          )
          .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
          .replace(
            /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
            "[redacted-email]",
          ),
        500,
      ),
    );
};

const errorName = (error: unknown) =>
  bounded(error instanceof Error ? error.name || "Error" : typeof error, 80);

const errorDigest = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("digest" in error))
    return undefined;
  const value = String(error.digest);
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : undefined;
};

export type CentralErrorConfiguration =
  | { enabled: false }
  | {
      enabled: true;
      endpoint: string;
      secret?: string;
      timeoutMs: number;
    };

export function centralErrorConfiguration(
  environment: Environment = process.env,
): CentralErrorConfiguration {
  if (!enabled(environment)) return { enabled: false };
  const endpointValue =
    environment.CENTRAL_ERROR_REPORTING_ENDPOINT?.trim() || "";
  const allowedHosts = new Set(
    (environment.CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new Error("Invalid central error reporting endpoint.");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !allowedHosts.has(endpoint.hostname.toLowerCase())
  )
    throw new Error("Unsafe central error reporting endpoint.");
  const secret = environment.CENTRAL_ERROR_REPORTING_SECRET?.trim();
  if (productionTarget(environment) && !strongCentralSinkSecret(secret, endpoint.hostname.toLowerCase()))
    throw new Error(
      "Production central error reporting requires a strong secret.",
    );
  const configuredTimeout = Number.parseInt(
    environment.CENTRAL_ERROR_REPORTING_TIMEOUT_MS || "3000",
    10,
  );
  return {
    enabled: true,
    endpoint: endpoint.toString(),
    secret,
    timeoutMs:
      Number.isInteger(configuredTimeout) && configuredTimeout >= 500
        ? Math.min(configuredTimeout, 5000)
        : 3000,
  };
}

export async function reportOperationalError(
  error: unknown,
  request: ErrorRequest,
  context: ErrorContext,
  environment: Environment = process.env,
  transport: ErrorTransport = fetch,
) {
  let configuration: CentralErrorConfiguration;
  try {
    configuration = centralErrorConfiguration(environment);
  } catch {
    console.error("CENTRAL_ERROR_REPORTING_CONFIGURATION_INVALID");
    return "configuration_invalid" as const;
  }
  if (!configuration.enabled) return "disabled" as const;

  const name = errorName(error);
  const routePath = bounded(context.routePath || "unknown", 300);
  const frames = stackFrames(error);
  const fingerprint = await sha256(
    `${name}\n${routePath}\n${frames.slice(0, 3).join("\n")}`,
  );
  const requestIdValue = request.headers["x-vercel-id"];
  const requestId = Array.isArray(requestIdValue)
    ? requestIdValue[0]
    : requestIdValue;
  const payload = {
    schema: "businesssite.operational-error.v1",
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    environment: bounded(
      environment.VERCEL_ENV || environment.RELEASE_TARGET || "local",
      40,
    ),
    deploymentId: bounded(environment.VERCEL_DEPLOYMENT_ID || "unknown", 120),
    fingerprint,
    error: {
      name,
      digest: errorDigest(error),
      stackFrames: frames,
    },
    request: {
      method: bounded(request.method || "UNKNOWN", 16),
      path: safePath(request.path),
      requestId: requestId ? bounded(requestId, 160) : undefined,
    },
    context: {
      routerKind: bounded(context.routerKind || "unknown", 40),
      routePath,
      routeType: bounded(context.routeType || "unknown", 40),
      renderSource: context.renderSource
        ? bounded(context.renderSource, 80)
        : undefined,
      renderType: context.renderType
        ? bounded(context.renderType, 40)
        : undefined,
      revalidateReason: context.revalidateReason
        ? bounded(context.revalidateReason, 40)
        : undefined,
    },
  };

  try {
    const response = await transport(configuration.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "OperationalErrorReporter/1.0",
        ...(configuration.secret
          ? { authorization: `Bearer ${configuration.secret}` }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(configuration.timeoutMs),
    });
    if (!response.ok) throw new Error("sink rejected event");
    return "delivered" as const;
  } catch {
    console.error(
      JSON.stringify({
        schema: "businesssite.operational-error-delivery.v1",
        eventId: payload.eventId,
        fingerprint,
        status: "delivery_failed",
      }),
    );
    return "delivery_failed" as const;
  }
}

const allowedOperationalSignals = new Set([
  "database_connection_saturation",
  "billing_webhook_rejected",
  "privacy_job_failed",
  "privacy_job_blocked",
  "privacy_job_stale_lease",
  "privacy_job_overdue_retry",
  "privacy_provider_cleanup_problem",
  "scheduled_backup_failed",
  "backup_stale",
  "backup_integrity_failed",
  "restore_drill_failed",
  "recovery_target_readiness_failed",
  "privacy_export_generation_failed",
  "privacy_export_storage_failed",
  "privacy_export_persistence_uncertain",
  "privacy_export_cleanup_failed",
  "privacy_export_stuck",
  "privacy_export_object_missing",
  "privacy_export_security_invariant_violation",
]);

export async function reportOperationalSignal(
  signal: OperationalSignal,
  synthetic = false,
  environment: Environment = process.env,
  transport: ErrorTransport = fetch,
) {
  let configuration: CentralErrorConfiguration;
  try {
    configuration = centralErrorConfiguration(environment);
  } catch {
    console.error("CENTRAL_ERROR_REPORTING_CONFIGURATION_INVALID");
    return "configuration_invalid" as const;
  }
  if (!configuration.enabled) return "disabled" as const;
  if (
    !allowedOperationalSignals.has(signal.code) ||
    !["warning", "critical"].includes(signal.severity) ||
    !Number.isSafeInteger(signal.count) ||
    signal.count < 1 ||
    signal.count > 1_000_000_000
  ) {
    console.error("OPERATIONAL_SIGNAL_INVALID");
    return "signal_invalid" as const;
  }

  const fingerprint = await sha256(
    `operational-signal\n${signal.code}\n${synthetic ? "synthetic" : "live"}`,
  );
  const payload = {
    schema: "businesssite.operational-alert.v1",
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    level: signal.severity === "critical" ? "error" : "warning",
    severity: signal.severity,
    message: `Operational signal: ${signal.code}`,
    environment: bounded(
      environment.VERCEL_ENV || environment.RELEASE_TARGET || "local",
      40,
    ),
    deploymentId: bounded(environment.VERCEL_DEPLOYMENT_ID || "unknown", 120),
    fingerprint,
    synthetic,
    signal,
  };
  try {
    const response = await transport(configuration.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "OperationalAlertReporter/1.0",
        ...(configuration.secret
          ? { authorization: `Bearer ${configuration.secret}` }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(configuration.timeoutMs),
    });
    if (!response.ok) throw new Error("sink rejected event");
    return "delivered" as const;
  } catch {
    console.error(
      JSON.stringify({
        schema: "businesssite.operational-alert-delivery.v1",
        eventId: payload.eventId,
        fingerprint,
        signal: signal.code,
        status: "delivery_failed",
      }),
    );
    return "delivery_failed" as const;
  }
}
