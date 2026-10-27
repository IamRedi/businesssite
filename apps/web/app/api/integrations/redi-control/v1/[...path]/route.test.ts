import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  repository: {
    listArticles: vi.fn(), getArticle: vi.fn(), listMediaAssetsPage: vi.fn(),
    getArticleByExternalReference: vi.fn(), createArticle: vi.fn(), updateArticle: vi.fn(),
    transitionArticle: vi.fn(), beginIntegrationRequest: vi.fn(),
    completeIntegrationRequest: vi.fn(), failIntegrationRequest: vi.fn(),
  },
  expire: vi.fn(),
  storeMedia: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  InformationRepositoryError: class InformationRepositoryError extends Error { constructor(public code: string) { super(code); } },
  PostgresInformationRepository: class PostgresInformationRepository { constructor() { return state.repository; } },
  PostgresSiteRepository: class PostgresSiteRepository {},
}));
vi.mock("../../../../../../lib/redi-inbound-auth", () => ({ authenticateRediInboundRequest: state.auth }));
vi.mock("../../../../../../lib/public-site-cache", () => ({ expirePublicSiteAfterMutationById: state.expire }));
vi.mock("../../../../../../lib/redi-inbound-media", () => ({
  RediMediaError: class RediMediaError extends Error {},
  storeRediInformationMedia: state.storeMedia,
}));

import { GET, POST } from "./route";

const siteId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const integrationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const articleId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const article = {
  id: articleId, siteId, externalReference: "redi-42", slug: "news", title: "News",
  excerpt: "", body: { version: 1, blocks: [] }, articleMedia: [], tags: [], status: "draft",
  featured: false, version: 1, createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z",
};

function context(...path: string[]) { return { params: Promise.resolve({ path }) }; }
function request(method: string, path: string, body?: unknown) {
  return new Request(`https://platform.test/api/integrations/redi-control/v1/${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json", "x-idempotency-key": "request-key-12345" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("REDI CONTROL information API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.mockResolvedValue({ ok: true, access: { integrationId, siteId, approvedBy: "owner", approvedAt: "2026-08-19T00:00:00.000Z", permissions: [] } });
    state.repository.beginIntegrationRequest.mockResolvedValue({ outcome: "claimed", requestHash: "hash" });
    state.repository.completeIntegrationRequest.mockResolvedValue(undefined);
    state.repository.failIntegrationRequest.mockResolvedValue(undefined);
    state.repository.getArticleByExternalReference.mockResolvedValue(null);
  });

  it("lists only the server-resolved tenant with bounded repository input", async () => {
    state.repository.listArticles.mockResolvedValue({ items: [article], nextCursor: undefined });
    const response = await GET(request("GET", "articles?limit=10"), context("articles"));
    expect(response.status).toBe(200);
    expect(state.repository.listArticles).toHaveBeenCalledWith(siteId, expect.objectContaining({ limit: 10 }));
    expect(state.repository.listArticles).not.toHaveBeenCalledWith(expect.not.stringMatching(/^bbbb/), expect.anything());
  });

  it("always creates an integration-owned draft and persists idempotency", async () => {
    state.repository.createArticle.mockResolvedValue(article);
    const payload = { externalReference: "redi-42", slug: "news", title: "News", body: { version: 1, blocks: [] } };
    const response = await POST(request("POST", "articles", payload), context("articles"));
    expect(response.status).toBe(201);
    expect(state.repository.createArticle).toHaveBeenCalledWith(expect.objectContaining({ siteId, actorType: "integration", actorId: integrationId, externalSource: "redi_control", status: "draft" }));
    expect(state.repository.completeIntegrationRequest).toHaveBeenCalledOnce();
  });

  it("uploads editorial media only into the authenticated site context", async () => {
    state.storeMedia.mockResolvedValue({ id: articleId, url: `/api/media/${articleId}`, mimeType: "image/webp", width: 1, height: 1, byteSize: 30 });
    const response = await POST(request("POST", "media", {
      filename: "cover.webp", mimeType: "image/webp", dataBase64: Buffer.from("test").toString("base64"), altText: "Cover",
    }), context("media"));
    expect(response.status).toBe(201);
    expect(state.storeMedia).toHaveBeenCalledWith(expect.objectContaining({ siteId, integrationId, filename: "cover.webp" }));
  });

  it("replays a completed idempotent mutation without writing again", async () => {
    state.repository.beginIntegrationRequest.mockResolvedValue({ outcome: "replay", requestHash: "hash", responseStatus: 201, responseBody: { article } });
    const response = await POST(request("POST", "articles", { externalReference: "redi-42", slug: "news", title: "News", body: { version: 1, blocks: [] } }), context("articles"));
    expect(response.status).toBe(201);
    expect(state.repository.createArticle).not.toHaveBeenCalled();
  });

  it("requires a pending article and records explicit publish approval", async () => {
    vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"));
    state.repository.getArticle.mockResolvedValue({ ...article, status: "pending", version: 2 });
    state.repository.transitionArticle.mockResolvedValue({ ...article, status: "published", version: 3, publishedAt: "2026-08-19T12:00:00.000Z" });
    const payload = { expectedVersion: 2, approval: { approvedBy: "publisher@redi.test", approvedAt: "2026-08-19T11:55:00.000Z" } };
    const response = await POST(request("POST", `articles/${articleId}/publish`, payload), context("articles", articleId, "publish"));
    expect(response.status).toBe(200);
    expect(state.repository.transitionArticle).toHaveBeenCalledWith(expect.objectContaining({ siteId, status: "published", auditDetails: expect.objectContaining({ approval: payload.approval }) }));
    vi.useRealTimers();
  });

  it("fails closed when authentication/permission is denied", async () => {
    state.auth.mockResolvedValue({ ok: false, status: 403, code: "permission_denied" });
    const response = await POST(request("POST", `articles/${articleId}/publish`, {}), context("articles", articleId, "publish"));
    expect(response.status).toBe(403);
    expect(state.repository.getArticle).not.toHaveBeenCalled();
  });
});
