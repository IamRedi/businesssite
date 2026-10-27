import { createHash } from "node:crypto";
import { PostgresSiteRepository } from "@platform/site-data";

export function clientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

export const rateLimitSubject = (value: string) =>
  createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

export async function enforceSubjectRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds = 60,
  repository = new PostgresSiteRepository({ boundary: "runtime" }),
) {
  return repository.consumeRateLimit({
    scope,
    subjectKey: rateLimitSubject(subject || "unknown"),
    limit,
    windowSeconds,
  });
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds = 60,
) {
  return enforceSubjectRateLimit(
    scope,
    clientAddress(request.headers),
    limit,
    windowSeconds,
  );
}
