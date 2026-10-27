import Link from "next/link";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import type { PreparedBusinessProfile } from "@platform/website-engine";
import {
  customerPublicLegalIdentityMissingFields,
  generateSiteDocument,
  professionalAboutCopy,
} from "@platform/website-engine";
import {
  ComplimentaryLegalIdentityIncompleteError,
  PostgresSiteRepository,
} from "@platform/site-data";
import { trialStarterContent } from "../../../lib/trial-starter-content";
import {
  ownerComplimentaryAdminLocales,
  ownerComplimentaryPlans,
  parseOwnerComplimentaryFormInput,
} from "../../../lib/owner-complimentary";
import { applyExistingWebsiteToSite } from "../../../lib/apply-website-import";
import { creationCategoryProfileFields } from "../../../lib/creation-category";
import { automaticDesignInputFromProfile } from "../../../lib/automatic-design-input";
import { publicationSlug } from "../../../lib/owner-publication";
import { canonicalPublicPathUrl, canonicalPublicSiteUrl } from "../../../lib/owner-preview-url";
import { tokenHash } from "../../../lib/site-admin-auth";
import { expirePublicSiteAfterMutation } from "../../../lib/public-site-cache";
import { requireOwnerActionPermission, requireOwnerPagePermission } from "../../../lib/owner-authorization";
import { platformConfig } from "../../../lib/platform-config";
import { OwnerComplimentaryForm } from "../../../components/owner-complimentary-form";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  created: "Complimentary customer created. Copy the setup link now; it is shown once and expires in one hour.",
  createdAdjusted: "Complimentary customer created. The requested URL was already used, so the final website URL differs below. Copy the setup link now; it is shown once and expires in one hour.",
  revoked: "Complimentary access revoked. The website is private and admin sessions were signed out.",
  slug: "This website URL is already in use.",
  email: "This email already belongs to another website account.",
  legal: "No site was created: complete Legal Identity before publishing. Every required legal field (legal name, street, postal code, city, country code, legal contact email) must be provided. The platform privacy page is generated automatically.",
  invalid: "Check the business name, email, languages, plan and legal identity fields.",
  failed: "The complimentary customer could not be created. Please try again.",
};

function canonicalSiteUrl(slug: string) {
  try {
    return canonicalPublicSiteUrl(slug, process.env.PUBLIC_APP_URL?.trim() || "http://localhost:3000");
  } catch {
    return `/site/${encodeURIComponent(slug)}`;
  }
}

function canonicalSetupUrl(pathWithQuery: string) {
  try {
    return canonicalPublicPathUrl(pathWithQuery, process.env.PUBLIC_APP_URL?.trim() || "http://localhost:3000");
  } catch {
    return pathWithQuery;
  }
}

