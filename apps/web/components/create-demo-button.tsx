"use client";

import {
  businessTemplates,
  templateCategories,
} from "@platform/website-engine";
import { useMemo, useState } from "react";
import type { SupportedLocale } from "@platform/website-engine";
import { ownerCopy } from "../lib/owner-copy";
import { canonicalOwnerPreviewUrl } from "../lib/owner-preview-url";
import { designEditorCopy } from "../lib/site-editor-copy";

const themeKeys = ["auto", "studio", "clarity", "forge", "gold"] as const;

export function CreateDemoButton({ leadId, locale, publicAppUrl }: { leadId: string; locale: SupportedLocale; publicAppUrl: string }) {
  const copy = (ownerCopy[locale] ?? ownerCopy.en).demo;
  const themeCopy = designEditorCopy[locale].presets;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [themeKey, setThemeKey] =
    useState<(typeof themeKeys)[number]>("auto");
  const [url, setUrl] = useState<string>();
  const [siteSlug, setSiteSlug] = useState<string>();
  const [error, setError] = useState<string>();
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [customerLocale, setCustomerLocale] = useState<"en" | "de">("en");
  const [accessMessage, setAccessMessage] = useState<string>();
  const [accessReady, setAccessReady] = useState(false);
  const options = useMemo(
    () =>
      businessTemplates.filter(
        (template) =>
          !category ||
          templateCategories
            .find((item) => item.key === category)
            ?.templates.includes(template.key as never),
      ),
    [category],
  );

  async function create() {
    setBusy(true);
    setError(undefined);
    const response = await fetch("/api/owner/demos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId,
        templateKey: templateKey || undefined,
        themeKey,
        locale,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to create the demo.");
      return;
    }
    try {
      setUrl(canonicalOwnerPreviewUrl(body.previewUrl, publicAppUrl));
    } catch {
      setError(copy.previewFailed);
      return;
    }
    setSiteSlug(body.siteSlug);
  }
  async function provisionAccess() {
    if (!url) return;
    setAccessMessage(undefined);
    const slug = url.split("/").pop();
    const response = await fetch(`/api/owner/sites/${slug}/admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, preferredLocale: customerLocale }),
    });
    const body = await response.json().catch(() => ({}));
    setAccessReady(response.ok);
    setAccessMessage(response.ok ? copy.loginReady : (body.error ?? "Unable to create the business login."));
  }
  async function copyInvitation() {
    if (!url) return;
    const preview = url;
    const login = new URL(
      "/site-admin/login",
      window.location.origin,
    ).toString();
    await navigator.clipboard.writeText(
      copy.invite(preview, login, adminEmail, adminPassword),
    );
    setAccessMessage(
      copy.invitationCopied,
    );
  }
  async function sendInvitation() {
    if (!siteSlug) return;
    setAccessMessage(undefined);
    const response = await fetch(`/api/owner/sites/${encodeURIComponent(siteSlug)}/invitation`, {
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAccessMessage(body.error ?? copy.invitationFailed);
      return;
    }
    setAccessMessage(
      body.delivery === "sent"
        ? copy.invitationSent
        : body.delivery === "provider_not_configured"
          ? copy.emailNotConfigured
          : copy.invitationFailed,
    );
  }
  async function regeneratePreview() {
    if (!url) return;
    if (!siteSlug) return;
    const response = await fetch(`/api/owner/sites/${encodeURIComponent(siteSlug)}/preview-token`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAccessMessage(body.error ?? copy.previewFailed);
      return;
    }
    try {
      setUrl(canonicalOwnerPreviewUrl(body.previewUrl, publicAppUrl));
    } catch {
      setAccessMessage(copy.previewFailed);
      return;
    }
    setAccessMessage(copy.linkReplaced);
  }

  return (
    <div className="demo-control">
      <div className="action-row">
        <button className="button compact" onClick={create} disabled={busy}>
          {busy ? copy.creating : copy.create}
        </button>
        <button
          className="theme-toggle"
          type="button"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? copy.automatic : copy.customize}
        </button>
        {url ? (
          <a className="button secondary compact" href={url} target="_blank">
            {copy.preview}
          </a>
        ) : null}
        {error ? <span className="error">{error}</span> : null}
      </div>
      {open ? (
        <div className="theme-setup">
          <label>
            <span>{copy.category}</span>
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setTemplateKey("");
              }}
            >
              <option value="">{copy.chooseCategory}</option>
              {templateCategories.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.subcategory}</span>
            <select
              value={templateKey}
              onChange={(event) => setTemplateKey(event.target.value)}
              disabled={!category}
            >
              <option value="">{copy.detect}</option>
              {options.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.key.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </label>
          <div className="theme-options">
            <span>{copy.style}</span>
            <div>
              {themeKeys.map((themeKeyOption) => (
                <button
                  type="button"
                  key={themeKeyOption}
                  className={themeKey === themeKeyOption ? "active" : ""}
                  onClick={() => setThemeKey(themeKeyOption)}
                >
                  <strong>{themeCopy[themeKeyOption].name}</strong>
                  <small>{themeCopy[themeKeyOption].detail}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {url ? (
        <div className="business-access">
          <strong>{copy.access}</strong>
          <span>
            {copy.accessHelp}
          </span>
          <div>
            <input
              value={adminEmail}
              onChange={(event) => setAdminEmail(event.target.value)}
              type="email"
              placeholder={copy.emailPlaceholder}
            />
            <input
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              type="password"
              minLength={12}
              placeholder={copy.passwordPlaceholder}
            />
            <label>Customer language<select value={customerLocale} onChange={(event) => setCustomerLocale(event.target.value as "en" | "de")}><option value="en">English</option><option value="de">Deutsch</option></select></label>
            <button
              type="button"
              className="button secondary compact"
              onClick={provisionAccess}
            >
              {copy.createLogin}
            </button>
            {accessReady ? <>
              <button type="button" className="button secondary compact" onClick={sendInvitation}>
                {copy.sendInvitation}
              </button>
              <button type="button" className="button secondary compact" onClick={copyInvitation}>
                {copy.copyInvitation}
              </button>
            </> : null}
            <button
              type="button"
              className="button secondary compact"
              onClick={regeneratePreview}
            >
              {copy.replaceLink}
            </button>
          </div>
          {accessMessage ? <small>{accessMessage}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
