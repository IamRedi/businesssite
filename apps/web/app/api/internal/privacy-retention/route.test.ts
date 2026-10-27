import { beforeEach,describe,expect,it,vi } from "vitest";
const scheduler=vi.hoisted(()=>vi.fn());
vi.mock("@platform/site-data",()=>({PostgresPrivacyRepository:class{},runPrivacyRetentionScheduler:scheduler}));
import { POST } from "./route";

describe("privacy retention scheduler boundary",()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("CRON_SECRET","c".repeat(32));});
  it("denies a missing cron credential before repository work",async()=>{
    const response=await POST(new Request("https://example.test/api/internal/privacy-retention",{method:"POST"}));
    expect(response.status).toBe(401);expect(scheduler).not.toHaveBeenCalled();
  });
  it("delegates to the execution-gated retention-scan scheduler",async()=>{
    scheduler.mockResolvedValue({enabled:false,claimed:false,planned:false});
    const response=await POST(new Request("https://example.test/api/internal/privacy-retention",{method:"POST",headers:{authorization:`Bearer ${"c".repeat(32)}`}}));
    expect(response.status).toBe(200);await expect(response.json()).resolves.toEqual({enabled:false,claimed:false,planned:false});
  });
});
