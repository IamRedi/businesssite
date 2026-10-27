import { PostgresSiteRepository } from "@platform/site-data";
import { requireOwnerPagePermission } from "../../../lib/owner-authorization";
import { hasOwnerPermission } from "../../../lib/owner-permissions";
import { aiConfig } from "../../../lib/ai-config";
import { ProviderControlCenter } from "../../../components/provider-control-center";
import { googleDailyCeiling, type ProviderControlSnapshot } from "../../../lib/provider-controls";

export const dynamic = "force-dynamic";

export default async function OwnerProviderUsagePage() {
  const owner = await requireOwnerPagePermission("audit.read");
  const repository = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
  const usage = await repository.getOwnerProviderUsageSnapshot(owner.sessionHash);
  let controls: ProviderControlSnapshot | null = null;
  try { controls = await repository.ownerProviderControl("snapshot") as unknown as ProviderControlSnapshot; }
  catch (error) {
    // Only a missing additive migration offers a read-only rollout fallback.
    // Permission, connectivity and other failures remain visible/fail-closed.
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "42883") throw error;
  }
  return <ProviderControlCenter usage={usage} initialControls={controls} capabilities={{
    canManage: hasOwnerPermission(owner.role, "platform.configure"),
    aiReady: aiConfig.ownerEnabled && aiConfig.provider === "openai" && Boolean(process.env.OPENAI_API_KEY?.trim()),
    aiModel: aiConfig.ownerModel,
    googleReady: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
    googleDailyCeiling: googleDailyCeiling(process.env.FINDER_PROVIDER_CALL_LIMIT),
    customAiEndpoint: Boolean(process.env.OPENAI_BASE_URL?.trim() && process.env.OPENAI_BASE_URL.replace(/\/$/, "") !== "https://api.openai.com/v1"),
  }} />;
}
