"use client";

import Link from "next/link";
import { useState } from "react";
import { landingCopy } from "../lib/landing-copy";
import { b2bLaunchCopy } from "../lib/b2b-policy";
import { customerLifecycleCopy, localizedCustomerError } from "../lib/customer-lifecycle-copy";
import { formatCustomerDateTime } from "../lib/locale-format";
import { resolveCustomerUiLocale, type CustomerUiLocale, type WebsiteContentLocale } from "../lib/locale-model";
import type { WebsiteImportPreview } from "../lib/website-import";
import { BusinessCategoryCombobox } from "./business-category-combobox";
import { analyzeExistingWebsite, copyOf, importErrorMessage, initialSelections, selectionsFromAi, submissionFromSelections, WebsiteImportReview, type ImportSelections } from "./website-import-review";

export function WebsiteTrialWizard({ trialDays, locale, supportedLocales }: { trialDays: number; locale: CustomerUiLocale; supportedLocales: WebsiteContentLocale[] }) {
  const copy = landingCopy[locale] ?? landingCopy.en;
  const b2b = b2bLaunchCopy(locale);
  const [step, setStep] = useState(1);
  const [state, setState] = useState<"idle" | "creating" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const importCopy = copyOf(resolveCustomerUiLocale(locale));
  const [analyzing, setAnalyzing] = useState(false);
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState<WebsiteImportPreview | null>(null);
  const [selections, setSelections] = useState<ImportSelections | null>(null);
  const [engine, setEngine] = useState<"ai" | "ai-cached" | "deterministic" | undefined>(undefined);
  const [understanding, setUnderstanding] = useState<Parameters<typeof WebsiteImportReview>[0]["understanding"]>(null);
  const [plan, setPlan] = useState<Parameters<typeof WebsiteImportReview>[0]["plan"]>(null);
  const [analyzeHash, setAnalyzeHash] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<{
    previewUrl: string;
    editorUrl: string;
    expiresAt: string;
    emailDelivery: "sent" | "provider_not_configured" | "provider_error";
  }>();

  async function continueToAccess(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    const name = form?.elements.namedItem(
      "businessName",
    ) as HTMLInputElement | null;
    const category = form?.elements.namedItem(
      "category",
    ) as HTMLInputElement | null;
    const existingUrl = form?.elements.namedItem(
      "existingWebsiteUrl",
    ) as HTMLInputElement | null;
    if (!name?.reportValidity() || !category?.reportValidity()) return;
    setError("");
    const url = existingUrl?.value.trim() ?? "";
    if (!url) {
      setImportPreview(null);
      setSelections(null);
      setStep(2);
      return;
    }
    setAnalyzing(true);
    setImportError("");
    const formKeys = form?.elements.namedItem("categoryKey") as HTMLInputElement | null;
    const formSubKeys = form?.elements.namedItem("subcategoryKey") as HTMLInputElement | null;
    const result = await analyzeExistingWebsite(url, resolveCustomerUiLocale(locale), {
      categoryKey: formKeys?.value || undefined,
      subcategoryKey: formSubKeys?.value || undefined,
    });
    setAnalyzing(false);
    if (!result.ok) {
      setImportError(importErrorMessage(resolveCustomerUiLocale(locale), result.errorCode));
      return;
    }
    setImportPreview(result.preview);
    setEngine(result.engine);
    setUnderstanding(result.understanding ?? null);
    setPlan(result.plan ?? null);
    setAnalyzeHash(result.sourceContentHash);
    setSelections(
      result.understanding && result.plan
        ? selectionsFromAi(result.preview, result.understanding, result.plan)
        : initialSelections(result.preview),
    );
    setStep(1.5);
  }

  function continueFromImport() {
    if (!selections?.acknowledged) return;
    setStep(2);
  }

  async function createTrial(formData: FormData) {
    setState("creating");
    setError("");
    const response = await fetch("/api/public/trials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessName: formData.get("businessName"),
        category: formData.get("category"),
        categoryKey: formData.get("categoryKey") || undefined,
        subcategoryKey: formData.get("subcategoryKey") || undefined,
        email: formData.get("email"),
        password: formData.get("password"),
        locale: formData.get("locale"),
        website: formData.get("website"),
        existingWebsite: importPreview && selections?.acknowledged
          ? submissionFromSelections(importPreview.sourceUrl, selections, plan, analyzeHash)
          : undefined,
                b2bAttested: formData.get("b2bAttested") === "true",
        privacyAcknowledged: formData.get("privacyAcknowledged") === "true",
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | { errorCode?: string; previewUrl?: string; editorUrl?: string; expiresAt?: string; emailDelivery?: "sent" | "provider_not_configured" | "provider_error" }
      | null;
    if (!response.ok) {
      setError(localizedCustomerError(resolveCustomerUiLocale(locale), body?.errorCode));
      setState("error");
      return;
    }
    if (!body?.previewUrl || !body.editorUrl || !body.expiresAt || !body.emailDelivery) {
      setError(copy.wizard.createFailed);
      setState("error");
      return;
    }
    setResult({
      previewUrl: body.previewUrl!,
      editorUrl: body.editorUrl!,
      expiresAt: body.expiresAt!,
      emailDelivery: body.emailDelivery!,
    });
    setState("done");
    setStep(3);
  }

  return (
    <section id="create" className="trial-builder">
      <div className="trial-intro">
        <p className="landing-eyebrow">{copy.wizard.eyebrow}</p>
        <h2>{copy.wizard.title}</h2>
        <p>{copy.wizard.body(trialDays)}</p>
        <ul>
          {copy.wizard.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
        </ul>
      </div>
      <form action={createTrial} className="trial-wizard">
        <input className="form-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <div className="trial-progress">
          <span className={step >= 1 ? "active" : ""}>1. {copy.wizard.business}</span>
          <span className={step >= 2 ? "active" : ""}>2. {copy.wizard.secure}</span>
          <span className={step >= 3 ? "active" : ""}>3. {copy.wizard.ready}</span>
        </div>
        <div className={`trial-fields ${step === 1 ? "" : "trial-hidden"}`}>
          <label>
            {copy.wizard.business}
            <input
              required
              name="businessName"
              maxLength={120}
              placeholder={locale === "de" ? "Beispiel Studio" : "Example Studio"}
            />
          </label>
          <label>
            {copy.wizard.category}
            <BusinessCategoryCombobox locale={locale} name="category" required />
          </label>
          <label>
            {copy.wizard.siteLanguage}
            <select name="locale" defaultValue={locale}>
              {supportedLocales.map((item) => (
                <option key={item} value={item}>{item.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.wizard.existingWebsite}
            <input
              name="existingWebsiteUrl"
              type="url"
              maxLength={200}
              placeholder="https://old-business-site.de"
              autoComplete="off"
            />
          </label>
          <p className="trial-template-note wide">
            {copy.wizard.existingWebsiteNote}
          </p>
          {importError ? <p className="error wide">{importError}</p> : null}
          <button
            type="button"
            className="landing-button"
            disabled={analyzing}
            onClick={continueToAccess}
          >
            {analyzing ? importCopy.analyzing : copy.wizard.continue}
          </button>
        </div>
        {step === 1.5 && importPreview && selections ? (
          <div className={`trial-fields ${step === 1.5 ? "" : "trial-hidden"}`}>
            <WebsiteImportReview
              preview={importPreview}
              locale={resolveCustomerUiLocale(locale)}
              selections={selections}
              onChange={setSelections}
              onRemove={() => { setImportPreview(null); setSelections(null); setEngine(undefined); setUnderstanding(null); setPlan(null); setStep(1); }}
              engine={engine}
              understanding={understanding}
              plan={plan}
            />
            <div className="trial-actions">
              <button type="button" className="trial-back" onClick={() => setStep(1)}>{copy.wizard.back}</button>
              <button type="button" className="landing-button" disabled={!selections.acknowledged} onClick={continueFromImport}>
                {copy.wizard.continue}
              </button>
            </div>
          </div>
        ) : null}
        <div className={`trial-fields ${step === 2 ? "" : "trial-hidden"}`}>
          <div className="trial-summary wide">
            <span>{copy.wizard.secure}</span>
            <strong>{copy.wizard.secureDescription} {b2b.restriction}</strong>
          </div>
          <label>
            {copy.wizard.email}
            <input
              required
              name="email"
              type="email"
              maxLength={160}
              autoComplete="email"
              placeholder={locale === "de" ? "sie@unternehmen.de" : "you@business.com"}
            />
          </label>
          <label className="legal-consent wide"><input required name="b2bAttested" type="checkbox" value="true" /><span>{b2b.businessUse}</span></label>
          <label className="legal-consent wide"><input required name="privacyAcknowledged" type="checkbox" value="true" /><span>{b2b.privacy} <Link href={`/legal/privacy?lang=${resolveCustomerUiLocale(locale)}`} target="_blank">{customerLifecycleCopy[resolveCustomerUiLocale(locale)].common.privacy}</Link></span></label>
          <label>
            {copy.wizard.password}
            <input
              required
              name="password"
              type="password"
              minLength={12}
              autoComplete="new-password"
              placeholder={copy.wizard.passwordPlaceholder}
            />
          </label>
          <div className="trial-actions">
            <button
              type="button"
              className="trial-back"
              onClick={() => setStep(importPreview ? 1.5 : 1)}
            >
              {copy.wizard.back}
            </button>
            <button className="landing-button" disabled={state === "creating"}>
              {state === "creating"
                ? copy.wizard.creating
                : copy.wizard.create(trialDays)}
            </button>
          </div>
          {error ? <p className="error wide">{error}</p> : null}
        </div>
        {step === 3 && result ? (
          <div className="trial-result">
            <span>{copy.wizard.ready}</span>
            <h3>{copy.wizard.readyTitle(trialDays)}</h3>
            <p>{copy.wizard.readyBody}</p>
            <div>
              <Link
                className="landing-button"
                href={result.previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                {copy.wizard.open}
              </Link>
              <Link className="trial-back" href={result.editorUrl}>
                {copy.wizard.edit}
              </Link>
            </div>
            <small>
              {copy.wizard.ends} {formatCustomerDateTime(resolveCustomerUiLocale(locale), result.expiresAt)}.
            </small>
            {result.emailDelivery !== "sent" ? (
              <small className="error">
                {result.emailDelivery === "provider_not_configured"
                  ? copy.wizard.emailMissing
                  : copy.wizard.emailFailed}
              </small>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
