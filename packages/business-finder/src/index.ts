import { createHash, randomUUID } from "node:crypto";
import { databaseRlsMode, getOwnerPostgresPool, getPostgresPool, type Pool } from "@platform/database";
import type {
  PreparedBusinessProfile,
  OpeningHour,
  SupportedLocale,
} from "@platform/website-engine";

export type LeadSignals = {
  hasWebsite: boolean;
  websiteQuality: "excellent" | "good" | "poor" | "missing" | "unknown";
  hasEmail: boolean;
  hasPhone: boolean;
  reviewCount: number;
  rating: number;
  isActive: boolean;
  hasSocialProof: boolean;
  email?: string;
  description?: string;
  services?: string[];
  socialLinks?: Record<string, string>;
  openingHours?: OpeningHour[];
};
export type Lead = {
  id: string;
  externalId?: string;
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  source: "google-places";
  score: number;
  reasons: string[];
  signals: LeadSignals;
  createdAt: string;
  updatedAt: string;
};
export type PreparedLeadInput = Pick<
  Lead,
  "id" | "name" | "category" | "address" | "phone" | "website" | "score"
> & {
  signals?: Pick<
    LeadSignals,
    "email" | "description" | "services" | "socialLinks" | "openingHours"
  >;
};
export type GeoPoint = { latitude: number; longitude: number; label?: string };
export type DiscoveryRequest = {
  query: string;
  city?: string;
  category?: string;
  radius?: number;
  minRating?: number;
  keywords?: string;
  maxResults?: number;
  location?: GeoPoint;
};
export type DiscoveredBusiness = Omit<
  Lead,
  "id" | "score" | "reasons" | "signals" | "createdAt" | "updatedAt" | "source"
> & {
  externalId: string;
  location?: GeoPoint;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
  raw: Record<string, unknown>;
};
export type ReserveGoogleProviderCall = () => Promise<void>;
export type GoogleProviderUsageRecord = {
  service: "places_text_search" | "geocoding";
  sku: "places_text_search_enterprise" | "geocoding";
  requestCount: 1;
  estimatedCostUsdMicros: 35000 | 5000;
  pricingVersion: "google-maps-global-2026-09-10";
  pricingAsOf: "2026-09-10";
  estimateBasis: "gross_list_price_before_free_cap_discounts_credits_tax";
};
export type RecordGoogleProviderCall = (usage: GoogleProviderUsageRecord) => Promise<void>;
export const googlePlacesTextSearchUsage: GoogleProviderUsageRecord = {
  service: "places_text_search", sku: "places_text_search_enterprise", requestCount: 1,
  estimatedCostUsdMicros: 35000, pricingVersion: "google-maps-global-2026-09-10", pricingAsOf: "2026-09-10",
  estimateBasis: "gross_list_price_before_free_cap_discounts_credits_tax",
};
export const googleGeocodingUsage: GoogleProviderUsageRecord = {
  service: "geocoding", sku: "geocoding", requestCount: 1,
  estimatedCostUsdMicros: 5000, pricingVersion: "google-maps-global-2026-09-10", pricingAsOf: "2026-09-10",
  estimateBasis: "gross_list_price_before_free_cap_discounts_credits_tax",
};
export type PipelineStatus =
  | "discovered"
  | "analyzed"
  | "qualified"
  | "profile_prepared"
  | "demo_ready"
  | "contacted"
  | "interested"
  | "converted"
  | "rejected"
  | "archived";
