import { beforeEach, describe, expect, it, vi } from "vitest";
const { authenticate, redirect } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../../../lib/site-admin-auth", () => ({ requireSiteAdmin: authenticate }));
import BookingPage from "./page";

describe("canonical booking workspace redirect", () => {
  beforeEach(() => vi.clearAllMocks());
  it("retains the authentication check before navigating to the workspace", async () => {
    authenticate.mockResolvedValue(null);
    await expect(BookingPage({ params: Promise.resolve({ slug: "example-studio" }) })).rejects.toThrow("redirect:/site-admin/login");
    expect(authenticate).toHaveBeenCalledWith("example-studio");
    expect(redirect).toHaveBeenCalledTimes(1);
  });
  it("preserves an authenticated booking bookmark at the canonical appointments section", async () => {
    authenticate.mockResolvedValue({ siteId: "fixture-site" });
    await expect(BookingPage({ params: Promise.resolve({ slug: "example-studio" }) })).rejects.toThrow("redirect:/site-admin/example-studio#appointments");
    expect(authenticate).toHaveBeenCalledWith("example-studio");
  });
});
