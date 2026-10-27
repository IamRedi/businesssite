import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { databaseAccessViolations } from "./database-access-verifier.mjs";

const connection = process.env.CUSTOM_UX_TEST_DATABASE_URL;
const target = new URL(connection ?? "http://invalid");
if (target.hostname !== "127.0.0.1" || target.port !== "55480" || target.pathname !== "/premium_ux" || process.env.RLS_TEST_DISPOSABLE_DATABASE !== "true") throw new Error("Exact disposable premium_ux target required");
const runtimeTarget = new URL(process.env.DATABASE_RUNTIME_URL);
assert.equal(runtimeTarget.host, target.host); assert.equal(runtimeTarget.pathname, target.pathname);
const admin = new pg.Pool({ connectionString: connection }), runtime = new pg.Pool({ connectionString: runtimeTarget.href });
const ids = [randomUUID(), randomUUID()], sessions = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
const design = { version: "custom/1", video: { mode: "showcase", maxDurationSeconds: 30 } };
const priceList = { title: "Preise", serviceLabel: "Leistung", fromLabel: "ab", currency: "EUR", groups: [{ title: "Damen", columns: ["Kurz", "Mittel", "Lang"], items: [{ label: "Schnitt", prices: [{ amountCents: 1600, from: true }, { amountCents: 2000 }, { amountCents: 2400 }] }] }] };
const media = { images: [{ id: "hero", role: "hero", src: "/existing.webp", width: 16, height: 16, alt: "Existing" }], videos: [] };
const doc = { customDesign: design, customMedia: media, priceList, contact: { openingHours: [{ day: "monday", open: "09:00", close: "18:00" }] }, booking: { enabled: true }, content: { name: "Synthetic" }, _customRestore: { untouched: true } };
const authority = "store_localux000000001", key = `sites/${ids[0]}/custom/${randomUUID()}-test.webp`, url = `https://${authority.slice(6)}.public.blob.vercel-storage.com/${key}`;
const context = (token = sessions[0], slug = ids[0], media = false) => runtime.query("select site_admin_custom_context($1,$2,$3) v", [token, slug, media]).then(r => r.rows[0].v);
const apply = (field, expected, value, token = sessions[0], slug = ids[0], expectedDesign = design) => runtime.query("select site_admin_custom_apply($1,$2,$3,$4,$5,$6) v", [token, slug, field, expected, expectedDesign, value]).then(r => r.rows[0].v);
const registration = [sessions[0], ids[0], authority, key, url, "image/webp", 50, 16, 16, null];
const register = (args = registration) => runtime.query("select site_admin_custom_media_register($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) v", args).then(r => r.rows[0].v);
let checks = 0;
try {
  for (let i = 0; i < ids.length; i++) {
    await admin.query("insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$1,'private',$2,now()+interval '1 day',now()+interval '30 days')", [ids[i], doc]);
    await admin.query("insert into site_features(site_id,feature_key,enabled) values($1,'editor',true),($1,'media',true)", [ids[i]]);
    const account = randomUUID();
    await admin.query("insert into site_admin_accounts(id,site_id,email,password_hash) values($1,$2,$3,'unused')", [account, ids[i], `${account}@example.invalid`]);
    await admin.query("insert into site_admin_sessions(id,account_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 hour')", [randomUUID(), account, sessions[i]]);
  }
  assert.equal((await context()).siteId, ids[0]); checks++;
  for (const [token, slug] of [[sessions[1], ids[0]], [sessions[0], ids[1]], ["bad", ids[0]]]) {
    assert.equal(await context(token, slug), null); assert.equal(await apply("priceList", priceList, priceList, token, slug), null); checks++;
  }
  const changed = structuredClone(priceList); changed.groups[0].items[0].prices[0].amountCents = 1699;
  assert.deepEqual(await apply("priceList", priceList, changed), changed); checks++;
  await assert.rejects(apply("priceList", priceList, priceList), /custom_content_conflict/); checks++;
  await assert.rejects(apply("priceList", changed, priceList, sessions[0], ids[0], { version: "wrong" }), /custom_content_conflict/); checks++;
  assert.equal(await apply("contact", doc.contact, {}), null); assert.equal(await apply("customDesign", design, {}), null); checks++;
  const asset = await register(); assert(asset); assert.equal(await register(), asset); checks++;
  for (const [index, value] of [[0, sessions[1]], [1, ids[1]], [2, "store_other000000001"], [3, key.replace(ids[0], ids[1])], [4, url + "?bad"], [5, "image/svg+xml"], [6, 0], [6, 4194305], [7, 2001], [8, 0]]) { const args = [...registration]; args[index] = value; assert.equal(await register(args), null); checks++; }
  const added = { ...media, images: [...media.images, { id: "gallery", role: "gallery", src: url, width: 16, height: 16, alt: "New" }] };
  assert.deepEqual(await apply("customMedia", media, added), added); checks++;
  const injected = structuredClone(added); injected.images[1].src = "https://other.test/photo.webp";
  assert.equal(await apply("customMedia", added, injected), null); checks++;
  injected.images[1].src = url; injected.images[1].width = 200;
  assert.equal(await apply("customMedia", added, injected), null); checks++;
  const ordered = { ...added, images: [...added.images].reverse() };
  assert.deepEqual(await apply("customMedia", added, ordered), ordered); checks++;
  assert.deepEqual(await apply("customMedia", ordered, media), media); checks++;
  const videoKey = key.replace(".webp", ".mp4"), videoUrl = url.replace(".webp", ".mp4");
  const videoArgs = [sessions[0], ids[0], authority, videoKey, videoUrl, "video/mp4", 1600, 16, 16, 2];
  assert(await register(videoArgs)); for (const duration of [0, 31, "NaN"]) { const invalid = [...videoArgs]; invalid[9] = duration; assert.equal(await register(invalid), null); } checks++;
  const videoMedia = { images: [{ ...media.images[0], id: "poster", role: "video-poster" }], videos: [{ id: "video", title: "Video", posterId: "poster", width: 16, height: 16, durationSeconds: 2, sources: [{ src: videoUrl, type: "video/mp4", bytes: 1600 }] }] };
  assert.deepEqual(await apply("customMedia", media, videoMedia), videoMedia); checks++;
  for (const feature of ["media", "editor"]) {
    await admin.query("update site_features set enabled=false where site_id=$1 and feature_key=$2", [ids[0], feature]);
    assert.equal(await context(sessions[0], ids[0], true), null); assert.equal(await register(), null); assert.equal(await apply("customMedia", videoMedia, media), null);
    if (feature === "media") assert(await context()); else assert.equal(await apply("priceList", changed, priceList), null);
    await admin.query("update site_features set enabled=true where site_id=$1 and feature_key=$2", [ids[0], feature]); checks++;
  }
  await admin.query("update sites set demo_expires_at=now()-interval '1 day' where id=$1", [ids[0]]);
  assert.equal(await context(), null); assert.equal(await register(), null); assert.equal(await apply("priceList", changed, priceList), null); checks++;
  await admin.query("update sites set demo_expires_at=now()+interval '1 day' where id=$1", [ids[0]]);
  const final = (await admin.query("select generated_document d,visibility,custom_domain from sites where id=$1", [ids[0]])).rows[0];
  assert.deepEqual(final.d, { ...doc, priceList: changed, customMedia: videoMedia }); assert.equal(final.visibility, "private"); assert.equal(final.custom_domain, null); checks++;
  await admin.query("update sites set generated_document=generated_document-'customDesign' where id=$1", [ids[1]]);
  assert.equal(await context(sessions[1], ids[1]), null); checks++;
  await admin.query("update site_admin_sessions set expires_at=now()-interval '1 second' where token_hash=$1", [sessions[0]]);
  assert.equal(await context(), null); assert.equal(await register(), null); checks++;
  await assert.rejects(runtime.query("select owner_custom_media_context($1,$2)", [sessions[0], ids[0]]), /permission denied/); checks++;
  assert.deepEqual(await databaseAccessViolations(admin), []); checks++;
  console.log(JSON.stringify({ result: "PASS", checks, tenantIsolation: "PASS", lifecycle: "PASS", staleWrites: "PASS", managedMediaBinding: "PASS", unrelatedFields: "UNCHANGED", legacyCustomEndpoint: "DENIED", acl: "PASS" }));
} finally {
  await admin.query("delete from sites where id=any($1::text[])", [ids]);
  await runtime.end(); await admin.end();
}