export type PipelineEvent = {
  id: string;
  leadId: string;
  status: PipelineStatus;
  notes?: string;
  createdAt: string;
};
export type PreparedProfileRecord = {
  id: string;
  leadId: string;
  version: number;
  profile: PreparedBusinessProfile;
  status: "draft" | "ready_for_handoff" | "demo_created";
  createdAt: string;
};
export type BusinessWorkspaceRecord = {
  lead: Lead;
  latestProfile?: PreparedProfileRecord;
  profileCount: number;
  latestStatus?: PipelineStatus;
  latestWebsiteChange?: WebsiteChange;
};
export type WebsiteChange = {
  type: "website_added" | "website_removed" | "website_changed";
  previousWebsite?: string;
  currentWebsite?: string;
  observedAt: string;
};
export type AuditEvent = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
};
export type FinderSearchRecord = {
  id: string;
  query: string;
  filters: DiscoveryRequest;
  cacheKey?: string;
  resultCount: number;
  leadIds: string[];
  cached: boolean;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
};
export type FinderRepository = {
  createSearch(input: DiscoveryRequest, cacheKey?: string): Promise<string>;
  completeSearch(id: string, leadIds: string[], cached: boolean): Promise<void>;
  failSearch(id: string): Promise<void>;
  listSearches(limit?: number): Promise<FinderSearchRecord[]>;
  getCachedSearch(key: string): Promise<string[] | null>;
  saveCachedSearch(
    key: string,
    ids: string[],
    expiresAt: string,
  ): Promise<void>;
  upsertLead(lead: Lead): Promise<Lead>;
  listLeads(): Promise<Lead[]>;
  listBusinessWorkspace(): Promise<BusinessWorkspaceRecord[]>;
  getLead(id: string): Promise<Lead | null>;
  addPipelineEvent(
    event: Omit<PipelineEvent, "id" | "createdAt">,
  ): Promise<PipelineEvent>;
  listPipelineEvents(leadId: string): Promise<PipelineEvent[]>;
  createPreparedProfile(
    record: PreparedProfileRecord,
  ): Promise<PreparedProfileRecord>;
  listPreparedProfiles(leadId: string): Promise<PreparedProfileRecord[]>;
  appendAudit(input: {
    entityType: string;
    entityId: string;
    action: string;
    details?: Record<string, unknown>;
  }): Promise<void>;
  listAuditEvents(entityId: string): Promise<AuditEvent[]>;
};
export const googleCacheLifetimeMs = 30 * 24 * 60 * 60 * 1000;
export const normalizeDiscoveryRequest = (request: DiscoveryRequest): DiscoveryRequest => {
  const query = request.query?.trim().slice(0, 160);
  if (!query) throw new Error("Search query is required.");
  const radius = request.radius === undefined ? undefined : Number(request.radius);
  const minRating = request.minRating === undefined ? undefined : Number(request.minRating);
  const maxResults = request.maxResults === undefined ? 20 : Math.trunc(Number(request.maxResults));
  if (radius !== undefined && (!Number.isFinite(radius) || radius < 0.1 || radius > 100)) throw new Error("Search radius is invalid.");
  if (minRating !== undefined && (!Number.isFinite(minRating) || minRating < 0 || minRating > 5)) throw new Error("Minimum rating is invalid.");
  if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 20) throw new Error("Result limit is invalid.");
  const location = request.location;
  if (location && (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180))
    throw new Error("Search location is invalid.");
  return {
    query,
    city: request.city?.trim().slice(0, 160) || undefined,
    category: request.category?.trim().slice(0, 160) || undefined,
    radius,
    minRating,
    keywords: request.keywords?.trim().slice(0, 300) || undefined,
    maxResults,
    location: location ? { latitude: location.latitude, longitude: location.longitude, label: location.label?.trim().slice(0, 300) || undefined } : undefined,
  };
};
export const discoveryCacheKey = (raw: DiscoveryRequest) => {
  const request = normalizeDiscoveryRequest(raw);
  return createHash("sha256").update(JSON.stringify({
    schemaVersion: 2,
    query: request.query.trim().toLowerCase(),
    city: request.city?.trim().toLowerCase() ?? "",
    category: request.category?.trim().toLowerCase() ?? "",
    radius: request.radius ?? "",
    minRating: request.minRating ?? "",
    keywords: request.keywords?.trim().toLowerCase() ?? "",
    maxResults: request.maxResults,
    latitude: request.location?.latitude?.toFixed(4) ?? "",
    longitude: request.location?.longitude?.toFixed(4) ?? "",
  })).digest("hex");
};
export const googleCacheExpiresAt = () =>
  new Date(Date.now() + googleCacheLifetimeMs).toISOString();
