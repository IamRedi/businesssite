import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("legacy subscription activation endpoint", () => {
  it("is retired and cannot activate an intake", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "Subscription activation requires a verified billing webhook.",
    });
  });
});
