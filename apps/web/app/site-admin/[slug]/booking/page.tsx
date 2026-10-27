import { redirect } from "next/navigation";
import { requireSiteAdmin } from "../../../../lib/site-admin-auth";

// Preserve bookmarks; the authenticated workspace owns the only booking UI.
export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!await requireSiteAdmin(slug)) redirect("/site-admin/login");
  redirect(`/site-admin/${encodeURIComponent(slug)}#appointments`);
}
