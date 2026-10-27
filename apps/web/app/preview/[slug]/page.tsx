import { notFound } from "next/navigation";
import { SitePreview } from "../../../components/site-preview";
import { PostgresSiteRepository } from "@platform/site-data";
import { previewTokenId } from "../../../lib/preview-token";
export const metadata = {
  title: { absolute: "Private website preview" },
  robots: { index: false, follow: false },
};
export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: token } = await params;
  const tokenId = previewTokenId(token);
  const site = tokenId
    ? await new PostgresSiteRepository({ boundary: "runtime" }).getByPreviewTokenId(tokenId)
    : null;
  if (!site) notFound();
  return <SitePreview site={site} />;
}
