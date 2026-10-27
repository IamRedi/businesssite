import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  PostgresSiteRepository,
  type SubscriptionStatus,
} from "@platform/site-data";
import {
  isSocialMediaAddonPrice,
  planForStripePrice,
  stripeClient,
} from "../../../../lib/stripe";
import { planIsPurchasable } from "@platform/product-catalog";
import { invalidatePublicSiteById } from "../../../../lib/public-site-cache";
import { readTextBody } from "../../../../lib/request-body";

const unmatchedEvent = () =>
  NextResponse.json(
    { error: "Webhook event could not be matched to a checkout." },
    { status: 400 },
  );

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !secret)
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );

  let event: Stripe.Event;
  const body = await readTextBody(request, 1024 * 1024);
  if (!body.ok)
    return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    event = stripeClient().webhooks.constructEvent(
      body.value,
      signature,
      secret,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }
  const providerEventCreatedAt = Number.isFinite(Number(event.created))
    ? new Date(Number(event.created) * 1000).toISOString()
    : new Date().toISOString();

  const sites = new PostgresSiteRepository({ boundary: "system" });
  const affectedSiteIds = new Set<string>();
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const intakeId = session.metadata?.intakeId;
      const metadataSiteId = session.metadata?.siteId;
      const metadataPlan = session.metadata?.planKey;
      const priceId = session.metadata?.priceId;
      const mappedPlan = planForStripePrice(priceId);
      const isSocialAddon =
        session.metadata?.addonKey === "social_media" &&
        Boolean(metadataSiteId);
      if (isSocialAddon)
        return NextResponse.json({ received: true, ignored: true });
      if (
        session.payment_status === "paid" ||
        session.payment_status === "no_payment_required"
      ) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (
          !intakeId ||
            !metadataSiteId ||
            !subscriptionId ||
            metadataPlan !== "starter" ||
            mappedPlan !== "starter" ||
            !planIsPurchasable(mappedPlan, "stripe")
        )
          return unmatchedEvent();
        const result = await sites.processStripeSubscriptionEvent({
              eventId: event.id,
              eventType: event.type,
              providerEventCreatedAt,
              intakeId,
              siteId: metadataSiteId,
              checkoutSessionId: session.id,
              stripeCustomerId:
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id,
              stripeSubscriptionId: subscriptionId,
              stripePriceId: priceId,
              planKey: mappedPlan,
              status: "active",
            });
        if ("siteId" in result && result.siteId)
          affectedSiteIds.add(result.siteId);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      const mappedPlan = planForStripePrice(priceId);
      const trustedMetadataPlan =
        subscription.metadata?.planKey === mappedPlan && planIsPurchasable(mappedPlan, "stripe") ? mappedPlan : undefined;
      const periodEnd = subscription.items.data[0]?.current_period_end;
      const declaresSocialAddon =
        isSocialMediaAddonPrice(priceId) ||
        subscription.metadata?.addonKey === "social_media";
      const eventInput = {
        eventId: event.id,
        eventType: event.type,
        providerEventCreatedAt,
        stripeCustomerId:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        intakeId: subscription.metadata?.intakeId,
        siteId: subscription.metadata?.siteId,
        status: subscription.status as SubscriptionStatus,
        currentPeriodEnd: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : undefined,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };
      const knownSocialAddon = await sites.isAddonSubscription(subscription.id);
      const result = knownSocialAddon
        ? await sites.processStripeAddonEvent({
            ...eventInput,
            addonKey: "social_media",
            siteId: undefined,
          })
        : declaresSocialAddon
          ? { processed: true as const, ignored: true as const }
          : await sites.processStripeSubscriptionEvent({
            ...eventInput,
            planKey: trustedMetadataPlan,
          });
      if ("siteId" in result && result.siteId)
        affectedSiteIds.add(result.siteId);
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof subscription === "string" ? subscription : subscription?.id;
      if (subscriptionId) {
        const result = await sites.isAddonSubscription(subscriptionId)
          ? await sites.processStripeAddonEvent({
              eventId: event.id,
              eventType: event.type,
              providerEventCreatedAt,
              addonKey: "social_media",
              stripeSubscriptionId: subscriptionId,
              status: event.type === "invoice.paid" ? "active" : "past_due",
            })
          : await sites.processStripeSubscriptionEvent({
              eventId: event.id,
              eventType: event.type,
              providerEventCreatedAt,
              stripeSubscriptionId: subscriptionId,
              status: event.type === "invoice.paid" ? "active" : "past_due",
            });
        if ("siteId" in result && result.siteId)
          affectedSiteIds.add(result.siteId);
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Subscription activation target does not match."
    )
      return unmatchedEvent();
    throw error;
  }

  await Promise.all(
    [...affectedSiteIds].map((siteId) =>
      invalidatePublicSiteById(sites, siteId),
    ),
  );
  return NextResponse.json({ received: true });
}
