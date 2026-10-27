import { NextResponse } from "next/server";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);

export function recoveryCodesResponse(codes: string[], nextPath = "/owner") {
  const items = codes.map((code) => `<li><code>${escapeHtml(code)}</code></li>`).join("");
  const response = new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Owner recovery codes</title></head><body><main><h1>Save your recovery codes now</h1><p>Each code works once. They will not be shown again.</p><ol>${items}</ol><p>Store them offline in a secure location.</p><a href="${escapeHtml(nextPath)}">Continue</a></main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
  return response;
}
