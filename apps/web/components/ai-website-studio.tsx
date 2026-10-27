"use client";

import type { WebsiteBlueprint } from "@platform/ai-assistant";
import type { SupportedLocale } from "@platform/website-engine";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canonicalOwnerAiPreviewUrl } from "../lib/owner-ai-preview-url";
import { aiStudioCopy } from "../lib/owner-workspace-copy";

export function AiWebsiteStudio({ leadId, website, locale, publicAppUrl }: { leadId: string; website?: string; locale: SupportedLocale; publicAppUrl: string }) {
  const router = useRouter();
  const copy = aiStudioCopy[locale];
  const [instructions, setInstructions] = useState("");
  const [analyzeWebsite, setAnalyzeWebsite] = useState(Boolean(website));
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [runId, setRunId] = useState("");
  const [blueprint, setBlueprint] = useState<WebsiteBlueprint>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [research, setResearch] = useState<{ status: string; pagesRead: number; sourceImages: number; visuallyAnalyzed: number }>({ status: "not_requested", pagesRead: 0, sourceImages: 0, visuallyAnalyzed: 0 });
  async function analyze() {
    if (busy) return;
    setBusy(true); setError(""); setPreviewUrl("");
    try {
      const response = await fetch("/api/owner/ai/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId, instructions, analyzeWebsite }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.runId || !body.blueprint) { setError(body.error ?? copy.analysisFailed); return; }
      setRunId(body.runId); setBlueprint(body.blueprint); setResearch({ status: body.websiteStatus, pagesRead: body.pagesRead ?? 0, sourceImages: body.sourceImagesFound ?? 0, visuallyAnalyzed: body.sourceImagesAnalyzed ?? 0 }); router.refresh();
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!runId || applying) return;
    setApplying(true); setError("");
    try {
      const response = await fetch("/api/owner/ai/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.previewUrl) { setError(body.error ?? copy.applyFailed); return; }
      setPreviewUrl(canonicalOwnerAiPreviewUrl(body.previewUrl, publicAppUrl));
    } catch {
      setError(copy.unavailable);
    } finally {
      setApplying(false);
    }
  }
  const canApply = Boolean(runId && blueprint && !busy && !applying);
  return <section className="workspace-card span-two ai-studio">
    <div className="editor-section-heading"><div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2></div><p>{copy.intro}</p></div>
    <label>{copy.direction}<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={4000} placeholder={copy.placeholder} aria-describedby="ai-direction-hint" /><small id="ai-direction-hint" className="editor-hint">{copy.hint}</small></label>
    {website ? <label className="ai-check"><input type="checkbox" checked={analyzeWebsite} onChange={(event) => setAnalyzeWebsite(event.target.checked)} /><span>{copy.analyzeExisting}</span></label> : null}
    <div className="action-row"><button type="button" className="button" disabled={busy || applying} onClick={analyze}>{busy ? copy.analyzing : copy.analyze}</button>{error ? <span className="error" role="alert">{error}</span> : null}</div>
    {blueprint ? <div className="ai-blueprint"><div className="ai-blueprint-head"><div><span>{copy.recommended}</span><h3>{blueprint.templateKey.replaceAll("-", " ")} · {blueprint.themeKey}</h3><p>{blueprint.summary}</p></div><div><span>{copy.tone}</span><strong>{blueprint.tone}</strong><span>{copy.audience}</span><strong>{blueprint.targetAudience}</strong></div></div><div className="ai-copy-preview"><div><span>{copy.hero}</span><strong>{blueprint.content.heroTitle}</strong><p>{blueprint.content.heroSubtitle}</p></div><div><span>{copy.services}</span>{blueprint.services.map((service) => <p key={service.title}><strong>{service.title}</strong> — {service.description}</p>)}</div></div><div className="ai-fact-strip"><div><span>{copy.email}</span><strong>{blueprint.businessDetails.email || copy.notFound}</strong></div><div><span>{copy.phone}</span><strong>{blueprint.businessDetails.phone || copy.notFound}</strong></div><div><span>{copy.address}</span><strong>{blueprint.businessDetails.address || copy.notFound}</strong></div><div><span>{copy.hours}</span><strong>{blueprint.businessDetails.openingHours.length ? copy.daysFound(blueprint.businessDetails.openingHours.length) : copy.notFound}</strong></div></div>{research.status === "read" ? <div className="ai-source-review"><span>{copy.research}</span><strong>{copy.researchSummary(research.pagesRead, research.sourceImages, research.visuallyAnalyzed)}</strong>{blueprint.sourceFindings.length ? <ul className="reason-list">{blueprint.sourceFindings.map((finding) => <li key={finding}>{finding}</li>)}</ul> : <p>{copy.noFacts}</p>}</div> : null}<ul className="reason-list">{blueprint.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><div className="action-row"><button type="button" className="button" disabled={!canApply} onClick={apply}>{applying ? copy.creating : copy.create}</button>{previewUrl ? <a className="button secondary" href={previewUrl} target="_blank" rel="noreferrer">{copy.openPreview}</a> : null}</div></div> : null}
  </section>;
}
