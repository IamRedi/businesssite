import { NextResponse } from "next/server";
import {
  InformationRepositoryError,
  PostgresInformationRepository,
  PostgresSiteRepository,
  type RediInboundPermission,
} from "@platform/site-data";
import { authenticateRediInboundRequest } from "../../../../../../lib/redi-inbound-auth";
import {
  parseArticleListQuery,
  parseCreateArticle,
  parseMediaListQuery,
  parseMediaUpload,
  parsePublish,
  parseTransition,
  parseUpdateArticle,
  RediContractError,
  serializeArticle,
  serializeArticleSummary,
} from "../../../../../../lib/redi-inbound-contract";
import { storeRediInformationMedia, RediMediaError } from "../../../../../../lib/redi-inbound-media";
import { expirePublicSiteAfterMutationById } from "../../../../../../lib/public-site-cache";
import { readTextBody } from "../../../../../../lib/request-body";

type Context = { params: Promise<{ path: string[] }> };
type RouteDefinition = { operation: string; permission: RediInboundPermission; articleId?: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyPattern = /^[A-Za-z0-9._:-]{8,200}$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function routeFor(method: string, path: string[]): RouteDefinition | null {
  if (path.length === 1 && path[0] === "articles") {
    if (method === "GET") return { operation: "articles.list", permission: "articles:read" };
    if (method === "POST") return { operation: "articles.create", permission: "articles:create" };
  }
  if (path.length === 1 && path[0] === "media") {
    if (method === "GET") return { operation: "media.list", permission: "media:read" };
    if (method === "POST") return { operation: "media.create", permission: "media:write" };
  }
  const articleId = path[1];
  if (path[0] === "articles" && articleId && uuid.test(articleId)) {
    if (path.length === 2 && method === "GET") return { operation: "articles.read", permission: "articles:read", articleId };
    if (path.length === 2 && method === "PATCH") return { operation: "articles.update", permission: "articles:update", articleId };
    if (path.length === 3 && method === "POST" && path[2] === "submit") return { operation: "articles.submit", permission: "articles:submit", articleId };
    if (path.length === 3 && method === "POST" && path[2] === "publish") return { operation: "articles.publish", permission: "articles:publish", articleId };
    if (path.length === 3 && method === "POST" && path[2] === "archive") return { operation: "articles.archive", permission: "articles:archive", articleId };
  }
  return null;
}

async function rawRequestBody(request: Request, operation: string) {
  if (request.method === "GET") return { ok: true as const, raw: "", parsed: undefined };
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") return { ok: false as const, response: json({ error: { code: "unsupported_media_type" } }, 415) };
  const body = await readTextBody(request, operation === "media.create" ? 5_800_000 : 256 * 1024);
  if (!body.ok) return { ok: false as const, response: json({ error: { code: body.status === 413 ? "request_too_large" : "invalid_request" } }, body.status) };
  try {
    return { ok: true as const, raw: body.value, parsed: JSON.parse(body.value) as unknown };
  } catch {
    return { ok: false as const, response: json({ error: { code: "invalid_json" } }, 400) };
  }
}

function mapError(error: unknown) {
  if (error instanceof RediContractError) return json({ error: { code: "invalid_request", field: error.field, message: error.message } }, 400);
  if (error instanceof RediMediaError) return json({ error: { code: error.code } }, error.status);
  if (error instanceof InformationRepositoryError) {
    if (error.code === "article_not_found") return json({ error: { code: "article_not_found" } }, 404);
    if (error.code === "article_version_conflict") return json({ error: { code: "version_conflict" } }, 409);
    if (error.code === "invalid_article_transition") return json({ error: { code: "invalid_article_transition" } }, 409);
    if (error.code.includes("media") || error.code.includes("category")) return json({ error: { code: "invalid_tenant_reference" } }, 400);
    if (error.code.includes("unique") || error.code.includes("slug")) return json({ error: { code: "article_conflict" } }, 409);
  }
  return json({ error: { code: "internal_error" } }, 500);
}

async function execute(input: {
  request: Request;
  route: RouteDefinition;
  parsed: unknown;
  siteId: string;
  integrationId: string;
  approvedBy: string;
  approvedAt: string;
  repository: PostgresInformationRepository;
}) {
  const { route, repository, siteId, integrationId } = input;
  if (route.operation === "articles.list") {
    const page = await repository.listArticles(siteId, parseArticleListQuery(new URL(input.request.url)));
    return { status: 200, body: { items: page.items.map(serializeArticleSummary), nextCursor: page.nextCursor ?? null } };
  }
  if (route.operation === "articles.read") {
    const article = await repository.getArticle(siteId, route.articleId!);
    return article ? { status: 200, body: { article: serializeArticle(article) } } : { status: 404, body: { error: { code: "article_not_found" } } };
  }
  if (route.operation === "media.list") {
    const page = await repository.listMediaAssetsPage(siteId, parseMediaListQuery(new URL(input.request.url)));
    return { status: 200, body: { items: page.items, nextCursor: page.nextCursor ?? null } };
  }
  if (route.operation === "media.create") {
    const media = parseMediaUpload(input.parsed);
    const asset = await storeRediInformationMedia({ siteId, integrationId, ...media, information: repository });
    return { status: 201, body: { media: asset } };
  }
  if (route.operation === "articles.create") {
    const articleInput = parseCreateArticle(input.parsed);
    const existing = await repository.getArticleByExternalReference(siteId, articleInput.externalReference!);
    if (existing) return { status: 200, body: { article: serializeArticle(existing), externalReferenceReplay: true } };
    let article;
    try {
      article = await repository.createArticle({
        ...articleInput,
        actorType: "integration",
        actorId: integrationId,
        siteId,
        externalSource: "redi_control",
        status: "draft",
      });
    } catch (error) {
      const databaseCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const raced = databaseCode === "23505"
        ? await repository.getArticleByExternalReference(siteId, articleInput.externalReference!)
        : null;
      if (raced) return { status: 200, body: { article: serializeArticle(raced), externalReferenceReplay: true } };
      throw error;
    }
    return { status: 201, body: { article: serializeArticle(article), externalReferenceReplay: false } };
  }

  const current = await repository.getArticle(siteId, route.articleId!);
  if (!current) return { status: 404, body: { error: { code: "article_not_found" } } };
  if (route.operation === "articles.update") {
    if (current.status !== "draft") return { status: 409, body: { error: { code: "draft_required" } } };
    const update = parseUpdateArticle(input.parsed);
    const article = await repository.updateArticle({ ...update, actorType: "integration", actorId: integrationId, siteId, articleId: current.id });
    return { status: 200, body: { article: serializeArticle(article) } };
  }
  if (route.operation === "articles.submit") {
    if (current.status !== "draft") return { status: 409, body: { error: { code: "draft_required" } } };
    const transition = parseTransition(input.parsed);
    const article = await repository.transitionArticle({ ...transition, actorType: "integration", actorId: integrationId, siteId, articleId: current.id, status: "pending", auditDetails: { integrationOperation: route.operation } });
    return { status: 200, body: { article: serializeArticle(article) } };
  }
  if (route.operation === "articles.publish") {
    if (current.status !== "pending") return { status: 409, body: { error: { code: "approved_pending_article_required" } } };
    const transition = parsePublish(input.parsed);
    const article = await repository.transitionArticle({
      expectedVersion: transition.expectedVersion,
      actorType: "integration",
      actorId: integrationId,
      siteId,
      articleId: current.id,
      status: "published",
      auditDetails: {
        approval: transition.approval,
        integrationGrant: { approvedBy: input.approvedBy, approvedAt: input.approvedAt },
      },
    });
    return { status: 200, body: { article: serializeArticle(article) } };
  }
  const transition = parseTransition(input.parsed);
  const article = await repository.transitionArticle({ ...transition, actorType: "integration", actorId: integrationId, siteId, articleId: current.id, status: "archived", auditDetails: { integrationOperation: route.operation } });
  return { status: 200, body: { article: serializeArticle(article) } };
}

async function handle(request: Request, context: Context) {
  const path = (await context.params).path ?? [];
  const route = routeFor(request.method, path);
  if (!route) return json({ error: { code: "route_not_found" } }, 404);
  const requestBody = await rawRequestBody(request, route.operation);
  if (!requestBody.ok) return requestBody.response;
  const bootstrapRepository = new PostgresInformationRepository({ boundary: "system" });
  const auth = await authenticateRediInboundRequest({ request, rawBody: requestBody.raw, permission: route.permission, repository: bootstrapRepository });
  if (!auth.ok) return json({ error: { code: auth.code } }, auth.status);
  const repository = new PostgresInformationRepository({
    boundary: "system",
    integrationId: auth.access.integrationId,
    siteId: auth.access.siteId,
    permission: route.permission,
  });

  const mutation = request.method !== "GET";
  const idempotencyKey = request.headers.get("x-idempotency-key")?.trim() ?? "";
  if (mutation && !idempotencyPattern.test(idempotencyKey))
    return json({ error: { code: "idempotency_key_required" } }, 400);
  let requestHash = "";
  if (mutation) {
    const claim = await repository.beginIntegrationRequest({
      integrationId: auth.access.integrationId,
      siteId: auth.access.siteId,
      idempotencyKey,
      operation: route.operation,
      requestBody: requestBody.raw,
    });
    if (claim.outcome === "conflict") return json({ error: { code: "idempotency_conflict" } }, 409);
    if (claim.outcome === "in_progress") return json({ error: { code: "request_in_progress" } }, 409);
    if (claim.outcome === "replay") return json(claim.responseBody, claim.responseStatus);
    requestHash = claim.requestHash;
  }

  try {
    const result = await execute({
      request,
      route,
      parsed: requestBody.parsed,
      siteId: auth.access.siteId,
      integrationId: auth.access.integrationId,
      approvedBy: auth.access.approvedBy,
      approvedAt: auth.access.approvedAt,
      repository,
    });
    if (mutation) {
      await repository.completeIntegrationRequest({ integrationId: auth.access.integrationId, idempotencyKey, requestHash, responseStatus: result.status, responseBody: result.body });
      await expirePublicSiteAfterMutationById(
        new PostgresSiteRepository({ boundary: "system", integrationId: auth.access.integrationId }),
        auth.access.siteId,
      );
    }
    return json(result.body, result.status);
  } catch (error) {
    const response = mapError(error);
    if (mutation) {
      const body = await response.clone().json();
      await repository.failIntegrationRequest({ integrationId: auth.access.integrationId, idempotencyKey, requestHash, responseStatus: response.status, responseBody: body }).catch(() => undefined);
    }
    return response;
  }
}

export function GET(request: Request, context: Context) { return handle(request, context); }
export function POST(request: Request, context: Context) { return handle(request, context); }
export function PATCH(request: Request, context: Context) { return handle(request, context); }