const comparableWebsite = (value?: string) => {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${host}${url.port ? `:${url.port}` : ""}${path}${url.search}`;
  } catch {
    return value.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  }
};
export function scoreLead(lead: Omit<Lead, "score" | "reasons">) {
  let score = 20;
  const reasons: string[] = [];
  const s = lead.signals;
  if (!s.hasWebsite || s.websiteQuality === "missing") {
    score += 35;
    reasons.push("no website detected");
  } else if (s.websiteQuality === "poor") {
    score += 25;
    reasons.push("website appears weak or outdated");
  } else if (s.websiteQuality === "unknown") {
    reasons.push("website quality has not been assessed");
  } else reasons.push("website presence appears established");
  if (s.isActive) {
    score += 15;
    reasons.push("business appears active");
  }
  if (s.hasPhone) {
    score += 5;
    reasons.push("phone available for outreach");
  }
  if (s.reviewCount >= 100) {
    score += 10;
    reasons.push("strong review volume indicates active demand");
  }
  if (s.rating >= 4.5) {
    score += 10;
    reasons.push("strong rating indicates a credible business");
  }
  if (s.hasSocialProof) {
    score += 5;
    reasons.push("social proof is present");
  }
  return { score: Math.min(100, Math.max(0, score)), reasons };
}
export function normalizeDiscoveredBusiness(item: DiscoveredBusiness): Lead {
  const boundedText = (value: unknown, maximum: number) =>
    typeof value === "string" ? value.trim().slice(0, maximum) : "";
  const externalId = boundedText(item.externalId, 300);
  const name = boundedText(item.name, 200);
  if (!externalId || !name) throw new Error("Provider business identity is invalid.");
  const websiteValue = boundedText(item.website, 2048);
  let website: string | undefined;
  if (websiteValue) {
    try {
      const parsed = new URL(websiteValue);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") website = websiteValue;
    } catch {
      website = undefined;
    }
  }
  const rating = Number(item.rating);
  const reviewCount = Number(item.reviewCount);
  const safeRating = Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : undefined;
  const safeReviewCount = Number.isSafeInteger(reviewCount) && reviewCount >= 0 && reviewCount <= 10_000_000
    ? reviewCount
    : undefined;
  const hasWebsite = Boolean(website);
  const signals: LeadSignals = {
    hasWebsite,
    websiteQuality: hasWebsite ? "unknown" : "missing",
    hasEmail: false,
    hasPhone: Boolean(item.phone),
    reviewCount: safeReviewCount ?? 0,
    rating: safeRating ?? 0,
    isActive: item.businessStatus === "OPERATIONAL",
    hasSocialProof: false,
  };
  const base = {
    id: `google-${externalId}`,
    externalId,
    name,
    category: boundedText(item.category, 160) || undefined,
    address: boundedText(item.address, 500) || undefined,
    phone: boundedText(item.phone, 80) || undefined,
    website,
    rating: safeRating,
    reviewCount: safeReviewCount,
    source: "google-places" as const,
    signals,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { ...base, ...scoreLead(base) };
}
export function createPreparedBusinessProfile(
  lead: PreparedLeadInput,
  version = 1,
  locale: SupportedLocale = "en",
): PreparedBusinessProfile {
  if (lead.score < 1)
    throw new Error("A qualified lead requires a positive score.");
  return {
    id: `prepared-${lead.id}-v${version}`,
    version,
    sourceLeadId: lead.id,
    locale,
    preparedAt: new Date().toISOString(),
    approvedSources: lead.website ? [lead.website] : [],
    business: {
      name: lead.name,
      category: lead.category,
      address: lead.address,
      phone: lead.phone,
      email: lead.signals?.email,
      description: lead.signals?.description,
      website: lead.website,
      socialLinks: lead.signals?.socialLinks,
      openingHours: lead.signals?.openingHours,
    },
    services: (
      lead.signals?.services || [
        "Consultation",
        "Tailored service",
        "Customer support",
      ]
    ).map((title) => ({ title })),
  };
}
const lifecycle: PipelineStatus[] = [
  "discovered",
  "analyzed",
  "qualified",
  "profile_prepared",
  "demo_ready",
  "contacted",
  "interested",
  "converted",
  "rejected",
  "archived",
];
export function transitionPipeline(
  current: PipelineStatus,
  next: PipelineStatus,
) {
  if (lifecycle.indexOf(next) < lifecycle.indexOf(current))
    throw new Error("Lead status can only move forward.");
  return next;
}
export class GoogleGeocoder {
  constructor(private recordProviderCall: RecordGoogleProviderCall, private apiKey: string = process.env.GOOGLE_MAPS_API_KEY ?? "") {
    if (typeof recordProviderCall !== "function") throw new Error("Google provider usage recording is required.");
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }
  async resolveAddress(address: string): Promise<GeoPoint> {
    const normalized = address.trim().slice(0, 500);
    if (!normalized) throw new Error("Address is required.");
    await this.recordProviderCall(googleGeocodingUsage);
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(normalized)}&key=${encodeURIComponent(this.apiKey)}`);
    return this.toPoint(response);
  }
  async resolveCoordinates(latitude: number, longitude: number): Promise<GeoPoint> {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("Device location is invalid.");
    }
    await this.recordProviderCall(googleGeocodingUsage);
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${latitude},${longitude}`)}&key=${encodeURIComponent(this.apiKey)}`);
    return this.toPoint(response);
  }
  private async toPoint(response: Response): Promise<GeoPoint> {
    if (!response.ok)
      throw new Error(`Address lookup failed: ${response.status}`);
    const data = (await response.json()) as {
      status: string;
      results?: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
      }>;
    };
    const result = Array.isArray(data.results) ? data.results[0] : undefined;
    const latitude = Number(result?.geometry?.location?.lat);
    const longitude = Number(result?.geometry?.location?.lng);
    if (data.status !== "OK" || !result || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      throw new Error("Address was not found. Use a fuller street address.");
    return {
      latitude,
      longitude,
      label: typeof result.formatted_address === "string" ? result.formatted_address.trim().slice(0, 300) : undefined,
    };
  }
}
function distanceKm(a: GeoPoint, b: GeoPoint) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude),
    dLng = rad(b.longitude - a.longitude);
  const v =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}
