import { createHash, createHmac, randomUUID } from "node:crypto";

export type SocialControlConfiguration = {
  enabled: boolean;
  apiUrl?: string;
  appUrl?: string;
  integrationId?: string;
  secret?: string;
  timeoutMs: number;
};

export type SocialWorkspaceProvisionInput = {
  externalSiteId: string;
  businessName: string;
  locale: string;
  admin: { externalUserId: string; email: string };
};

export type SocialWorkspaceProvisionResult = {
  installationId: string;
  tenantId: string;
  workspaceId: string;
  status: "active";
};

export type SocialSessionInput = {
  installationId: string;
  externalSiteId: string;
  externalUserId: string;
  locale: string;
};

export type SocialSessionResult = { url: string; expiresAt: string };

export interface SocialControlGateway {
  provisionWorkspace(input: SocialWorkspaceProvisionInput, idempotencyKey: string): Promise<SocialWorkspaceProvisionResult>;
  createSession(input: SocialSessionInput, idempotencyKey: string): Promise<SocialSessionResult>;
}

export class SocialControlError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SocialControlError";
  }
}

const bool = (value?: string) => value?.trim().toLowerCase() === "true";
const boundedTimeout = (value?: string) => {
  const parsed = Number(value ?? 8000);
  return Number.isSafeInteger(parsed) && parsed >= 1000 && parsed <= 30000 ? parsed : 8000;
};

export const socialControlConfigurationFromEnv = (env: NodeJS.ProcessEnv = process.env): SocialControlConfiguration => ({
  enabled: bool(env.REDI_CONTROL_ENABLED),
  apiUrl: env.REDI_CONTROL_API_URL?.trim().replace(/\/$/, "") || undefined,
  appUrl: env.REDI_CONTROL_APP_URL?.trim().replace(/\/$/, "") || undefined,
  integrationId: env.REDI_CONTROL_INTEGRATION_ID?.trim() || undefined,
  secret: env.REDI_CONTROL_INTEGRATION_SECRET?.trim() || undefined,
  timeoutMs: boundedTimeout(env.REDI_CONTROL_REQUEST_TIMEOUT_MS),
});

const validHttpUrl = (value: string, production: boolean) => {
  const url = new URL(value);
  if (url.protocol === "https:") return url;
  if (!production && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return url;
  throw new SocialControlError("invalid_configuration_url");
};

export const validateSocialControlConfiguration = (
  config: SocialControlConfiguration,
  production = process.env.NODE_ENV === "production",
) => {
  if (!config.enabled) return { enabled: false as const };
  if (!config.apiUrl || !config.appUrl || !config.integrationId || !config.secret)
    throw new SocialControlError("incomplete_configuration");
  if (config.secret.length < 32) throw new SocialControlError("weak_integration_secret");
  validHttpUrl(config.apiUrl, production);
  validHttpUrl(config.appUrl, production);
  return { enabled: true as const };
};

type HttpDependencies = {
  fetch?: typeof fetch;
  now?: () => number;
  nonce?: () => string;
};

export const signedRequestHeaders = (input: {
  integrationId: string;
  secret: string;
  timestamp: string;
  nonce: string;
  method: string;
  pathname: string;
  body: string;
  idempotencyKey: string;
}) => {
  const digest = createHash("sha256").update(input.body).digest("hex");
  const canonical = [input.timestamp, input.nonce, input.method.toUpperCase(), input.pathname, digest].join("\n");
  const signature = createHmac("sha256", input.secret).update(canonical).digest("hex");
  return {
    "content-type": "application/json",
    "x-integration-id": input.integrationId,
    "x-integration-timestamp": input.timestamp,
    "x-integration-nonce": input.nonce,
    "x-integration-signature": `v1=${signature}`,
    "x-idempotency-key": input.idempotencyKey,
  };
};

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 300) => typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;

export class HttpSocialControlGateway implements SocialControlGateway {
  private readonly config: Required<Pick<SocialControlConfiguration, "apiUrl" | "appUrl" | "integrationId" | "secret">> & SocialControlConfiguration;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly nonce: () => string;

  constructor(config: SocialControlConfiguration, dependencies: HttpDependencies = {}) {
    validateSocialControlConfiguration(config);
    this.config = config as typeof this.config;
    this.fetcher = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? Date.now;
    this.nonce = dependencies.nonce ?? randomUUID;
  }

  private async post(pathname: string, payload: unknown, idempotencyKey: string) {
    if (!idempotencyKey || idempotencyKey.length > 200) throw new SocialControlError("invalid_idempotency_key");
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(this.now() / 1000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(`${this.config.apiUrl}${pathname}`, {
        method: "POST",
        body,
        signal: controller.signal,
        headers: signedRequestHeaders({
          integrationId: this.config.integrationId,
          secret: this.config.secret,
          timestamp,
          nonce: this.nonce(),
          method: "POST",
          pathname,
          body,
          idempotencyKey,
        }),
      });
      if (!response.ok) throw new SocialControlError(`provider_http_${response.status}`);
      const responseBody: unknown = await response.json().catch(() => null);
      if (!record(responseBody)) throw new SocialControlError("invalid_provider_response");
      return responseBody;
    } catch (error) {
      if (error instanceof SocialControlError) throw error;
      throw new SocialControlError(error instanceof Error && error.name === "AbortError" ? "provider_timeout" : "provider_unavailable");
    } finally {
      clearTimeout(timer);
    }
  }

  async provisionWorkspace(input: SocialWorkspaceProvisionInput, idempotencyKey: string) {
    const body = await this.post("/api/integrations/v1/workspaces/provision", input, idempotencyKey);
    const result = {
      installationId: text(body.installationId), tenantId: text(body.tenantId), workspaceId: text(body.workspaceId), status: body.status,
    };
    if (!result.installationId || !result.tenantId || !result.workspaceId || result.status !== "active")
      throw new SocialControlError("invalid_provision_response");
    return result as SocialWorkspaceProvisionResult;
  }

  async createSession(input: SocialSessionInput, idempotencyKey: string) {
    const body = await this.post("/api/integrations/v1/sessions", input, idempotencyKey);
    const url = text(body.url, 2000);
    const expiresAt = text(body.expiresAt);
    if (!url || !expiresAt || Number.isNaN(Date.parse(expiresAt))) throw new SocialControlError("invalid_session_response");
    const destination = new URL(url);
    const allowedOrigin = new URL(this.config.appUrl).origin;
    if (destination.origin !== allowedOrigin) throw new SocialControlError("invalid_session_origin");
    return { url: destination.toString(), expiresAt };
  }
}

export const createSocialControlGateway = (config = socialControlConfigurationFromEnv()) => {
  validateSocialControlConfiguration(config);
  return new HttpSocialControlGateway(config);
};
