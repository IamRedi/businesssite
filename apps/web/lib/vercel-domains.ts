type VercelDomainResponse = {
  name?: string;
  projectId?: string;
  verified?: boolean;
  verification?: Array<{ type?: string; domain?: string; value?: string }>;
  misconfigured?: boolean;
  recommendedCNAME?: unknown;
  recommendedIPv4?: unknown;
  error?: { message?: string };
};

export type DomainDnsRecord = {
  type: string;
  name: string;
  value: string;
  purpose: "ownership" | "routing";
};

export type DomainSetupResult = {
  provider: "vercel";
  domain: string;
  projectId: string;
  teamId: string;
  ownershipVerified: boolean;
  dnsConfigured: boolean;
  ready: boolean;
  records: DomainDnsRecord[];
  checkedAt: string;
};

export function storedDomainSetup(value: unknown): DomainSetupResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DomainSetupResult>;
  if (
    candidate.provider !== "vercel" ||
    typeof candidate.domain !== "string" ||
    typeof candidate.projectId !== "string" ||
    typeof candidate.teamId !== "string" ||
    typeof candidate.ownershipVerified !== "boolean" ||
    typeof candidate.dnsConfigured !== "boolean" ||
    typeof candidate.ready !== "boolean" ||
    typeof candidate.checkedAt !== "string" ||
    !Array.isArray(candidate.records)
  ) return null;
  const records = candidate.records.filter((record): record is DomainDnsRecord => Boolean(
    record && typeof record === "object" &&
    typeof record.type === "string" && typeof record.name === "string" && typeof record.value === "string" &&
    (record.purpose === "ownership" || record.purpose === "routing"),
  ));
  return { ...candidate, records } as DomainSetupResult;
}

function configuration() {
  const token = process.env.VERCEL_TOKEN?.trim();
  const project = process.env.VERCEL_PROJECT_ID?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (!token || !/^prj_[A-Za-z0-9]{20,64}$/.test(project ?? "") || !/^team_[A-Za-z0-9]{20,64}$/.test(teamId ?? ""))
    throw new Error("Custom domains require exact VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_TEAM_ID authority.");
  return { token, project: project!, teamId: teamId! };
}

function endpoint(path: string, teamId?: string) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  return url;
}

async function request(path: string, init: RequestInit = {}) {
  const { token, teamId } = configuration();
  const response = await fetch(endpoint(path, teamId), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as VercelDomainResponse;
  if (!response.ok) throw new Error(body.error?.message || "Vercel domain request failed.");
  return body;
}

function recommendationValues(value: unknown) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim()];
    if (!entry || typeof entry !== "object") return [];
    const candidate = (entry as { value?: unknown }).value;
    return typeof candidate === "string" && candidate.trim() ? [candidate.trim()] : [];
  });
}

export function normalizeDomainSetup(
  domain: string,
  projectDomain: VercelDomainResponse,
  configuration: VercelDomainResponse,
  authority: { projectId: string; teamId: string },
): DomainSetupResult {
  if (projectDomain.name !== domain || projectDomain.projectId !== authority.projectId)
    throw new Error("Vercel returned a mismatched project-domain attachment.");
  const ownershipRecords: DomainDnsRecord[] = (projectDomain.verification ?? []).flatMap((record) => {
    if (!record.type || !record.domain || !record.value) return [];
    return [{
      type: record.type.toUpperCase(),
      name: record.domain,
      value: record.value,
      purpose: "ownership" as const,
    }];
  });
  const routingRecords: DomainDnsRecord[] = [
    ...recommendationValues(configuration.recommendedCNAME).map((value) => ({
      type: "CNAME",
      name: domain,
      value,
      purpose: "routing" as const,
    })),
    ...recommendationValues(configuration.recommendedIPv4).map((value) => ({
      type: "A",
      name: domain,
      value,
      purpose: "routing" as const,
    })),
  ];
  const ownershipVerified = projectDomain.verified === true;
  const dnsConfigured = configuration.misconfigured === false;
  return {
    provider: "vercel",
    domain,
    projectId: authority.projectId,
    teamId: authority.teamId,
    ownershipVerified,
    dnsConfigured,
    ready: ownershipVerified && dnsConfigured,
    records: [...ownershipRecords, ...routingRecords].filter(
      (record, index, records) => records.findIndex((candidate) =>
        candidate.type === record.type && candidate.name === record.name && candidate.value === record.value
      ) === index,
    ),
    checkedAt: new Date().toISOString(),
  };
}

export async function addVercelProjectDomain(domain: string) {
  const { project } = configuration();
  try {
    return await request(`/v10/projects/${encodeURIComponent(project)}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/already|exists|assigned/i.test(message)) throw error;
    return request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}`);
  }
}

async function getVercelProjectDomain(domain: string) {
  const { project } = configuration();
  return request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}`);
}

async function getVercelDomainConfiguration(domain: string) {
  return request(`/v6/domains/${encodeURIComponent(domain)}/config`);
}

async function verifyVercelProjectDomainOwnership(domain: string) {
  const { project } = configuration();
  return request(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}/verify`, {
    method: "POST",
  });
}

export async function prepareVercelProjectDomain(domain: string) {
  const authority = configuration();
  const projectDomain = await addVercelProjectDomain(domain);
  const domainConfiguration = await getVercelDomainConfiguration(domain);
  return normalizeDomainSetup(domain, projectDomain, domainConfiguration, { projectId: authority.project, teamId: authority.teamId });
}

export async function inspectVercelProjectDomain(domain: string) {
  const authority = configuration();
  const current = await getVercelProjectDomain(domain);
  let projectDomain = current;
  if (!current.verified) {
    try {
      projectDomain = await verifyVercelProjectDomainOwnership(domain);
    } catch {
      // An unmet ownership challenge is an expected pending state. Re-read it
      // so the customer keeps the exact TXT instruction instead of seeing a
      // provider failure.
      projectDomain = await getVercelProjectDomain(domain);
    }
  }
  const domainConfiguration = await getVercelDomainConfiguration(domain);
  return normalizeDomainSetup(domain, projectDomain, domainConfiguration, { projectId: authority.project, teamId: authority.teamId });
}
