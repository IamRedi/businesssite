import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("customer-admin manifest", () => {
  it("is scoped to customer admin and uses the centralized profile", async () => {
    const body = await (await GET()).json();
    expect(body.scope).toBe("/site-admin/");
    expect(body.start_url).toBe("/site-admin/login");
    expect(body.name).toContain("BusinessSite RC");
    expect(body.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
  });
});
