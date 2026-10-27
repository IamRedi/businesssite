import { notFound } from "next/navigation";
import { PostgresOwnerCustomDesignRepository } from "@platform/site-data";
import { requireOwnerPagePermission } from "../../../../../lib/owner-authorization";
import { OwnerCustomDesignEditor } from "../../../../../components/owner-custom-design-editor";

export const dynamic = "force-dynamic";
export default async function OwnerCustomDesignPage({ params }: { params: Promise<{ slug: string }> }) {
  const owner = await requireOwnerPagePermission("websites.manage");
  const { slug } = await params;
  const snapshot = await new PostgresOwnerCustomDesignRepository().read(owner.sessionHash, slug);
  if (!snapshot) notFound();
  return <main className="owner-shell"><header className="owner-header"><div><p className="eyebrow">Personalized website</p><h1>{snapshot.document.content.name}</h1><p>Compose, preview and save a reusable design.</p></div></header><OwnerCustomDesignEditor snapshot={snapshot} /></main>;
}
