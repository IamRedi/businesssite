import { describe, expect, it } from "vitest";
import { readJsonBody, readTextBody } from "./request-body";

describe("bounded JSON body", () => {
  it("accepts valid JSON within the limit", async () => {
    const request = new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) });
    expect(await readJsonBody(request, 100)).toEqual({ ok: true, value: { ok: true } });
  });

  it("rejects oversized and wrong-content-type requests before parsing", async () => {
    const oversized = new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json", "content-length": "1000" }, body: "{}" });
    expect(await readJsonBody(oversized, 10)).toMatchObject({ ok: false, status: 413 });
    const wrongType = new Request("https://example.test", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    expect(await readJsonBody(wrongType, 10)).toMatchObject({ ok: false, status: 415 });
  });
});

describe("readTextBody", () => {
  it("preserves the exact signed payload", async () => {
    const payload = "{\"id\":\"evt_1\",\"value\":\"\u00e4\"}";
    const result = await readTextBody(new Request("https://example.test", { method: "POST", body: payload }), 1024);
    expect(result).toEqual({ ok: true, value: payload });
  });
});
