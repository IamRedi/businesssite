import { redirect } from "next/navigation";
import { PostgresPrivacyRepository, privacyDeletionRequestsEnabled } from "@platform/site-data";
import { PrivacyExportPanel } from "../../../../components/privacy-export-panel";
import { PrivacyDeletionPanel } from "../../../../components/privacy-deletion-panel";
import {
  requireSiteAdmin,
  trustedSiteAdminSessionHash,
} from "../../../../lib/site-admin-auth";
export const dynamic = "force-dynamic";
export default async function CustomerPrivacyExportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireSiteAdmin(slug);
  if (!session) redirect("/site-admin/login");
  const repository = new PostgresPrivacyRepository({
    boundary: "runtime",
  });
  const hash=trustedSiteAdminSessionHash(session);
  const [status,deletion]=await Promise.all([repository.customerExportStatus(hash),repository.customerDeletionStatus(hash)]);
  return (
    <main className="owner-shell site-admin-shell">
      <header className="owner-header">
        <div>
          <p className="eyebrow">
            {session.preferredLocale === "de"
              ? "Datenschutz und Sicherheit"
              : "Privacy and security"}
          </p>
          <h1>
            {session.preferredLocale === "de"
              ? "Kundendatenexport"
              : "Customer data export"}
          </h1>
        </div>
      </header>
      <PrivacyExportPanel
        mode="customer"
        slug={slug}
        status={status}
        locale={session.preferredLocale}
      />
      <PrivacyDeletionPanel slug={slug} status={deletion} locale={session.preferredLocale} enabled={privacyDeletionRequestsEnabled()}/>
    </main>
  );
}
