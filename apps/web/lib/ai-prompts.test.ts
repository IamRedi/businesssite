import { describe, expect, it } from "vitest";
import { ownerWebsiteInstructions } from "./ai-prompts";

describe("owner website instructions", () => {
  it("requires source-led work when existing website evidence is sufficient", () => {
    const instructions = ownerWebsiteInstructions("civil-engineering [tiefbau]", "de");

    expect(instructions).toContain("SOURCE-LED MODE");
    expect(instructions).toContain("every distinct verified service family");
    expect(instructions).toContain("Return an empty array when no source proves them");
  });
});
