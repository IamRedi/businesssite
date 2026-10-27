import { describe, expect, it } from "vitest";
import { socialAddonCopy, socialControlCopy } from "./social-control-copy";

describe("social-control copy", () => {
  it("is complete and non-empty in every customer UI locale", () => {
    expect(Object.keys(socialControlCopy).sort()).toEqual(["de", "en"]);
    expect(Object.keys(socialAddonCopy).sort()).toEqual(["de", "en"]);
    for (const copy of Object.values(socialControlCopy))
      for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(2);
    for (const copy of Object.values(socialAddonCopy))
      for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(2);
  });
});
