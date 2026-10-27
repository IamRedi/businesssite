import { describe, expect, it } from "vitest";

import { shouldRecordAiAnalysisStatus } from "./owner-ai-pipeline";

describe("Owner AI pipeline status", () => {
  it("records analysis while the lead has not progressed beyond analysis", () => {
    expect(shouldRecordAiAnalysisStatus()).toBe(true);
    expect(shouldRecordAiAnalysisStatus("discovered")).toBe(true);
    expect(shouldRecordAiAnalysisStatus("analyzed")).toBe(true);
  });

  it.each([
    "qualified",
    "profile_prepared",
    "demo_ready",
    "contacted",
    "interested",
    "converted",
    "rejected",
    "archived",
  ])("does not regress a lead already at %s", (status) => {
    expect(shouldRecordAiAnalysisStatus(status)).toBe(false);
  });
});
