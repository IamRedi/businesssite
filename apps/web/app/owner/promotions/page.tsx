import type Stripe from "stripe";
import { redirect } from "next/navigation";
import { ownerPromotionsCopy } from "../../../lib/owner-promotions-copy";
import { ownerPanelLocale } from "../../../lib/locale-model";
import { stripeClient } from "../../../lib/stripe";
import { promotionInput, stripePromotionParams } from "../../../lib/stripe-promotions";
import { requireOwnerActionPermission, requireOwnerPagePermission } from "../../../lib/owner-authorization";

export const dynamic = "force-dynamic";

const localeTags = { de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", it: "it-IT", sq: "sq-AL" } as const;

export default async function OwnerPromotionsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  await requireOwnerPagePermission("billing.manage");
  const locale = ownerPanelLocale;
  const copy = ownerPromotionsCopy[locale];
  const result = (await searchParams).result;
  let codes: Stripe.PromotionCode[] = [];
  let configured = true;
  try {
    codes = (await stripeClient().promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] })).data;
  } catch {
    configured = false;
  }

  async function createPromotion(formData: FormData) {
    "use server";
    await requireOwnerActionPermission("promotions.create");
    let outcome = "failed";
    let couponId: string | undefined;
    try {
      const input = promotionInput(formData);
      const stripe = stripeClient();
      const duplicate = await stripe.promotionCodes.list({ active: true, code: input.code, limit: 1 });
      if (duplicate.data.length) outcome = "duplicate";
      else {
        const params = stripePromotionParams(input, locale);
        const coupon = await stripe.coupons.create(params.coupon);
        couponId = coupon.id;
        await stripe.promotionCodes.create({ ...params.promotion, promotion: { type: "coupon", coupon: coupon.id } });
        outcome = "created";
      }
    } catch (error) {
      if (couponId) await stripeClient().coupons.del(couponId).catch(() => undefined);
      outcome = error instanceof Error && /Invalid|Use 4-32|limit|Expiration/.test(error.message) ? "invalid" : "failed";
    }
    redirect(`/owner/promotions?result=${outcome}`);
  }

  async function deactivatePromotion(formData: FormData) {
    "use server";
    await requireOwnerActionPermission("promotions.deactivate");
    const id = String(formData.get("promotionId") ?? "");
    let outcome = "failed";
    if (/^promo_[A-Za-z0-9]+$/.test(id)) {
      try { await stripeClient().promotionCodes.update(id, { active: false }); outcome = "deactivated"; } catch { outcome = "failed"; }
    }
    redirect(`/owner/promotions?result=${outcome}`);
  }

  const messages: Record<string, string> = { created: copy.success, deactivated: copy.deactivated, duplicate: copy.duplicate, invalid: copy.invalid, failed: copy.failed };
  const formatDate = (seconds: number | null) => seconds ? new Intl.DateTimeFormat(localeTags[locale], { dateStyle: "medium" }).format(new Date(seconds * 1000)) : "—";

  return <main className="owner-shell owner-operations-page">
    <header className="owner-header"><div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="owner-intro">{copy.intro}</p></div><span className="secure-badge">OWNER</span></header>
    {result && messages[result] ? <p className={`promotion-result ${result === "created" || result === "deactivated" ? "success" : "error"}`}>{messages[result]}</p> : null}
    <div className="promotion-layout">
      <section className="workspace-card promotion-create"><p className="eyebrow">STRIPE</p><h2>{copy.createTitle}</h2><p>{copy.createIntro}</p>
        <form action={createPromotion} className="promotion-form">
          <label><span>{copy.preset}</span><select name="preset"><option value="launch_2_months_free">{copy.launchTwoMonthsPreset ?? "2 launch months free"}</option><option value="friends_6_months_free">{copy.friendPreset}</option><option value="launch_3_months_half">{copy.launchPreset}</option></select></label>
          <label><span>{copy.code}</span><input name="code" required minLength={4} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9-]{3,31}" placeholder={copy.codeHint} autoComplete="off" /></label>
          <label><span>{copy.redemptions}</span><input name="maxRedemptions" type="number" min="1" max="1000" defaultValue="1" /><small>{copy.redemptionsHint}</small></label>
          <label><span>{copy.expires} · {copy.optional}</span><input name="expiresOn" type="date" /></label>
          <label className="promotion-check"><input name="firstTimeOnly" type="checkbox" defaultChecked /><span>{copy.firstTime}</span></label>
          <button className="button" type="submit" disabled={!configured}>{copy.create}</button>
        </form><p className="promotion-checkout-note">{copy.checkoutNote}</p>
      </section>
      <section className="workspace-card promotion-list"><p className="eyebrow">STRIPE</p><h2>{copy.activeCodes}</h2><p>{copy.activeIntro}</p>
        {codes.length ? <div className="promotion-code-list">{codes.map((item) => {
          const coupon = typeof item.promotion.coupon === "object" ? item.promotion.coupon : null;
          return <article key={item.id}><header><div><strong>{item.code}</strong><span className={`operation-status ${item.active ? "active" : "canceled"}`}>{item.active ? copy.active : copy.inactive}</span></div><b>{coupon?.percent_off ?? 0}%</b></header>
            <dl><div><dt>{copy.duration}</dt><dd>{copy.months(coupon?.duration_in_months ?? 0)}</dd></div><div><dt>{copy.usage}</dt><dd>{item.times_redeemed} / {item.max_redemptions ?? "∞"}</dd></div><div><dt>{copy.expiration}</dt><dd>{formatDate(item.expires_at)}</dd></div><div><dt>{copy.mode}</dt><dd>{item.livemode ? copy.live : copy.test}</dd></div></dl>
            <p className="promotion-provider-id">Stripe promotion ID: <code>{item.id}</code></p>
            {item.active ? <form action={deactivatePromotion}><input type="hidden" name="promotionId" value={item.id} /><button className="button secondary compact" type="submit">{copy.deactivate}</button></form> : null}
          </article>;
        })}</div> : <p>{copy.noCodes}</p>}
      </section>
    </div>
  </main>;
}
