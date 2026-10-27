"use client";

import { useState } from "react";
import type { SupportedLocale } from "@platform/website-engine";

type Field = "heroSubtitle" | "aboutBody" | "serviceDescription";

const copy: Record<SupportedLocale, { improve: string; review: string; placeholder: string; generate: string; writing: string; failed: string }> = {
  de: { improve: "Mit AI verbessern", review: "Vor dem Speichern prüfen", placeholder: "Wärmer, kürzer oder hochwertiger…", generate: "Generieren", writing: "Schreibt…", failed: "Die AI-Überarbeitung ist fehlgeschlagen." },
  en: { improve: "Improve with AI", review: "Review before saving", placeholder: "Make it warmer, shorter or more premium…", generate: "Generate", writing: "Writing…", failed: "AI rewrite failed." },
  fr: { improve: "Améliorer avec l’IA", review: "Vérifier avant d’enregistrer", placeholder: "Plus chaleureux, court ou haut de gamme…", generate: "Générer", writing: "Rédaction…", failed: "La réécriture par IA a échoué." },
  es: { improve: "Mejorar con IA", review: "Revisar antes de guardar", placeholder: "Más cálido, breve o premium…", generate: "Generar", writing: "Redactando…", failed: "La reescritura con IA falló." },
  it: { improve: "Migliora con l’IA", review: "Controlla prima di salvare", placeholder: "Più caldo, breve o premium…", generate: "Genera", writing: "Scrittura…", failed: "La riscrittura con IA non è riuscita." },
  sq: { improve: "Përmirëso me AI", review: "Kontrolloje para ruajtjes", placeholder: "Bëje më të ngrohtë, të shkurtër ose premium…", generate: "Gjenero", writing: "Po shkruan…", failed: "Rishkrimi me AI dështoi." },
};

export function AiRewriteField({ slug, name, label, initialValue, field, locale, aiEnabled = true }: { slug: string; name: string; label: string; initialValue: string; field: Field; locale: SupportedLocale; aiEnabled?: boolean }) {
  // Older demos can predate the locale field; never let an incomplete record crash the editor.
  const labels = copy[locale] ?? copy.en;
  const [value, setValue] = useState(initialValue);
  const [instructions, setInstructions] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function rewrite() {
    setBusy(true); setError("");
    const response = await fetch(`/api/site-admin/${encodeURIComponent(slug)}/ai/rewrite`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ field, currentText: value, instructions }),
    });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(body.error ?? labels.failed); return; }
    setValue(body.text); setOpen(false);
  }
  return <label className="ai-rewrite-field">{label}<textarea name={name} value={value} onChange={(event) => setValue(event.target.value)} /><span className="ai-field-actions"><button type="button" disabled={!aiEnabled} onClick={() => setOpen((current) => !current)}>✦ {labels.improve}</button><small>{aiEnabled ? labels.review : "AI is unavailable during payment recovery."}</small></span>{open && aiEnabled ? <span className="ai-rewrite-prompt"><input value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={800} placeholder={labels.placeholder} /><button type="button" disabled={busy} onClick={rewrite}>{busy ? labels.writing : labels.generate}</button><small>Text is sent to the configured AI provider only when you choose Generate. <a href="/legal/privacy" target="_blank">Privacy notice</a></small></span> : null}{error ? <small className="error">{error}</small> : null}</label>;
}
