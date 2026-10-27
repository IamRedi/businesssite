import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAppointmentRequestNotification, sendOwnerDemoInvitation, sendOwnerTeamInvitation, sendPasswordReset, sendTrialWelcome } from "./email";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("owner team invitation email", () => {
  it("uses white-label copy, escapes HTML and keeps the token in a URL fragment", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Platform <test@example.test>");
    vi.stubEnv("PUBLIC_APP_URL", "https://platform.example");
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    expect(await sendOwnerTeamInvitation({ to: "person@example.test", token: "a".repeat(64), role: "viewer<script>", expiresAt: new Date(Date.now() + 60_000).toISOString(), brandName: "Buyer <Brand>", locale: "fr" })).toEqual({ status: "sent" });
    const body = JSON.parse(fetch.mock.calls[0][1].body as string) as { subject: string; html: string; text: string };
    expect(body.subject).toContain("Buyer <Brand>");
    expect(body.html).toContain("Buyer &lt;Brand&gt;");
    expect(body.html).toContain("viewer&lt;script&gt;");
    expect(body.html).toContain(`/owner/invitation#token=${"a".repeat(64)}`);
    expect(body.html).not.toContain(`/owner/invitation?token=`);
    expect(body.text).toContain("Privacy notice: https://platform.example/legal/privacy?lang=en");
  });

  it("reports provider failure without claiming delivery", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "test@example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect((await sendOwnerTeamInvitation({ to: "person@example.test", token: "b".repeat(64), role: "viewer", expiresAt: new Date(Date.now() + 60_000).toISOString(), brandName: "Buyer" })).status).toBe("provider_error");
  });

  it("localizes every customer transactional flow in German with plain text and escaped HTML", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "test@example.test");
    vi.stubEnv("PUBLIC_APP_URL", "https://platform.example");
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const expiry = "2026-08-25T12:00:00.000Z";
    await sendTrialWelcome({ to: "owner@example.test", businessName: "Bäckerei <Nord>", slug: "baeckerei", expiresAt: expiry, locale: "de" });
    await sendOwnerDemoInvitation({ to: "owner@example.test", businessName: "Bäckerei", previewUrl: "https://platform.example/preview/safe", passwordSetupToken: "token", expiresAt: expiry, locale: "de" });
    await sendPasswordReset({ to: "owner@example.test", token: "reset", locale: "de" });
    await sendAppointmentRequestNotification({ to: "owner@example.test", businessName: "Bäckerei\r\nBcc: attacker", customerName: "Ada <script>", phone: "123", locale: "de" });
    expect(fetch).toHaveBeenCalledTimes(4);
    const payloads = fetch.mock.calls.map((call) => JSON.parse(call[1].body as string) as { subject: string; html: string; text: string });
    expect(payloads.every((payload) => payload.text.length > 0 && payload.html.includes("lang=de"))).toBe(true);
    expect(payloads[0].subject).toContain("Ihre Test-Website");
    expect(payloads[2].subject).toContain("Passwort");
    expect(payloads[3].subject).not.toContain("\n");
    expect(payloads[3].html).toContain("Ada &lt;script&gt;");
  });
});
