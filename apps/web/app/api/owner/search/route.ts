import { NextResponse } from "next/server";
import {
  GoogleGeocoder,
  GooglePlacesProvider,
  PostgresFinderRepository,
  googleCacheExpiresAt,
  discoveryCacheKey,
  normalizeDiscoveryRequest,
  normalizeDiscoveredBusiness,
  type DiscoveryRequest,
  type GeoPoint,
} from "@platform/business-finder";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { authorizeOwnerRequest } from "../../../../lib/owner-authorization";
import { readJsonBody } from "../../../../lib/request-body";
import { providerControlError } from "../../../../lib/provider-controls";
type SearchBody = DiscoveryRequest & { address?: string };
class FinderProviderCallLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Google Places daily provider-call limit reached.");
  }
}
const providerCallLimit = () => {
  const value = Number.parseInt(process.env.FINDER_PROVIDER_CALL_LIMIT ?? "30", 10);
  return Number.isInteger(value) && value >= 1 && value <= 500 ? value : 30;
};
export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "finder.write");
  if (!authorization.ok) return authorization.response;
  const owner = authorization.owner;
  let repository: PostgresFinderRepository | undefined;
  let searchId: string | undefined;
  try {
    const parsed = await readJsonBody<SearchBody>(request, 8 * 1024);
    if (!parsed.ok)
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const input = parsed.value;
    if (!input.query?.trim())
      return NextResponse.json(
        { error: "Search query is required." },
        { status: 400 },
      );
    const repo = new PostgresFinderRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    repository = repo;
    const recordProviderCall = (usage: Parameters<typeof repo.recordProviderUsage>[0]) => repo.recordProviderUsage(usage);
    let location: GeoPoint | undefined = input.location;
    if (!location && input.address?.trim()) {
      const geocodeLimit = await enforceRateLimit(request, "owner-device-geocode", 60, 60 * 60);
      if (!geocodeLimit.allowed)
        return NextResponse.json({ error: "Too many address lookups. Please try again shortly." }, { status: 429, headers: { "retry-after": String(geocodeLimit.retryAfterSeconds) } });
      location = await new GoogleGeocoder(recordProviderCall).resolveAddress(
        input.address.trim().slice(0, 500),
      );
    }
    let search: DiscoveryRequest;
    try {
      search = normalizeDiscoveryRequest({ ...input, location });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Search input is invalid." }, { status: 400 });
    }
    const key = discoveryCacheKey(search);
    searchId = await repo.createSearch(search, key);
    const cached = await repo.getCachedSearch(key);
    if (cached) {
      await repo.completeSearch(searchId, cached, true);
      return NextResponse.json({ leadIds: cached, cached: true, location });
    }
    const discovered = await new GooglePlacesProvider(async () => {
      const rateLimit = await enforceRateLimit(
        request,
        "owner-google-places-provider-call",
        providerCallLimit(),
        24 * 60 * 60,
      );
      if (!rateLimit.allowed) throw new FinderProviderCallLimitError(rateLimit.retryAfterSeconds);
    }, recordProviderCall).search(search);
    const byId = new Map(discovered.map((item) => [item.externalId, item]));
    const leads = await Promise.all(
      [...byId.values()].map((item) =>
        repo.upsertLead(normalizeDiscoveredBusiness(item)),
      ),
    );
    await repo.saveCachedSearch(
      key,
      leads.map((lead) => lead.id),
      googleCacheExpiresAt(),
    );
    await repo.completeSearch(searchId, leads.map((lead) => lead.id), false);
    await Promise.all(
      leads.map((lead) =>
        repo.addPipelineEvent({ leadId: lead.id, status: "discovered" }),
      ),
    );
    await repo.appendAudit({
      entityType: "search",
      entityId: key,
      action: "google_places_discovered",
      details: { resultCount: leads.length, location },
    });
    return NextResponse.json({
      leadIds: leads.map((lead) => lead.id),
      cached: false,
      location,
    });
  } catch (error) {
    if (repository && searchId) await repository.failSearch(searchId).catch(() => undefined);
    if (error instanceof Error && /provider_(paused|google_limit)/.test(error.message)) { const failure = providerControlError(error); return NextResponse.json({ error: failure.message }, { status: failure.status }); }
    if (error instanceof FinderProviderCallLimitError) {
      return NextResponse.json(
        { error: "Google Places daily provider-call limit reached. Cached searches remain available; try again tomorrow or increase FINDER_PROVIDER_CALL_LIMIT." },
        { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Finder search failed.",
      },
      { status: 500 },
    );
  }
}
