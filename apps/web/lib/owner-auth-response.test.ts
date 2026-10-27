import { describe, expect, it } from "vitest";
import { recoveryCodesResponse } from "./owner-auth-response";

describe("one-time owner recovery-code response", () => {
  it("is explicitly non-cacheable and contains only the supplied one-time codes", async () => {
    const response = recoveryCodesResponse(["ABCDE-12345-FEED0-C0FFE"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toContain("ABCDE-12345-FEED0-C0FFE");
  });

  it("escapes response content", async () => {
    expect(await recoveryCodesResponse(["<script>alert(1)</script>"]).text()).not.toContain("<script>");
  });
});
