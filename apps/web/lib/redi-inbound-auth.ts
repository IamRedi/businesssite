import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  PostgresInformationRepository,
  type RediInboundPermission,
} from "@platform/site-data";
import { configuredPlatformHosts, normalizeRequestHost } from "./host-security";

export type RediInboundAccess = NonNullable<
  Awaited<ReturnType<PostgresInformationRepository["getRediInboundAccess"]>>
>;

export type RediInboundAuthResult =
  | { ok: true; access: RediInboundAccess }
  | { ok: false; status: 401 | 403 | 404 | 503; code: string };

const noncePattern = /^[A-Za-z0-9._:-]{16,200}$/;
const signaturePattern = /^v1=([0-9a-f]{64})$/i;
const maximumClockSkewSeconds = 300;

export function rediInboundCanonicalRequest(input: {
  integrationId: string;
  timestamp: string;
  nonce: string;
  method: string;
  pathname: string;
  rawBody: string;
}) {
  const bodyHash = createHash("sha256").update(input.rawBody, "utf8").digest("hex");
  return [input.integrationId, input.timestamp, input.nonce, input.method.toUpperCase(), input.pathname, bodyHash].join("\n");
}

export function signRediInboundRequest(
  secret: string,
  input: Parameters<typeof rediInboundCanonicalRequest>[0],
) {
  return `v1=${createHmac("sha256", secret).update(rediInboundCanonicalRequest(input)).digest("hex")}`;
}

function signaturesMatch(received: string, expected: string) {
  const receivedMatch = received.match(signaturePattern);
  const expectedMatch = expected.match(signaturePattern);
  if (!receivedMatch?.[1] || !expectedMatch?.[1]) return false;
  const left = Buffer.from(receivedMatch[1], "hex");
  const right = Buffer.from(expectedMatch[1], "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function authenticateRediInboundRequest(input: {
  request: Request;
  rawBody: string;
  permission: RediInboundPermission;
  repository: PostgresInformationRepository;
  now?: number;
}): Promise<RediInboundAuthResult> {
  const host = normalizeRequestHost(input.request.headers.get("host"));
  if (!host || !configuredPlatformHosts().has(host))
    return { ok: false, status: 404, code: "route_not_found" };
  if (process.env.REDI_CONTROL_INBOUND_ENABLED !== "true")
    return { ok: false, status: 503, code: "integration_unavailable" };
  const secret = process.env.REDI_CONTROL_INBOUND_SECRET?.trim() ?? "";
  if (secret.length < 32)
    return { ok: false, status: 503, code: "integration_unavailable" };

  const externalInstallationId = input.request.headers.get("x-integration-id")?.trim() ?? "";
  const timestamp = input.request.headers.get("x-signature-timestamp")?.trim() ?? "";
  const nonce = input.request.headers.get("x-signature-nonce")?.trim() ?? "";
  const signature = input.request.headers.get("x-signature")?.trim() ?? "";
  if (!externalInstallationId || externalInstallationId.length > 300 || !/^\d{10}$/.test(timestamp) || !noncePattern.test(nonce) || !signaturePattern.test(signature))
    return { ok: false, status: 401, code: "authentication_failed" };

  const signedAtSeconds = Number(timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(signedAtSeconds) || Math.abs(now - signedAtSeconds * 1000) > maximumClockSkewSeconds * 1000)
    return { ok: false, status: 401, code: "authentication_failed" };

  const expected = signRediInboundRequest(secret, {
    integrationId: externalInstallationId,
    timestamp,
    nonce,
    method: input.request.method,
    pathname: `${new URL(input.request.url).pathname}${new URL(input.request.url).search}`,
    rawBody: input.rawBody,
  });
  if (!signaturesMatch(signature, expected))
    return { ok: false, status: 401, code: "authentication_failed" };

  const repository = input.repository;
  const access = await repository.getRediInboundAccess(externalInstallationId, input.permission);
  if (!access)
    return { ok: false, status: 403, code: "integration_not_authorized" };
  if (!access.permissions.includes(input.permission))
    return { ok: false, status: 403, code: "permission_denied" };
  const consumed = await repository.consumeIntegrationNonce({
    integrationId: access.integrationId,
    siteId: access.siteId,
    nonce,
    signedAt: new Date(signedAtSeconds * 1000).toISOString(),
    toleranceSeconds: maximumClockSkewSeconds,
  });
  if (!consumed)
    return { ok: false, status: 401, code: "authentication_failed" };
  return { ok: true, access };
}
