import { PostgresLegalRepository, taxDisplayModes } from "@platform/site-data";
import { requireOwnerPagePermission } from "../../../lib/owner-authorization";
import { legalDocumentSources } from "../../../lib/legal-documents";

export const dynamic = "force-dynamic";

function FreshFields() {
  return <><input required type="password" name="currentPassword" autoComplete="current-password" placeholder="Current password" /><input required name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="Fresh MFA code" /></>;
}

export default async function OwnerLegalPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const owner = await requireOwnerPagePermission("audit.read");
  const repository = new PostgresLegalRepository({ boundary: "owner", sessionHash: owner.sessionHash });
  const [configs, documents, acceptances] = await Promise.all([
    repository.listConfigs(), repository.listDocuments(), repository.listAcceptances(),
  ]);
  await repository.recordLegalConsoleAccess(owner.ownerId, owner.correlationId);
  const canManage = owner.role === "owner";
  const { result } = await searchParams;
  return <main className="owner-shell">
    <header className="owner-header"><div><p className="eyebrow">Commercial truth</p><h1>B2B legal boundary</h1><p>Version platform identity, tax presentation and contract evidence. Activation records operator review; it is not legal certification.</p></div></header>
    {result ? <p className={result.includes("activated") || result.includes("created") || result.includes("registered") || result.includes("reviewed") ? "success" : "error"}>{result.replaceAll("_", " ")}</p> : null}
    <section className="workspace-card"><h2>Platform legal/commercial configuration</h2><p>Brand, support, infrastructure and customer identity remain separate. Private tax numbers are not collected here or projected publicly.</p>
      {canManage ? <form action="/api/owner/legal/config" method="post" className="admin-login"><input type="hidden" name="action" value="create" />
        <input required name="legalBusinessName" placeholder="Exact legal business name" /><input name="legalForm" placeholder="Legal form, when applicable" />
        <input required name="street" placeholder="Registered/business street and number" /><input name="addressLine2" placeholder="Address line 2 (optional)" />
        <input required name="postalCode" placeholder="Postal code" /><input required name="city" placeholder="City" />
        <input required name="countryCode" maxLength={2} placeholder="Country code, e.g. DE" /><input required name="countryName" placeholder="Country name" />
        <input name="authorizedRepresentative" placeholder="Authorised representative, when applicable" /><input required type="email" name="contactEmail" placeholder="Legal contact email" />
        <input required type="email" name="supportEmail" placeholder="Support email (separate role)" /><input name="phone" placeholder="Phone, when applicable" />
        <input name="registerName" placeholder="Register name" /><input name="registerCourt" placeholder="Register court" /><input name="registerNumber" placeholder="Register number" />
        <input name="vatId" placeholder="VAT ID, when applicable" /><input name="supervisoryAuthority" placeholder="Supervisory authority, when applicable" />
        <input name="editorialResponsiblePerson" placeholder="Editorially responsible person, when applicable" /><textarea name="disputeMetadata" placeholder="Conditional dispute/contact metadata; professional review required" />
        <select required name="taxDisplayMode" defaultValue=""><option value="" disabled>Tax display mode</option>{taxDisplayModes.map((mode) => <option key={mode}>{mode}</option>)}</select>
        <select required name="currency" defaultValue="EUR"><option>EUR</option><option>USD</option><option>ALL</option></select>
        <input required name="priceTaxLabel" placeholder="Reviewed price/tax label shown to customers" /><textarea name="specialTaxNote" placeholder="Required only for special/exempt mode; operator-reviewed text" /><FreshFields />
        <button className="button">Create review-required version</button>
      </form> : <p>Read-only access. Only an owner can create or activate configuration.</p>}
      <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Version</th><th>Identity</th><th>Tax</th><th>Status</th><th>Control</th></tr></thead><tbody>{configs.map((config) => <tr key={config.id}><td>{config.version}</td><td>{config.legalBusinessName}<br />{config.countryCode}</td><td>{config.taxDisplayMode}<br />{config.currency} · {config.priceTaxLabel}</td><td>{config.status} / {config.legalReviewStatus}</td><td>{canManage && config.status === "draft" ? <form action="/api/owner/legal/config" method="post" className="admin-login"><input type="hidden" name="action" value="activate" /><input type="hidden" name="configId" value={config.id} /><FreshFields /><label><input required type="checkbox" name="reviewConfirmed" value="true" /> I record that this exact version has been professionally reviewed; this is not certification.</label><button className="button secondary">Review and activate</button></form> : "—"}</td></tr>)}</tbody></table></div>
    </section>
    <section className="workspace-card"><h2>Legal document versions</h2><p>The server selects version and SHA-256 hash from repository-owned source. Browser fields cannot supply either value.</p>
      {canManage ? <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Source</th><th>Version</th><th>Register</th></tr></thead><tbody>{legalDocumentSources.map((source) => <tr key={`${source.documentKey}:${source.locale}`}><td>{source.documentKey} / {source.locale}</td><td>{source.version}</td><td><form action="/api/owner/legal/documents" method="post"><input type="hidden" name="action" value="register" /><input type="hidden" name="documentKey" value={source.documentKey} /><input type="hidden" name="locale" value={source.locale} /><FreshFields /><button className="button secondary">Register review-required source</button></form></td></tr>)}</tbody></table></div> : null}
      <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Document</th><th>Evidence</th><th>Status</th><th>Control</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td>{document.documentKey} / {document.locale}</td><td>{document.version}<br /><code>{document.contentHash.slice(0, 16)}…</code></td><td>{document.status}</td><td>{canManage && ["legal_review_required", "reviewed"].includes(document.status) ? <form action="/api/owner/legal/documents" method="post" className="admin-login"><input type="hidden" name="action" value="activate" /><input type="hidden" name="documentId" value={document.id} /><input name="reviewerReference" maxLength={120} placeholder="Reviewer reference (optional)" /><FreshFields /><label><input required type="checkbox" name="reviewConfirmed" value="true" /> Exact source reviewed; activation does not claim certification.</label><button className="button secondary">Activate version</button></form> : "—"}</td></tr>)}</tbody></table></div>
    </section>
    <section className="workspace-card"><h2>Contract acceptance evidence</h2><p>Immutable evidence contains no session token, password or payment details. VAT syntax and self-attestation are not provider verification.</p>
      <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Business</th><th>Contract</th><th>Commercial snapshot</th><th>Verification</th><th>Review</th></tr></thead><tbody>{acceptances.map((acceptance) => <tr key={acceptance.id}><td>{acceptance.legalBusinessName}<br />{acceptance.businessType} · {acceptance.countryCode}<br /><small>{acceptance.siteId}</small></td><td>{acceptance.termsVersion}<br />Privacy {acceptance.privacyVersion}<br />{new Date(acceptance.acceptedAt).toLocaleString("en-GB")}</td><td>{acceptance.planKey} · {acceptance.normalPriceDisplaySnapshot}<br />{acceptance.priceTaxLabelSnapshot}<br /><small>config v{acceptance.commercialConfigVersion} · {acceptance.trialDurationDays} day trial</small></td><td>{acceptance.verificationState}</td><td>{canManage ? <form action={`/api/owner/legal/business-identities/${acceptance.businessIdentityId}/verification`} method="post" className="admin-login"><select name="state" defaultValue="review_required"><option value="manually_verified">manually_verified</option><option value="review_required">review_required</option><option value="rejected">rejected</option></select><input name="reasonCode" maxLength={80} placeholder="Internal reason code (optional)" /><FreshFields /><button className="button secondary">Record manual review</button></form> : "Read only"}</td></tr>)}</tbody></table></div>
    </section>
  </main>;
}
