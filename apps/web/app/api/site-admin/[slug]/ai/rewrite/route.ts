import { NextResponse } from "next/server";
import { textRewriteSchema, validateTextRewrite } from "@platform/ai-assistant";
import { PostgresSiteRepository } from "@platform/site-data";
import { aiConfig, configuredAiProvider } from "../../../../../../lib/ai-config";
import { clientRewriteInstructions } from "../../../../../../lib/ai-prompts";
import { requireSiteAdmin } from "../../../../../../lib/site-admin-auth";
import { trustedSiteAdminSessionHash } from "../../../../../../lib/site-admin-auth";
import { acquireTenantConcurrency, enforceTenantQuota } from "../../../../../../lib/tenant-usage-policy";
import { authorizedSiteCapability } from "../../../../../../lib/product-access";

const allowedFields = {
  heroSubtitle: "hero introduction",
  aboutBody: "about section",
  serviceDescription: "service description",
} as const;

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!aiConfig.clientEnabled) return NextResponse.json({ error: "Client AI assistance is not enabled." }, { status: 503 });
  const { slug } = await context.params;
  const session = await requireSiteAdmin(slug);
  if (!session) return NextResponse.json({ error: "Business admin authorization required." }, { status: 403 });
  let runId: string | undefined;
  let leaseId: string | undefined;
  let siteId: string | undefined;
  const sites = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(session) });
  try {
    siteId = (await sites.getSiteIdBySlug(slug)) ?? undefined;
    if (!siteId) return NextResponse.json({ error: "Website not found." }, { status: 404 });
    if (!(await authorizedSiteCapability(sites, session, slug, "ai_rewrite")))
      return NextResponse.json({ error: "AI assistance is unavailable for this subscription." }, { status: 403 });
    const body = (await request.json()) as { field?: keyof typeof allowedFields; currentText?: string; instructions?: string };
    if (!body.field || !allowedFields[body.field]) return NextResponse.json({ error: "This field cannot be changed with AI." }, { status: 400 });
    const currentText = body.currentText?.trim().slice(0, 2000) ?? "";
    const instructions = body.instructions?.trim().slice(0, 800) ?? "Improve clarity and professionalism.";
    if (!currentText) return NextResponse.json({ error: "Add some text before asking AI to improve it." }, { status: 400 });
    const site = await sites.getBySlug(slug);
    if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
    const quota = await enforceTenantQuota(sites, {
      siteId,
      metric: "client_ai_rewrite",
    });
    if (!quota.allowed)
      return NextResponse.json(
        {
          error: "AI usage limit reached. Please try again later.",
          state: quota.state,
          retryAfterSeconds: quota.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "retry-after": String(quota.retryAfterSeconds ?? 60) },
        },
      );
    const concurrency = await acquireTenantConcurrency(sites, {
      siteId,
      operation: "client_ai_rewrite",
      ttlSeconds: 90,
    });
    if (!concurrency.allowed)
      return NextResponse.json(
        { error: "Another AI request is already running. Please wait." },
        { status: 429, headers: { "retry-after": String(concurrency.retryAfterSeconds) } },
      );
    leaseId = concurrency.leaseId;
    runId = await sites.startAiRun({
      actorType: "site_admin", actorId: session.email, operation: "text_rewrite", siteId,
      provider: aiConfig.provider, model: aiConfig.clientModel, input: { field: body.field, instructions, currentText },
    });
    const result = await configuredAiProvider().structured({
      model: aiConfig.clientModel,
      instructions: clientRewriteInstructions(site.locale, allowedFields[body.field]),
      input: JSON.stringify({ currentText, clientRequest: instructions }),
      schemaName: "website_text_rewrite", schema: textRewriteSchema, validate: validateTextRewrite, reasoningEffort: "none",
    });
    await sites.completeAiRun(runId, result.value, result.usage, result.responseId);
    return NextResponse.json({ text: result.value.text, runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI could not rewrite this text.";
    if (runId) await sites.failAiRun(runId, message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (leaseId && siteId)
      await sites.releaseTenantConcurrency(siteId, leaseId).catch(() => undefined);
  }
}
