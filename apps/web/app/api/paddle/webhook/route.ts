import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { paddleClient, paddleLegacyLifecycleEnabled } from "../../../../lib/paddle";
import { paddleEventToSubscriptionInput } from "../../../../lib/paddle-webhook";
import { invalidatePublicSiteById } from "../../../../lib/public-site-cache";
import { readTextBody } from "../../../../lib/request-body";

export async function POST(request: Request) {
  if (!paddleLegacyLifecycleEnabled())
    return NextResponse.json(
      { error: "Paddle lifecycle processing is disabled." },
      { status: 410 },
    );
  const signature = request.headers.get("paddle-signature");
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!signature || !secret)
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });

  const body = await readTextBody(request, 1024 * 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  let event;
  try {
    event = await paddleClient().webhooks.unmarshal(body.value, secret, signature);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const input = paddleEventToSubscriptionInput(event);
  if (!input) return NextResponse.json({ received: true, ignored: true });

  const sites = new PostgresSiteRepository({ boundary: "system" });
  const result = await sites.processBillingSubscriptionEvent({
    ...input,
    // Legacy mode may update only an already-bound provider subscription.
    intakeId: undefined,
    siteId: undefined,
    planKey: undefined,
  });
  if ("siteId" in result && result.siteId)
    await invalidatePublicSiteById(sites, result.siteId);
  return NextResponse.json({ received: true });
}
