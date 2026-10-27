import { describe, expect, it } from "vitest";
import { createPreparedBusinessProfile } from "../src/index";
describe("finder boundary", () => it("creates the shared profile without creating a site", () => { const profile = createPreparedBusinessProfile({ id: "lead-1", name: "North Studio", score: 92 }); expect(profile.sourceLeadId).toBe("lead-1"); expect(profile.business.name).toBe("North Studio"); }));
