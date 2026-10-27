import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPostgresPool } from "@platform/database";
import { normalizeDiscoveredBusiness, PostgresFinderRepository } from "../src/index";

describe.runIf(Boolean(process.env.DATABASE_URL))("business workspace repository", () => {
  it("returns saved leads with their latest enrichment and profile state", async () => {
    const records = await new PostgresFinderRepository().listBusinessWorkspace();
    expect(Array.isArray(records)).toBe(true);
    for (const record of records) {
      expect(record.lead.id).toBeTruthy();
      expect(record.profileCount).toBeGreaterThanOrEqual(0);
      if (record.latestProfile) expect(record.latestProfile.leadId).toBe(record.lead.id);
    }
  });

  it("records website changes once when a known business is observed again", async () => {
    const externalId = `workspace-history-${randomUUID()}`;
    const repository = new PostgresFinderRepository();
    const withoutWebsite = normalizeDiscoveredBusiness({ externalId, name: "Website history integration", category: "Locksmith", address: "Test address", raw: {} });
    try {
      await repository.upsertLead(withoutWebsite);
      await repository.upsertLead(normalizeDiscoveredBusiness({ externalId, name: withoutWebsite.name, category: withoutWebsite.category, address: withoutWebsite.address, website: "https://example.test", raw: {} }));
      await repository.upsertLead(normalizeDiscoveredBusiness({ externalId, name: withoutWebsite.name, category: withoutWebsite.category, address: withoutWebsite.address, website: "http://www.example.test/", raw: {} }));

      const record = (await repository.listBusinessWorkspace()).find((item) => item.lead.id === withoutWebsite.id);
      expect(record?.latestWebsiteChange?.type).toBe("website_added");
      expect(record?.latestWebsiteChange?.currentWebsite).toBe("https://example.test");
      const history = await getPostgresPool().query("select change_type from lead_website_history where lead_id=$1 order by observed_at", [withoutWebsite.id]);
      expect(history.rows.map((row) => row.change_type)).toEqual(["first_seen", "website_added"]);
    } finally {
      await getPostgresPool().query("delete from leads where id=$1", [withoutWebsite.id]);
    }
  });

  it("persists completed fresh and cached search history", async () => {
    const repository = new PostgresFinderRepository();
    const query = `history-${randomUUID()}`;
    const firstId = await repository.createSearch({ query, city: "Essen", radius: 10 }, `cache-${query}`);
    const secondId = await repository.createSearch({ query, city: "Essen", radius: 10 }, `cache-${query}`);
    try {
      await repository.completeSearch(firstId, [], false);
      await repository.completeSearch(secondId, [], true);
      const history = (await repository.listSearches(250)).filter((record) => record.query === query);
      expect(history).toHaveLength(2);
      expect(history.map((record) => record.cached).sort()).toEqual([false, true]);
      expect(history.every((record) => record.status === "completed")).toBe(true);
    } finally {
      await getPostgresPool().query("delete from finder_searches where id=any($1::uuid[])", [[firstId, secondId]]);
    }
  });
});
