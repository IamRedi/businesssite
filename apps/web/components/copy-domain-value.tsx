"use client";

import { useState } from "react";

export function CopyDomainValue({ value, label, copiedLabel }: {
  value: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="domain-copy" type="button" onClick={copy} aria-label={`${label}: ${value}`}>
      {copied ? copiedLabel : label}
    </button>
  );
}
