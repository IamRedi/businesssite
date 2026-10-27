"use client";

import { useState } from "react";
import type { SupportedLocale } from "@platform/website-engine";
import type { CustomerUiLocale } from "../lib/locale-model";
import type { OwnerComplimentaryAdminLocale, OwnerComplimentaryPlan } from "../lib/owner-complimentary";
import type { WebsiteImportPreview } from "../lib/website-import";
import { BusinessCategoryCombobox } from "./business-category-combobox";
import { analyzeExistingWebsite, copyOf, importErrorMessage, initialSelections, selectionsFromAi, submissionFromSelections, WebsiteImportReview, type ImportSelections } from "./website-import-review";

/**
 * Owner complimentary creation form. The optional existing-website import
 * uses the same shared analyzer endpoint and the same Keep/Edit/Remove review
 * step as the homepage wizard; legal suggestions only prefill empty fields
 * for explicit review before creation.
 */
export function OwnerComplimentaryForm({
  action,
  siteLocales,
  adminLocales,
  plans,
  uiLocale,
  platformName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  siteLocales: readonly string[];
  adminLocales: readonly OwnerComplimentaryAdminLocale[];
  plans: readonly OwnerComplimentaryPlan[];
  uiLocale: CustomerUiLocale;
  platformName: string;
}) {
  const importCopy = copyOf(uiLocale);
  const [analyzing, setAnalyzing] = useState(false);
  const [importError, setImportError] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importPreview, setImportPreview] = useState<WebsiteImportPreview | null>(null);
  const [selections, setSelections] = useState<ImportSelections | null>(null);
  const [engine, setEngine] = useState<"ai" | "ai-cached" | "deterministic" | undefined>(undefined);
  const [understanding, setUnderstanding] = useState<Parameters<typeof WebsiteImportReview>[0]["understanding"]>(null);
  const [plan, setPlan] = useState<Parameters<typeof WebsiteImportReview>[0]["plan"]>(null);
  const [analyzeHash, setAnalyzeHash] = useState<string | undefined>(undefined);
  const [suggestionVersion, setSuggestionVersion] = useState(0);
  const [selectedSiteLocale, setSelectedSiteLocale] = useState<"en" | "de" | "fr" | "es" | "it" | "sq">("en");
  const [legalDefaults, setLegalDefaults] = useState<Record<string, string>>({});

  async function analyze(event: React.MouseEvent<HTMLButtonElement>) {
    setAnalyzing(true);
    setImportError("");
    const form = event.currentTarget.form;
    const categoryKey = form?.elements.namedItem("categoryKey") as HTMLInputElement | null;
    const subcategoryKey = form?.elements.namedItem("subcategoryKey") as HTMLInputElement | null;
    const result = await analyzeExistingWebsite(importUrl.trim(), "en", {
      categoryKey: categoryKey?.value || undefined,
      subcategoryKey: subcategoryKey?.value || undefined,
    });
    setAnalyzing(false);
    if (!result.ok) {
      setImportError(importErrorMessage("en", result.errorCode));
      return;
    }
    const preview = result.preview;
    setImportPreview(preview);
    setEngine(result.engine);
    setUnderstanding(result.understanding ?? null);
    setPlan(result.plan ?? null);
    setAnalyzeHash(result.sourceContentHash);
    setSelections(
      result.understanding && result.plan
        ? selectionsFromAi(preview, result.understanding, result.plan)
        : initialSelections(preview),
    );
    // Suggestions never overwrite owner-entered values; they only prefill
    // empty legal fields and are reviewed before creation.
    const suggestions = Object.fromEntries(Object.entries(preview.legalSuggestions)
      .filter(([, value]) => typeof value === "string" && value)
      .map(([key, value]) => [key, String(value)]));
    setLegalDefaults(suggestions);
    setSuggestionVersion((version) => version + 1);
  }

  const legalDefault = (field: string) => legalDefaults[field] ?? "";
  return (
    <form action={action} className="editorial-category-form">
      <div className="editor-grid two-columns">
        <label>Business name<input name="businessName" required maxLength={120} placeholder="Barberi i Qytetit" /></label>
        {/* Canonical registry combobox (BSRC-DESIGN-P4-001): suggestions while
            typing; categoryKey/subcategoryKey travel as hidden inputs. */}
        <label>Business category
          <BusinessCategoryCombobox locale={uiLocale} name="category" />
          <small>Chooses the starter template content. Suggestions appear while typing; pick Other / Custom for anything else.</small>
        </label>
      </div>
      <div className="editor-grid two-columns">
        <label>Customer email<input name="email" type="email" required maxLength={320} placeholder="owner@example.com" /></label>
        <label>Plan features granted<select name="planKey" defaultValue="starter">{plans.map((value) => <option key={value} value={value}>{value}</option>)}</select><small>Feature entitlement of the selected commercial plan, granted free of charge.</small></label>
      </div>
      <div className="editor-grid two-columns">
        <label>Website language<select name="siteLocale" value={selectedSiteLocale} onChange={(event) => setSelectedSiteLocale(event.target.value as "en" | "de" | "fr" | "es" | "it" | "sq")}>{siteLocales.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select><small>Content language of the generated website (all six supported site languages). The AI analysis is re-run per language.</small></label>
        <label>Admin panel language<select name="adminLocale" defaultValue="en">{adminLocales.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select><small>Site-admin UI language for the customer login (English or German).</small></label>
      </div>
      <div className="editor-grid two-columns">
        <label>Existing website URL (optional)
          <input name="importUrlProbe" type="url" maxLength={200} placeholder="https://old-business-site.de" value={importUrl} onChange={(event) => setImportUrl(event.target.value)} autoComplete="off" />
        </label>
        <label className="editor-grid">
          <button className="button secondary" type="button" disabled={analyzing || !importUrl.trim()} onClick={analyze}>
            {analyzing ? importCopy.analyzing : importCopy.analyze}
          </button>
          <small>Read-only analysis of public pages. You review everything below before the website is created.</small>
        </label>
      </div>
      {importError ? <p className="error" role="alert">{importError}</p> : null}
      {importPreview && selections ? (
        <WebsiteImportReview
          preview={importPreview}
          locale={uiLocale}
          selections={selections}
          onChange={setSelections}
          onRemove={() => { setImportPreview(null); setSelections(null); setEngine(undefined); setUnderstanding(null); setPlan(null); }}
          engine={engine}
          understanding={understanding}
          plan={plan}
        />
      ) : null}
      {importPreview && selections ? <input type="hidden" name="importPayload" value={JSON.stringify(submissionFromSelections(importPreview.sourceUrl, selections, plan, analyzeHash))} /> : null}
      <div className="editor-section-heading"><div><p className="eyebrow">Public legal identity</p><h2>Required before the website can be public</h2></div><p>Customer-owned data, validated with the same rules as the site editor. </p></div>
      <div className="editor-grid two-columns" key={`legal-${suggestionVersion}`}>
        <label>Legal / business name<input name="legalBusinessName" required maxLength={160} defaultValue={legalDefault("legalBusinessName")} /></label>
        <label>Legal contact email<input name="legalContactEmail" type="email" required maxLength={320} defaultValue={legalDefault("contactEmail")} /></label>
        <label>Street and number<input name="legalStreet" required maxLength={160} defaultValue={legalDefault("street")} /></label>
        <label>Postal code<input name="legalPostalCode" required maxLength={20} defaultValue={legalDefault("postalCode")} /></label>
        <label>City<input name="legalCity" required maxLength={80} defaultValue={legalDefault("city")} /></label>
        <label>Country code<input name="legalCountryCode" required maxLength={2} minLength={2} placeholder="AL" autoCapitalize="characters" pattern="[A-Za-z]{2}" defaultValue={legalDefault("countryCode")} /></label>
        <label>Privacy notice<select name="privacyMode" defaultValue="internal">
          <option value="internal">{platformName} privacy page (automatic)</option>
          <option value="external">External privacy URL (override)</option>
        </select><small>The platform generates the customer privacy page automatically. An external URL is only used when you choose it explicitly.</small></label>
        <label>External privacy URL<input name="legalPrivacyNoticeUrl" type="url" maxLength={500} placeholder="https://customer.example/privacy" /></label>
        <label>Internal reason / note<input name="reason" maxLength={500} placeholder="Launch partner, owned by founder…" /></label>
      </div>
      <button className="button" type="submit">Create complimentary customer</button>
    </form>
  );
}
