import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import Stripe from "stripe";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

if (process.env.ALLOW_STRIPE_TEST_CLOCK_ACCEPTANCE !== "true")
  throw new Error("Set ALLOW_STRIPE_TEST_CLOCK_ACCEPTANCE=true to run this sandbox acceptance test.");

const databaseUrl = required("DATABASE_URL");
const stripeSecret = required("STRIPE_SECRET_KEY");
const starterPrice = required("STRIPE_PRICE_STARTER");
const baseUrl = required("ACCEPTANCE_BASE_URL").replace(/\/$/, "");
const acceptanceBypassSecret = process.env.ACCEPTANCE_BYPASS_SECRET?.trim();
if (!stripeSecret.startsWith("sk_test_")) throw new Error("Only a Stripe test secret is accepted.");
if (!starterPrice.startsWith("price_")) throw new Error("STRIPE_PRICE_STARTER must be a Stripe Price ID.");
if (!baseUrl.startsWith("https://")) throw new Error("ACCEPTANCE_BASE_URL must be an HTTPS staging URL.");

const stripe = new Stripe(stripeSecret);
const pool = new pg.Pool({ connectionString: databaseUrl });
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

async function waitFor(label, probe, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await pause(2_000);
  }
  throw new Error(`${label} timed out. Last result: ${JSON.stringify(last)}`);
}

async function waitForClock(clockId) {
  return waitFor(`Stripe clock ${clockId}`, async () => {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    return clock.status === "ready" ? clock : null;
  });
}

async function advanceClock(clockId, frozenTime) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: frozenTime });
  return waitForClock(clockId);
}

