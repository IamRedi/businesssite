import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("liveness", () => {
  it("returns OK without querying PostgreSQL", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok", service: "ok", database: "not_checked",
    });
  });
});
