import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ComplimentaryLegalIdentityIncompleteError } from "@platform/site-data";
import { redirect } from "next/navigation";
import OwnerComplimentaryPage from "./page";
import { OwnerComplimentaryForm } from "../../../components/owner-complimentary-form";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), list: vi.fn(), expire: vi.fn(),
  owner: { sessionHash: "synthetic-owner-session", correlationId: "hotfix-test" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@platform/site-data", async importOriginal => ({
  ...await importOriginal<typeof import("@platform/site-data")>(),
  PostgresSiteRepository: class {
    createComplimentaryCustomer = mocks.create;
    listComplimentaryAccess = mocks.list;
  },
}));
vi.mock("next/navigation", async importOriginal => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, redirect: vi.fn(actual.redirect) };
});
vi.mock("../../../lib/owner-authorization", () => ({
  requireOwnerPagePermission: vi.fn(async () => mocks.owner),
  requireOwnerActionPermission: vi.fn(async () => mocks.owner),
}));
vi.mock("../../../lib/public-site-cache", () => ({ expirePublicSiteAfterMutation: mocks.expire }));
vi.mock("../../../components/owner-complimentary-form", () => ({ OwnerComplimentaryForm: () => null }));

function validForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    businessName: "Hotfix Acceptance", category: "barber", email: "hotfix@example.test",
    siteLocale: "de", adminLocale: "de", planKey: "starter", reason: "synthetic test",
    legalBusinessName: "Hotfix Acceptance", legalContactEmail: "legal@example.test",
    legalStreet: "Teststrasse 1", legalPostalCode: "10115", legalCity: "Berlin",
    legalCountryCode: "DE", privacyMode: "internal",
  })) form.set(key, value);
  return form;
}

function creationAction(node: ReactNode): ((form: FormData) => Promise<void>) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ action?: (form: FormData) => Promise<void>; children?: ReactNode }>(child)) continue;
    if (child.type === OwnerComplimentaryForm) return child.props.action;
    const found = creationAction(child.props.children);
    if (found) return found;
  }
}

async function runCreation() {
  const page = await OwnerComplimentaryPage({ searchParams: Promise.resolve({}) });
  const action = creationAction(page);
  expect(action).toBeTypeOf("function");
  try {
    await action!(validForm());
  } catch (error) {
    if (!isRedirectError(error)) throw error;
    return new URL(getURLFromRedirectError(error)!, "https://platform.example.test");
  }
  throw new Error("Expected the framework redirect to propagate");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.expire.mockReset();
  mocks.list.mockResolvedValue([]);
  mocks.create.mockReset().mockResolvedValue({ siteId: "synthetic-site", slug: "hotfix-acceptance" });
});

describe("complimentary creation redirect regression", () => {
  it("propagates the real successful Next.js redirect without a false failure or duplicate creation", async () => {
    const url = await runCreation();
    expect(url.pathname).toBe("/owner/complimentary");
    expect(url.searchParams.get("message")).toBe("created");
    expect(url.searchParams.get("slug")).toBe("hotfix-acceptance");
    expect(url.searchParams.has("setup")).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(mocks.expire).toHaveBeenCalledWith({ kind: "slug", value: "hotfix-acceptance" });
  });

  it("redirects once to createdAdjusted with the allocated slug and original request", async () => {
    mocks.create.mockResolvedValue({ siteId: "synthetic-site", slug: "hotfix-acceptance-2" });
    const url = await runCreation();
    expect(url.searchParams.get("message")).toBe("createdAdjusted");
    expect(url.searchParams.get("slug")).toBe("hotfix-acceptance-2");
    expect(url.searchParams.get("requested")).toBe("hotfix-acceptance");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(mocks.expire).toHaveBeenCalledWith({ kind: "slug", value: "hotfix-acceptance-2" });
  });

  it.each([
    [new Error("slug_taken"), "slug"],
    [new Error("email_taken"), "email"],
    [new ComplimentaryLegalIdentityIncompleteError(["street"]), "legal"],
    [new Error("unexpected database failure"), "failed"],
    ["non-Error database rejection", "failed"],
  ])("preserves the expected creation error mapping to %s / %s", async (error, message) => {
    mocks.create.mockRejectedValue(error);
    const url = await runCreation();
    expect(url.searchParams.get("message")).toBe(message);
    expect(url.searchParams.has("setup")).toBe(false);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("does not reclassify a post-creation cache error or retry an already committed creation", async () => {
    const error = new Error("cache invalidation unavailable");
    mocks.expire.mockImplementation(() => { throw error; });
    await expect(runCreation()).rejects.toBe(error);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("complimentary result banner", () => {
  it.each(["created", "createdAdjusted", "revoked"])("styles %s as success", async message => {
    const page = await OwnerComplimentaryPage({ searchParams: Promise.resolve({ message }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('<p class="success">');
    expect(html).not.toContain('<p class="error"');
  });

  it("keeps an actual failure styled as error", async () => {
    const page = await OwnerComplimentaryPage({ searchParams: Promise.resolve({ message: "failed" }) });
    expect(renderToStaticMarkup(page)).toContain('<p class="error">');
  });
});