export class GooglePlacesProvider {
  constructor(
    private reserveProviderCall: ReserveGoogleProviderCall,
    private recordProviderCall: RecordGoogleProviderCall,
    private apiKey: string = process.env.GOOGLE_MAPS_API_KEY ?? "",
  ) {
    if (typeof reserveProviderCall !== "function") throw new Error("Google provider-call metering is required.");
    if (typeof recordProviderCall !== "function") throw new Error("Google provider usage recording is required.");
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }
  async search(request: DiscoveryRequest): Promise<DiscoveredBusiness[]> {
    request = normalizeDiscoveryRequest(request);
    const resultLimit = request.maxResults ?? 20;
    const locationBias = request.location
      ? {
          circle: {
            center: {
              latitude: request.location.latitude,
              longitude: request.location.longitude,
            },
            radius: Math.min(
              Math.max((request.radius ?? 10) * 1000, 100),
              50000,
            ),
          },
        }
      : undefined;
    type RankedCandidate = DiscoveredBusiness & { providerRank: number };
    const candidates = new Map<string, RankedCandidate>();
    const eligibleCandidates = () => [...candidates.values()].filter(
      (candidate) =>
        (!candidate.businessStatus || candidate.businessStatus === "OPERATIONAL") &&
        (!request.minRating || (candidate.rating ?? 0) >= request.minRating) &&
        (!request.location ||
          !request.radius ||
          (candidate.location !== undefined && distanceKm(request.location, candidate.location) <= request.radius)),
    );
    let pageToken: string | undefined;
    let providerRank = 0;
    for (let page = 0; page < 3; page += 1) {
      await this.reserveProviderCall();
      await this.recordProviderCall(googlePlacesTextSearchUsage);
      const response = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask":
              "nextPageToken,places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.googleMapsUri,places.location,places.businessStatus",
          },
          body: JSON.stringify({
            textQuery: [
              request.query,
              request.category,
              request.city,
              request.keywords,
            ]
              .filter(Boolean)
              .join(" "),
            pageSize: 20,
            ...(locationBias ? { locationBias, rankPreference: "DISTANCE" } : {}),
            ...(pageToken ? { pageToken } : {}),
          }),
        },
      );
      if (!response.ok)
        throw new Error(`Google Places search failed: ${response.status}`);
      const data = (await response.json()) as { places?: Array<any>; nextPageToken?: unknown };
      for (const p of Array.isArray(data.places) ? data.places : []) {
        if (!p || typeof p !== "object" || typeof p.id !== "string" || typeof p.displayName?.text !== "string" || typeof p.formattedAddress !== "string") continue;
        const latitude = Number(p.location?.latitude);
        const longitude = Number(p.location?.longitude);
        const location = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
          ? { latitude, longitude }
          : undefined;
        const businessStatus = p.businessStatus === "OPERATIONAL" || p.businessStatus === "CLOSED_TEMPORARILY" || p.businessStatus === "CLOSED_PERMANENTLY"
          ? p.businessStatus
          : undefined;
        if (!candidates.has(p.id)) candidates.set(p.id, {
          externalId: p.id,
          name: p.displayName.text,
          category: p.primaryTypeDisplayName?.text,
          address: p.formattedAddress,
          phone: p.nationalPhoneNumber,
          website: p.websiteUri,
          rating: Number(p.rating),
          reviewCount: Number(p.userRatingCount),
          location,
          businessStatus,
          raw: {},
          providerRank,
        });
        providerRank += 1;
      }
      const eligible = eligibleCandidates();
      if (eligible.filter((candidate) => !candidate.website).length >= resultLimit) break;
      pageToken = typeof data.nextPageToken === "string" && data.nextPageToken.trim() ? data.nextPageToken : undefined;
      if (!pageToken) break;
    }
    return eligibleCandidates()
      .sort((a, b) => {
        const websiteOpportunity = Number(Boolean(a.website)) - Number(Boolean(b.website));
        if (websiteOpportunity) return websiteOpportunity;
        if (request.location) {
          const aDistance = a.location ? distanceKm(request.location, a.location) : Number.POSITIVE_INFINITY;
          const bDistance = b.location ? distanceKm(request.location, b.location) : Number.POSITIVE_INFINITY;
          if (aDistance !== bDistance) return aDistance - bDistance;
        }
        return a.providerRank - b.providerRank;
      })
      .slice(0, resultLimit)
      .map(({ providerRank: _providerRank, ...candidate }) => candidate);
  }
}
export class PostgresFinderRepository implements FinderRepository {
  private pool: Pool;
  private sessionHash?: string;
  private correlationId = "";
  private ownerBoundary = false;
  constructor(urlOrBoundary?: string | { boundary: "owner"; sessionHash: string; correlationId?: string }) {
    if (typeof urlOrBoundary === "string") this.pool = getPostgresPool(urlOrBoundary);
    else if (!urlOrBoundary) {
      if (databaseRlsMode() !== "off") throw new Error("An explicit Finder database actor boundary is required.");
      this.pool = getPostgresPool(process.env.DATABASE_URL);
    }
    else {
      this.pool = getOwnerPostgresPool();
      this.ownerBoundary = true;
      this.sessionHash = urlOrBoundary.sessionHash;
      this.correlationId = urlOrBoundary.correlationId ?? "";
    }
  }
  async createSearch(input: DiscoveryRequest, cacheKey?: string) {
    const normalized = normalizeDiscoveryRequest(input);
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_create_search($1,$2::jsonb,$3,$4) id", [this.sessionHash, JSON.stringify({ query: normalized.query, filters: normalized }), cacheKey ?? discoveryCacheKey(normalized), this.correlationId]);
      if (!result.rows[0]?.id) throw new Error("Finder search was rejected.");
      return result.rows[0].id as string;
    }
    const id = randomUUID();
    await this.pool.query(
      "insert into finder_searches (id, query, filters, cache_key) values ($1,$2,$3,$4)",
      [id, normalized.query, normalized, cacheKey],
    );
    return id;
  }
  async completeSearch(id: string, leadIds: string[], cached: boolean) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_complete_search($1,$2,$3::jsonb,$4) ok", [this.sessionHash, id, JSON.stringify(leadIds), cached]);
      if (!result.rows[0]?.ok) throw new Error("Finder search completion was rejected.");
      return;
    }
    await this.pool.query(
      "update finder_searches set lead_ids=$2,result_count=$3,cached=$4,status='completed',completed_at=now() where id=$1",
      [id, JSON.stringify(leadIds), leadIds.length, cached],
    );
  }
  async failSearch(id: string) {
    if (this.ownerBoundary) {
      await this.pool.query("select owner_finder_fail_search($1,$2)", [this.sessionHash, id]);
      return;
    }
    await this.pool.query(
      "update finder_searches set status='failed',completed_at=now() where id=$1 and status='pending'",
      [id],
    );
  }
  async listSearches(limit = 100): Promise<FinderSearchRecord[]> {
    const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_list_searches($1,$2) value", [this.sessionHash, safeLimit]);
      return (result.rows[0]?.value ?? []) as FinderSearchRecord[];
    }
    const result = await this.pool.query(
      "select id,query,filters,cache_key,result_count,lead_ids,cached,status,created_at,completed_at from finder_searches order by created_at desc limit $1",
      [safeLimit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      query: row.query,
      filters: row.filters,
      cacheKey: row.cache_key ?? undefined,
      resultCount: row.result_count,
      leadIds: Array.isArray(row.lead_ids) ? row.lead_ids : [],
      cached: row.cached,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString(),
    }));
  }
  async getCachedSearch(key: string) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_get_cache($1,$2) value", [this.sessionHash, key]);
      return (result.rows[0]?.value as string[] | null | undefined) ?? null;
    }
    const r = await this.pool.query(
      "select lead_ids from finder_search_cache where cache_key=$1 and expires_at>now()",
      [key],
    );
    return r.rows[0]?.lead_ids ?? null;
  }
  async saveCachedSearch(key: string, ids: string[], expiresAt: string) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_save_cache($1,$2,$3::jsonb) ok", [this.sessionHash, key, JSON.stringify(ids)]);
      if (!result.rows[0]?.ok) throw new Error("Finder cache write was rejected.");
      return;
    }
    await this.pool.query(
      "insert into finder_search_cache(cache_key,lead_ids,expires_at) values($1,$2,$3) on conflict(cache_key) do update set lead_ids=excluded.lead_ids,expires_at=excluded.expires_at",
      [key, JSON.stringify(ids), expiresAt],
    );
  }
  async upsertLead(lead: Lead) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_upsert_lead($1,$2::jsonb,$3) value", [this.sessionHash, JSON.stringify(lead), this.correlationId]);
      if (!result.rows[0]?.value) throw new Error("Finder lead write was rejected.");
      return result.rows[0].value as Lead;
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lead.id]);
      const previous = await client.query("select website from leads where id=$1 for update", [lead.id]);
      const previousWebsite = previous.rows[0]?.website?.trim() || undefined;
      const currentWebsite = lead.website?.trim() || undefined;
      await client.query(
        "insert into leads(id,external_id,name,category,address,phone,website,rating,review_count,source,score,score_reasons,signals) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(id) do update set name=excluded.name,category=excluded.category,address=excluded.address,phone=excluded.phone,website=excluded.website,rating=excluded.rating,review_count=excluded.review_count,score=excluded.score,score_reasons=excluded.score_reasons,signals=excluded.signals,updated_at=now()",
        [
        lead.id,
        lead.externalId,
        lead.name,
        lead.category,
        lead.address,
        lead.phone,
        lead.website,
        lead.rating,
        lead.reviewCount,
        lead.source,
        lead.score,
        JSON.stringify(lead.reasons),
        JSON.stringify(lead.signals),
        ],
      );
      const changeType = !previous.rowCount
        ? "first_seen"
        : comparableWebsite(previousWebsite) === comparableWebsite(currentWebsite)
          ? undefined
          : !previousWebsite
            ? "website_added"
            : !currentWebsite
              ? "website_removed"
              : "website_changed";
      if (changeType) {
        await client.query(
          "insert into lead_website_history(id,lead_id,previous_website,current_website,change_type) values($1,$2,$3,$4,$5)",
          [randomUUID(), lead.id, previousWebsite, currentWebsite, changeType],
        );
        if (changeType !== "first_seen") {
          await client.query(
            "insert into audit_events(id,entity_type,entity_id,action,details) values($1,'lead',$2,'website_status_changed',$3)",
            [randomUUID(), lead.id, JSON.stringify({ previousWebsite, currentWebsite, changeType })],
          );
        }
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return lead;
  }
  async listLeads() {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_list_leads($1,250,0) value", [this.sessionHash]);
      return (result.rows[0]?.value ?? []) as Lead[];
    }
    const r = await this.pool.query(
      "select * from leads order by updated_at desc",
    );
    return r.rows.map(mapLead);
  }
  async listBusinessWorkspace(): Promise<BusinessWorkspaceRecord[]> {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_list_workspace($1,250,0) value", [this.sessionHash]);
      return (result.rows[0]?.value ?? []) as BusinessWorkspaceRecord[];
    }
    const r = await this.pool.query(`
      select l.*,
        p.id as profile_id, p.version as profile_version, p.profile as latest_profile,
        p.status as profile_status, p.created_at as profile_created_at,
        coalesce(pc.profile_count, 0)::int as profile_count,
        pe.status as latest_pipeline_status,
        wh.previous_website, wh.current_website, wh.change_type as website_change_type,
        wh.observed_at as website_change_observed_at
      from leads l
      left join lateral (
        select id, version, profile, status, created_at
        from prepared_business_profiles where lead_id=l.id order by version desc limit 1
      ) p on true
      left join lateral (
        select count(*) as profile_count from prepared_business_profiles where lead_id=l.id
      ) pc on true
      left join lateral (
        select status from lead_pipeline_events where lead_id=l.id order by created_at desc limit 1
      ) pe on true
      left join lateral (
        select previous_website, current_website, change_type, observed_at
        from lead_website_history
        where lead_id=l.id and change_type <> 'first_seen'
        order by observed_at desc limit 1
      ) wh on true
      order by l.updated_at desc
    `);
    return r.rows.map((row) => ({
      lead: mapLead(row),
      latestProfile: row.profile_id ? {
        id: row.profile_id,
        leadId: row.id,
        version: row.profile_version,
        profile: row.latest_profile,
        status: row.profile_status,
        createdAt: row.profile_created_at.toISOString(),
      } : undefined,
      profileCount: row.profile_count,
      latestStatus: row.latest_pipeline_status ?? undefined,
      latestWebsiteChange: row.website_change_type ? {
        type: row.website_change_type,
        previousWebsite: row.previous_website ?? undefined,
        currentWebsite: row.current_website ?? undefined,
        observedAt: row.website_change_observed_at.toISOString(),
      } : undefined,
    }));
  }
  async getLead(id: string) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_get_lead($1,$2) value", [this.sessionHash, id]);
      return (result.rows[0]?.value as Lead | null | undefined) ?? null;
    }
    const r = await this.pool.query("select * from leads where id=$1", [id]);
    return r.rows[0] ? mapLead(r.rows[0]) : null;
  }
  async addPipelineEvent(input: Omit<PipelineEvent, "id" | "createdAt">) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_add_pipeline($1,$2,$3,$4,$5) value", [this.sessionHash, input.leadId, input.status, input.notes ?? "", this.correlationId]);
      if (!result.rows[0]?.value) throw new Error("Finder pipeline transition was rejected.");
      return result.rows[0].value as PipelineEvent;
    }
    const id = randomUUID(),
      createdAt = new Date().toISOString();
    await this.pool.query(
      "insert into lead_pipeline_events(id,lead_id,status,notes) values($1,$2,$3,$4)",
      [id, input.leadId, input.status, input.notes],
    );
    return { ...input, id, createdAt };
  }
  async listPipelineEvents(leadId: string) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_list_pipeline($1,$2) value", [this.sessionHash, leadId]);
      return (result.rows[0]?.value ?? []) as PipelineEvent[];
    }
    const r = await this.pool.query(
      "select * from lead_pipeline_events where lead_id=$1 order by created_at",
      [leadId],
    );
    return r.rows.map((x) => ({
      id: x.id,
      leadId: x.lead_id,
      status: x.status,
      notes: x.notes ?? undefined,
      createdAt: x.created_at.toISOString(),
    }));
  }
  async createPreparedProfile(record: PreparedProfileRecord) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_create_profile($1,$2,$3::jsonb,$4,$5) value", [this.sessionHash, record.leadId, JSON.stringify(record.profile), record.status, this.correlationId]);
      if (!result.rows[0]?.value) throw new Error("Prepared profile write was rejected.");
      return result.rows[0].value as PreparedProfileRecord;
    }
    await this.pool.query(
      "insert into prepared_business_profiles(id,lead_id,version,profile,status) values($1,$2,$3,$4,$5)",
      [
        record.id,
        record.leadId,
        record.version,
        JSON.stringify(record.profile),
        record.status,
      ],
    );
    return record;
  }
  async listPreparedProfiles(leadId: string) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_list_profiles($1,$2) value", [this.sessionHash, leadId]);
      return (result.rows[0]?.value ?? []) as PreparedProfileRecord[];
    }
    const r = await this.pool.query(
      "select * from prepared_business_profiles where lead_id=$1 order by version",
      [leadId],
    );
    return r.rows.map((x) => ({
      id: x.id,
      leadId: x.lead_id,
      version: x.version,
      profile: x.profile,
      status: x.status,
      createdAt: x.created_at.toISOString(),
    }));
  }
  async recordProviderUsage(usage: GoogleProviderUsageRecord) {
    if (!this.ownerBoundary) throw new Error("Provider usage recording requires the owner boundary.");
    const result = await this.pool.query(
      "select owner_provider_usage_record($1,$2,$3,$4,$5,$6::date) event_id",
      [this.sessionHash, usage.service, usage.sku, usage.estimatedCostUsdMicros, usage.pricingVersion, usage.pricingAsOf],
    );
    if (!result.rows[0]?.event_id) throw new Error("Provider usage recording was rejected.");
  }
  async appendAudit(x: {
    entityType: string;
    entityId: string;
    action: string;
    details?: Record<string, unknown>;
  }) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_append_audit($1,$2,$3,$4,$5::jsonb,$6) ok", [this.sessionHash, x.entityType, x.entityId, x.action, JSON.stringify(x.details ?? {}), this.correlationId]);
      if (!result.rows[0]?.ok) throw new Error("Finder audit write was rejected.");
      return;
    }
    await this.pool.query(
      "insert into audit_events(id,entity_type,entity_id,action,details) values($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        x.entityType,
        x.entityId,
        x.action,
        JSON.stringify(x.details ?? {}),
      ],
    );
  }
  async listAuditEvents(entityId: string) {
    if (this.ownerBoundary) {
      const result = await this.pool.query("select owner_finder_list_audit($1,$2) value", [this.sessionHash, entityId]);
      return (result.rows[0]?.value ?? []) as AuditEvent[];
    }
    const r = await this.pool.query(
      "select * from audit_events where entity_id=$1 order by created_at desc",
      [entityId],
    );
    return r.rows.map((x) => ({
      id: x.id,
      entityType: x.entity_type,
      entityId: x.entity_id,
      action: x.action,
      details: x.details ?? {},
      createdAt: x.created_at.toISOString(),
    }));
  }
}
function mapLead(x: any): Lead {
  return {
    id: x.id,
    externalId: x.external_id ?? undefined,
    name: x.name,
    category: x.category ?? undefined,
    address: x.address ?? undefined,
    phone: x.phone ?? undefined,
    website: x.website ?? undefined,
    rating: x.rating ?? undefined,
    reviewCount: x.review_count ?? undefined,
    source: x.source,
    score: Number(x.score),
    reasons: x.score_reasons ?? [],
    signals: x.signals,
    createdAt: x.created_at.toISOString(),
    updatedAt: x.updated_at.toISOString(),
  };
}