export default async function OwnerComplimentaryPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; slug?: string; requested?: string; setup?: string; revoked?: string }>;
}) {
  const owner = await requireOwnerPagePermission("websites.manage");
  const query = await searchParams;
  const sites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
  const records = await sites.listComplimentaryAccess();
  const setupPath = query.setup ? `/site-admin/reset-password?token=${encodeURIComponent(query.setup)}` : undefined;
  const canonicalSetupPath = setupPath ? canonicalSetupUrl(setupPath) : undefined;
  const siteLocales = platformConfig.website.supportedLocales;
  const successMessage = query.message === "createdAdjusted" && query.slug && query.requested
    ? `Complimentary customer created. The requested URL "${query.requested}" is already used. We selected ${query.slug}.`
    : query.message ? messages[query.message] : undefined;

  async function createComplimentaryCustomer(formData: FormData) {
    "use server";
    const owner = await requireOwnerActionPermission("complimentary.create");
    const parsed = parseOwnerComplimentaryFormInput(formData, platformConfig.website.supportedLocales);
    if (!parsed.ok) redirect("/owner/complimentary?message=invalid");
    const input = parsed.value;
    const slug = publicationSlug(input.businessName);
    if (!slug) redirect("/owner/complimentary?message=invalid");
    const setupToken = randomBytes(32).toString("hex");
    const leadId = `owner-comp-${randomBytes(8).toString("hex")}`;
    const starter = trialStarterContent(input.category, input.siteLocale);
    // Same canonical generation pipeline as the self-service trial wizard;
    // only the access source differs (complimentary entitlement, no Stripe).
    const profile: PreparedBusinessProfile = {
      id: `prepared-${leadId}-v1`,
      version: 1,
      sourceLeadId: leadId,
      locale: input.siteLocale,
      preparedAt: new Date().toISOString(),
      approvedSources: [],
      business: {
        name: input.businessName,
        category: input.category,
        // Canonical registry keys: a fresh review decision (P4-002) replaces
        // the form's combobox keys (P4-001) wholesale and carries the
        // categorySource/categoryConfidence audit fields; both are owner
        // decisions.
        ...creationCategoryProfileFields({
          formKeys: { categoryKey: input.categoryKey, subcategoryKey: input.subcategoryKey },
          reviewSubmission: input.existingWebsite,
        }),
        email: input.email,
      },
      services: starter.services,
    };
    // Reviewed import decisions (theme/composition) reach generation, same
    // as the public wizard (BSRC-DESIGN-FOUNDATION-001).
    const site = generateSiteDocument(
      profile,
      input.existingWebsite?.templateKey,
      (input.existingWebsite?.themeKey as Parameters<typeof generateSiteDocument>[2]) ?? undefined,
      input.existingWebsite?.design || input.existingWebsite?.sourceContentHash
        ? {
          ...(input.existingWebsite.design ? { design: input.existingWebsite.design } : {}),
          ...(input.existingWebsite.sourceContentHash ? { sourceContentHash: input.existingWebsite.sourceContentHash } : {}),
          // P4-003 choice authority + evidence (same as the public wizard).
          ...(input.existingWebsite.designSource ? { designSource: input.existingWebsite.designSource } : {}),
          ...(input.existingWebsite.selectionReason ? { selectionReason: input.existingWebsite.selectionReason } : {}),
          ...(input.existingWebsite.archetypeConfidence !== undefined ? { archetypeConfidence: input.existingWebsite.archetypeConfidence } : {}),
        }
        // P5-001: from-scratch creation uses the automatic design planner
        // (same as the homepage wizard; reviewed imports always win).
        : { automatic: automaticDesignInputFromProfile(profile) },
    );
    site.content.aboutBody = professionalAboutCopy({ name: input.businessName, services: site.services, locale: input.siteLocale, templateKey: site.templateKey });
    site.publicLegal = { ...input.publicLegal };
    site.id = crypto.randomUUID();
    // Reviewed import from the owner-declared previous website: same shared
    // application as the public wizard (facts merged, provenance recorded).
    if (input.existingWebsite) applyExistingWebsiteToSite(site, input.existingWebsite);
    // Canonical publication boundary: identical validator to the public read
    // gate and the Site Admin editor. Incomplete legal identity is refused
    // here with an explicit message instead of creating a doomed public site.
    if (customerPublicLegalIdentityMissingFields(site).length)
      redirect("/owner/complimentary?message=legal");
    let created: Awaited<ReturnType<PostgresSiteRepository["createComplimentaryCustomer"]>>;
    try {
      created = await new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId }).createComplimentaryCustomer({
        site,
        slug,
        businessName: input.businessName,
        email: input.email,
        adminLocale: input.adminLocale,
        planKey: input.planKey,
        reason: input.reason,
        setupTokenHash: tokenHash(setupToken),
        setupExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      if (error instanceof ComplimentaryLegalIdentityIncompleteError)
        redirect("/owner/complimentary?message=legal");
      const code = error instanceof Error ? error.message : "";
      redirect(`/owner/complimentary?message=${code.includes("slug_taken") ? "slug" : code.includes("email_taken") ? "email" : "failed"}`);
    }
    // Keep Next.js redirect control flow outside the database error handler.
    // Slug allocation may pick slug-2, slug-3, ...; always use the returned slug.
    const adjusted = created.slug !== slug;
    expirePublicSiteAfterMutation({ kind: "slug", value: created.slug });
    redirect(`/owner/complimentary?message=${adjusted ? "createdAdjusted" : "created"}&slug=${encodeURIComponent(created.slug)}${adjusted ? `&requested=${encodeURIComponent(slug)}` : ""}&setup=${encodeURIComponent(setupToken)}`);
  }

  async function revokeAccess(formData: FormData) {
    "use server";
    const owner = await requireOwnerActionPermission("complimentary.revoke");
    const slug = String(formData.get("slug") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
    if (!slug || reason.length < 3) redirect("/owner/complimentary?message=invalid");
    await new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId }).revokeComplimentaryAccess(slug, reason);
    expirePublicSiteAfterMutation({ kind: "slug", value: slug });
    redirect("/owner/complimentary?message=revoked");
  }

  return <main className="owner-shell owner-operations-page">
    <header className="owner-header">
      <div>
        <p className="eyebrow">Complimentary customers</p>
        <h1>Create permanent free access</h1>
        <p className="owner-intro">Owner-only provisioning for business customers who receive a full plan without Stripe billing. Access is permanent until revoked or the customer later subscribes normally; every grant and revoke is audited. The website language and the admin panel language are set separately.</p>
      </div>
      <span className="secure-badge">OWNER</span>
    </header>
    {query.message ? <p className={query.message === "created" || query.message === "createdAdjusted" || query.message === "revoked" ? "success" : "error"} role={query.message === "legal" ? "alert" : undefined}>{messages[query.message] ?? messages.failed}</p> : null}
    {setupPath ? <section className="workspace-card">
      <div className="section-heading"><div><p className="eyebrow">One-time setup link for {query.slug}</p><h2>Share it securely — it is displayed only once</h2></div></div>
      <p>The customer opens this link within one hour, sets their own password and signs in at <code>/site-admin/login</code>. The link is single-use.</p>
      <p><Link href={canonicalSetupPath ?? setupPath}>{canonicalSetupPath ?? setupPath}</Link></p>
      <p><Link href={query.slug ? canonicalSiteUrl(query.slug) : "/"} target="_blank">Open the public website</Link></p>
    </section> : null}
    <section className="workspace-card">
      <div className="section-heading"><div><p className="eyebrow">New complimentary customer</p><h2>Creates the website, the admin login and the permanent entitlement</h2></div></div>
      <OwnerComplimentaryForm
        action={createComplimentaryCustomer}
        siteLocales={siteLocales}
        adminLocales={ownerComplimentaryAdminLocales}
        plans={ownerComplimentaryPlans}
        uiLocale="en"
        platformName={platformConfig.brand.name}
      />
    </section>
    <section className="workspace-card">
      <div className="section-heading"><div><p className="eyebrow">Granted access</p><h2>{records.length} entitlement record{records.length === 1 ? "" : "s"}</h2></div></div>
      {records.length ? <div className="owner-table-wrap"><table className="owner-table">
        <thead><tr><th>Business</th><th>Login</th><th>Status</th><th>Plan</th><th>Granted</th><th>Note</th><th>Convert / revoke</th></tr></thead>
        <tbody>
          {records.map((record) => <tr key={record.siteId}>
            <td><Link href={canonicalSiteUrl(record.slug)} target="_blank">{record.businessName}</Link><br /><small>{record.slug}</small></td>
            <td>{record.email}</td>
            <td>{record.status === "complimentary_active" ? "Active (free)" : record.status === "converted" ? "Converted to paid" : "Revoked"}</td>
            <td>{record.planKey}</td>
            <td>{new Date(record.grantedAt).toISOString().slice(0, 10)}</td>
            <td>{record.reason}</td>
            <td>{record.status === "complimentary_active" ? <form action={revokeAccess} className="editorial-category-form">
              <input type="hidden" name="slug" value={record.slug} />
              <input name="reason" required minLength={3} maxLength={500} placeholder="Revocation reason" />
              <button className="button secondary" type="submit">Revoke access</button>
            </form> : record.status === "converted" ? `Paid since ${record.convertedToPaidAt?.slice(0, 10)}` : `Revoked ${record.revokedAt?.slice(0, 10)}`}</td>
          </tr>)}
        </tbody>
      </table></div> : <p>No complimentary customers yet.</p>}
      <p><small>Billing execution being OFF does not affect these customers: access is resolved from the entitlement, not from Stripe. Later normal checkout converts the entitlement automatically without losing site, content, media, login, domain or settings. Sites created before the legal-identity requirement must complete the Legal identity section in their site editor before they become publicly visible.</small></p>
    </section>
    <p className="owner-intro"><Link href="/owner/customers">Open customers &amp; plans</Link> · Platform: {platformConfig.brand.name}</p>
  </main>;
}
