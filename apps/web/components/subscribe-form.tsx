"use client";

import { useState } from "react";
import type { BillingCurrency, PublicPlan } from "../lib/platform-config";
import type { AccountCopy } from "../lib/account-copy";
import type { B2BLaunchCopy } from "../lib/b2b-policy";
import { customerLifecycleCopy, localizedCustomerError } from "../lib/customer-lifecycle-copy";
import type { CustomerUiLocale } from "../lib/locale-model";

export function SubscribeForm({ plans, copy, currency, siteSlug, comingSoon, b2bCopy, taxLabel, promotionActive, initialBusinessName, locale }: { plans: PublicPlan[]; copy: AccountCopy["subscription"]; currency: BillingCurrency; siteSlug: string; comingSoon: string; b2bCopy: B2BLaunchCopy; taxLabel: string; promotionActive: boolean; initialBusinessName: string; locale: CustomerUiLocale }) {
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(data: FormData) {
    setState("sending");
    setError("");
    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        demoSlug: siteSlug,
        planKey: "starter",
        legalBusinessName: data.get("legalBusinessName"),
        countryCode: data.get("countryCode"),
        businessType: data.get("businessType"),
        vatId: data.get("vatId"),
        b2bAttested: data.get("b2bAttested") === "true",
        authorityAttested: data.get("authorityAttested") === "true",
        termsAccepted: data.get("termsAccepted") === "true",
        renewalAcknowledged: data.get("renewalAcknowledged") === "true",
        privacyAcknowledged: data.get("privacyAcknowledged") === "true",
        promotionAcknowledged: data.get("promotionAcknowledged") === "true",
        currency,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.checkoutUrl) {
      window.location.assign(body.checkoutUrl);
      return;
    }
    setError(localizedCustomerError(locale, body.errorCode));
    setState("error");
  }

  return (
    <form className="subscribe-form" action={submit}>
      <div className="plan-options">
        {plans.map((item) => (
          <button
            type="button"
            key={item.key}
            className={item.purchasable ? "active" : "coming-soon"}
            disabled={!item.purchasable}
          >
            <strong>{item.name}</strong>
            <b>{item.price}</b>
            <small>{item.description}</small>
            {!item.purchasable ? <span>{comingSoon}</span> : null}
          </button>
        ))}
      </div>
      <p className="subscription-cancellation-note"><strong>{b2bCopy.restriction}</strong><br />{taxLabel}</p>
      <div className="trial-fields">
        <label>{b2bCopy.legalName}<input required name="legalBusinessName" maxLength={160} defaultValue={initialBusinessName} autoComplete="organization" /></label>
        <label>{b2bCopy.country}<input required name="countryCode" minLength={2} maxLength={2} placeholder="DE" autoCapitalize="characters" pattern="[A-Za-z]{2}" /></label>
        <label>{b2bCopy.businessType}<select required name="businessType" defaultValue=""><option value="" disabled>—</option><option value="company">{customerLifecycleCopy[locale].checkout.company}</option><option value="sole_proprietor">{customerLifecycleCopy[locale].checkout.soleProprietor}</option><option value="other_business">{customerLifecycleCopy[locale].checkout.otherBusiness}</option></select></label>
        <label>{b2bCopy.vatId}<input name="vatId" maxLength={32} autoComplete="off" /></label>
      </div>
      <label className="legal-consent"><input required name="b2bAttested" type="checkbox" value="true" /><span>{b2bCopy.businessUse}</span></label>
      <label className="legal-consent"><input required name="authorityAttested" type="checkbox" value="true" /><span>{b2bCopy.authority}</span></label>
      <label className="legal-consent">
        <input required name="termsAccepted" type="checkbox" value="true" />
        <span>{b2bCopy.terms} <a href={`/legal/terms?lang=${locale}`} target="_blank">{customerLifecycleCopy[locale].checkout.termsLink}</a></span>
      </label>
      <label className="legal-consent"><input required name="renewalAcknowledged" type="checkbox" value="true" /><span>{b2bCopy.renewal}</span></label>
      <label className="legal-consent"><input required name="privacyAcknowledged" type="checkbox" value="true" /><span>{b2bCopy.privacy} <a href={`/legal/privacy?lang=${locale}`} target="_blank">{customerLifecycleCopy[locale].checkout.privacyLink}</a></span></label>
      {promotionActive ? <label className="legal-consent"><input required name="promotionAcknowledged" type="checkbox" value="true" /><span>{b2bCopy.promotion}</span></label> : null}
      <button className="landing-button" disabled={state === "sending"}>
        {state === "sending" ? copy.continuing : copy.continue}
      </button>
      {state === "error" ? <p className="error">{error}</p> : null}
    </form>
  );
}
