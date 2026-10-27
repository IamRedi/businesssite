import { describe, expect, it } from "vitest";
import { finderCategories, ownerCopy } from "./owner-copy";

describe("owner Finder localization", () => {
  it("keeps canonical search categories while translating every visible label", () => {
    for (const copy of Object.values(ownerCopy)) {
      expect(copy.dashboard.findBusinesses).not.toHaveLength(0);
      expect(copy.demo.sendInvitation).not.toHaveLength(0);
      expect(copy.demo.emailNotConfigured).not.toHaveLength(0);
      for (const category of finderCategories) expect(copy.categories[category]).not.toHaveLength(0);
    }
    expect(finderCategories).toContain("Car repair service");
    expect(finderCategories).toEqual(expect.arrayContaining(["Medical practice", "Dental practice", "Home care", "Psychotherapy"]));
    expect(ownerCopy.en.demo.accessHelp).toContain("during the trial");
    expect(ownerCopy.sq.demo.accessHelp).toContain("gjatë provës");
  });
});
