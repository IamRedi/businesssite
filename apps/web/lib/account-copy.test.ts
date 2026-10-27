import { describe, expect, it } from "vitest";
import { accountCopy } from "./account-copy";

describe("account localization", () => {
  it("provides customer access copy for exactly EN/DE", () => {
    expect(Object.keys(accountCopy).sort()).toEqual(["de", "en"]);
    for (const copy of Object.values(accountCopy)) {
      expect(copy.subscription.title).not.toHaveLength(0);
      expect(copy.login.signIn).not.toHaveLength(0);
      expect(copy.forgot.send).not.toHaveLength(0);
      expect(copy.reset.save).not.toHaveLength(0);
    }
  });
});
