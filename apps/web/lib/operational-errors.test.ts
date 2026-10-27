import { afterEach, describe, expect, it, vi } from "vitest";
import {
  centralErrorConfiguration,
  reportOperationalError,
  reportOperationalSignal,
} from "./operational-errors";

const request = {
  path: "/api/test?token=should-not-leak",
  method: "POST",
  headers: { "x-vercel-id": "fra1::synthetic" },
};
const context = {
  routerKind: "App Router",
  routePath: "/api/test",
  routeType: "route",
};

describe("central operational error reporting", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does no transport work when disabled", async () => {
    const transport = vi.fn();
    await expect(
      reportOperationalError(
        new Error("ignored"),
        request,
        context,
        {},
        transport,
      ),
    ).resolves.toBe("disabled");
    expect(transport).not.toHaveBeenCalled();
  });

  it("requires HTTPS, an exact host allowlist and no URL credentials", () => {
    expect(() =>
      centralErrorConfiguration({
        CENTRAL_ERROR_REPORTING_ENABLED: "true",
        CENTRAL_ERROR_REPORTING_ENDPOINT:
          "https://sink.example/events?key=secret",
        CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS: "sink.example",
      }),
    ).toThrow("Unsafe");
    expect(() =>
      centralErrorConfiguration({
        CENTRAL_ERROR_REPORTING_ENABLED: "true",
        CENTRAL_ERROR_REPORTING_ENDPOINT: "https://other.example/events",
        CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS: "sink.example",
      }),
    ).toThrow("Unsafe");
  });

  it("requires a strong sink secret for Production", () => {
    expect(() =>
      centralErrorConfiguration({
        RELEASE_TARGET: "production",
        CENTRAL_ERROR_REPORTING_ENABLED: "true",
        CENTRAL_ERROR_REPORTING_ENDPOINT: "https://sink.example/events",
        CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS: "sink.example",
      }),
    ).toThrow("strong secret");
    expect(() => centralErrorConfiguration({ RELEASE_TARGET: "production", CENTRAL_ERROR_REPORTING_ENABLED: "true", CENTRAL_ERROR_REPORTING_ENDPOINT: "https://s123.eu-central-1a.betterstackdata.com", CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS: "s123.eu-central-1a.betterstackdata.com", CENTRAL_ERROR_REPORTING_SECRET: "a".repeat(24) })).not.toThrow();
    expect(() => centralErrorConfiguration({ RELEASE_TARGET: "production", CENTRAL_ERROR_REPORTING_ENABLED: "true", CENTRAL_ERROR_REPORTING_ENDPOINT: "https://sink.example/events", CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS: "sink.example", CENTRAL_ERROR_REPORTING_SECRET: "a".repeat(24) })).toThrow("strong secret");
  });

  it("delivers bounded structured stack evidence without query or message data", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const error = new Error("private person@example.com Bearer abc.def");
    error.stack =
      "Error: private person@example.com Bearer abc.def\n    at handler (https://app.example/a?token=abc:1:2)";
    await expect(
      reportOperationalError(
        error,
        request,
        context,
        {
          RELEASE_TARGET: "staging",
          CENTRAL_ERROR_REPORTING_ENABLED: "true",
          CENTRAL_ERROR_REPORTING_ENDPOINT: "https://sink.example/events",
          CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS: "sink.example",
        },
        transport,
      ),
    ).resolves.toBe("delivered");
    const [endpoint, init] = transport.mock.calls[0];
    expect(endpoint).toBe("https://sink.example/events");
    const body = JSON.parse(String(init.body));
    expect(body.request.path).toBe("/api/test");
    expect(body.error).not.toHaveProperty("message");
    expect(JSON.stringify(body)).not.toContain("person@example.com");
    expect(JSON.stringify(body)).not.toContain("abc.def");
    expect(body.error.stackFrames[0]).toContain("token=[redacted]");
  });

  it("records a controlled local failure without throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const transport = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      reportOperationalError(
        new Error("failure"),
        request,
        context,
        {
          CENTRAL_ERROR_REPORTING_ENABLED: "true",
          CENTRAL_ERROR_REPORTING_ENDPOINT: "https://sink.example/events",
          CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS: "sink.example",
        },
        transport,
      ),
    ).resolves.toBe("delivery_failed");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).not.toContain("network");
  });

  it("delivers only allowlisted aggregate operational signals", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const codes = [
      "privacy_job_failed",
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
    ] as const;
    for (const code of codes)
      await expect(
        reportOperationalSignal(
          { code, severity: "critical", count: 2 },
          true,
          {
            RELEASE_TARGET: "staging",
            CENTRAL_ERROR_REPORTING_ENABLED: "true",
            CENTRAL_ERROR_REPORTING_ENDPOINT: "https://sink.example/events",
            CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS: "sink.example",
          },
          transport,
        ),
      ).resolves.toBe("delivered");
    const body = JSON.parse(String(transport.mock.calls[0][1].body));
    expect(body).toMatchObject({
      schema: "businesssite.operational-alert.v1",
      synthetic: true,
      level: "error",
      severity: "critical",
      message: "Operational signal: privacy_job_failed",
      signal: { code: "privacy_job_failed", severity: "critical", count: 2 },
    });
    expect(body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(transport).toHaveBeenCalledTimes(codes.length);
  });
});