async function createTechnicalTrial(kind) {
  const email = `stripe-clock-${kind}-${runId}@example.test`;
  const response = await fetch(`${baseUrl}/api/public/trials`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(acceptanceBypassSecret
        ? { "x-vercel-protection-bypass": acceptanceBypassSecret }
        : {}),
    },
    body: JSON.stringify({
      businessName: `Stripe Clock ${kind} QA ${runId}`,
      category: "Automotive service",
      email,
      password: randomBytes(24).toString("base64url"),
      locale: "en",
      b2bAttested: true,
      privacyAcknowledged: true,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Trial creation failed (${response.status}): ${text.slice(0, 300)}`);
  const siteResult = await pool.query(
    "select id,slug,visibility from sites where trial_email=$1 order by created_at desc limit 1",
    [email],
  );
  const site = siteResult.rows[0];
  if (!site) throw new Error(`Technical site was not persisted for ${kind}.`);
  const intakeId = randomUUID();
  await pool.query(
    "insert into subscriber_intakes(id,email,business_name,demo_site_id,plan_key) values($1,$2,$3,$4,'starter')",
    [intakeId, email, `Stripe Clock ${kind} QA ${runId}`, site.id],
  );
  return { email, intakeId, siteId: site.id, slug: site.slug };
}

async function createClockSubscription(kind, paymentMethod) {
  const trial = await createTechnicalTrial(kind);
  const frozenTime = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: frozenTime,
    name: `BusinessSite RC ${kind} ${runId}`,
  });
  const customer = await stripe.customers.create({
    email: trial.email,
    test_clock: clock.id,
    metadata: { acceptance: "stripe_test_clock", kind, runId },
  });
  const attachedPaymentMethod = await stripe.paymentMethods.attach(paymentMethod, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: attachedPaymentMethod.id },
  });
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: starterPrice }],
    default_payment_method: attachedPaymentMethod.id,
    trial_end: frozenTime + 600,
    metadata: {
      intakeId: trial.intakeId,
      siteId: trial.siteId,
      planKey: "starter",
      priceId: starterPrice,
      acceptance: "stripe_test_clock",
      kind,
      runId,
    },
  });
  await waitFor(`${kind} subscription association`, async () => {
    const result = await pool.query(
      "select status from site_subscriptions where site_id=$1 and stripe_subscription_id=$2",
      [trial.siteId, subscription.id],
    );
    return result.rows[0]?.status === "trialing" ? result.rows[0] : null;
  });
  return { ...trial, clockId: clock.id, customerId: customer.id, subscriptionId: subscription.id, frozenTime };
}

async function subscriptionState(siteId) {
  const result = await pool.query(
    "select sub.status,sub.stripe_subscription_id,sub.current_period_end,sub.last_processed_event_id,sub.first_past_due_at,sub.payment_grace_ends_at,s.visibility,s.activated_at,i.status as intake_status from site_subscriptions sub join sites s on s.id=sub.site_id left join subscriber_intakes i on i.demo_site_id=s.id where sub.site_id=$1 order by i.created_at desc limit 1",
    [siteId],
  );
  return result.rows[0];
}

async function runRenewal() {
  const scenario = await createClockSubscription("renewal", "pm_card_visa");
  await advanceClock(scenario.clockId, scenario.frozenTime + 600);
  await advanceClock(scenario.clockId, scenario.frozenTime + 4_300);
  await waitFor("initial successful payment", async () => {
    const state = await subscriptionState(scenario.siteId);
    return state?.status === "active" && state.visibility === "public" ? state : null;
  });
  const firstInvoices = await stripe.invoices.list({ subscription: scenario.subscriptionId, limit: 20 });
  const firstPaidCount = firstInvoices.data.filter((invoice) => invoice.status === "paid" && invoice.amount_paid > 0).length;
  const liveSubscription = await stripe.subscriptions.retrieve(scenario.subscriptionId);
  const periodEnd = liveSubscription.items.data[0]?.current_period_end;
  if (!periodEnd) throw new Error("Renewal period end was not returned by Stripe.");
  await advanceClock(scenario.clockId, periodEnd);
  await advanceClock(scenario.clockId, periodEnd + 3_700);
  const renewed = await waitFor("renewal invoice payment", async () => {
    const invoices = await stripe.invoices.list({ subscription: scenario.subscriptionId, limit: 20 });
    const paidCount = invoices.data.filter((invoice) => invoice.status === "paid" && invoice.amount_paid > 0).length;
    return paidCount > firstPaidCount ? { paidCount } : null;
  });
  const state = await waitFor("renewal database state", async () => {
    const value = await subscriptionState(scenario.siteId);
    return value?.status === "active" && value.visibility === "public" ? value : null;
  });
  return { ...scenario, result: "passed", paidInvoices: renewed.paidCount, state };
}

async function runFailure() {
  const scenario = await createClockSubscription("failure", "pm_card_chargeCustomerFail");
  await advanceClock(scenario.clockId, scenario.frozenTime + 600);
  await advanceClock(scenario.clockId, scenario.frozenTime + 4_300);
  const failedState = await waitFor("failed payment database state", async () => {
    const value = await subscriptionState(scenario.siteId);
    return value?.status === "past_due" && value.visibility === "public" && value.first_past_due_at && value.payment_grace_ends_at ? value : null;
  });
  const invoices = await stripe.invoices.list({ subscription: scenario.subscriptionId, limit: 20 });
  const failedInvoice = invoices.data.find((invoice) => invoice.status === "open" && invoice.attempted);
  if (!failedInvoice)
    throw new Error("Stripe did not record the expected attempted, open invoice.");
  const recoveredPaymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: scenario.customerId });
  await stripe.customers.update(scenario.customerId, {
    invoice_settings: { default_payment_method: recoveredPaymentMethod.id },
  });
  await stripe.subscriptions.update(scenario.subscriptionId, {
    default_payment_method: recoveredPaymentMethod.id,
  });
  await stripe.invoices.pay(failedInvoice.id);
  const recoveredState = await waitFor("successful payment retry database state", async () => {
    const value = await subscriptionState(scenario.siteId);
    return value?.status === "active" && value.visibility === "public" ? value : null;
  });
  return { ...scenario, result: "passed", failedState, recoveredState };
}

try {
  const renewal = await runRenewal();
  const failure = await runFailure();
  console.log(JSON.stringify({
    runId,
    renewal: {
      result: renewal.result,
      siteId: renewal.siteId,
      slug: renewal.slug,
      clockId: renewal.clockId,
      subscriptionId: renewal.subscriptionId,
      paidInvoices: renewal.paidInvoices,
      databaseStatus: renewal.state.status,
      visibility: renewal.state.visibility,
    },
    failure: {
      result: failure.result,
      siteId: failure.siteId,
      slug: failure.slug,
      clockId: failure.clockId,
      subscriptionId: failure.subscriptionId,
      failedDatabaseStatus: failure.failedState.status,
      failedVisibility: failure.failedState.visibility,
      firstPastDueAt: failure.failedState.first_past_due_at,
      graceEndsAt: failure.failedState.payment_grace_ends_at,
      recoveredDatabaseStatus: failure.recoveredState.status,
      recoveredVisibility: failure.recoveredState.visibility,
    },
  }, null, 2));
} finally {
  await pool.end();
}
