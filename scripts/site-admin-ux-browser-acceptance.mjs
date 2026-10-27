import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";

// Run against a separately prepared disposable fixture. Credentials and customer
// screenshots stay in the ignored private output directory; no hosted target.
const base = process.env.UX_LOCAL_URL ?? "http://localhost:3012";
const url = new URL(base);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "3012") throw new Error("Exact local UX target required");
const slug = process.env.UX_LOCAL_SLUG ?? "barber-demo";
const out = resolve(".custom-site-private/ux-evidence");
mkdirSync(out, { recursive: true });
const { chromium } = await import(pathToFileURL(readFileSync(".custom-site-private/playwright.txt", "utf8")).href);
const login = JSON.parse(readFileSync(".custom-site-private/login.json", "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Europe/Berlin" });
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
const errors = [];
const run = Date.now().toString(36), names = { alex: `Alex Test ${run}`, sam: `Sam Test ${run}`, robin: `Robin Test ${run}` };
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (/unique.*key|hydration|did not match/i.test(message.text())) errors.push(message.text()); });
await context.route("https://wa.me/**", route => route.abort());
await context.route("https://localux000000001.public.blob.vercel-storage.com/**", async route => { const response = await context.request.get(`http://127.0.0.1:3013${new URL(route.request().url()).pathname}`); await route.fulfill({ status: response.status(), contentType: response.headers()["content-type"], body: await response.body() }); });
await context.addInitScript(() => {
  window.open = () => ({ opener: null, location: { set href(value) { window.__uxComposer = value; } }, close() {} });
});
const checkOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow: ${page.url()}`);
const screenshot = async name => { await page.waitForLoadState("networkidle"); await checkOverflow(); await page.addStyleTag({ content: "nextjs-portal { display:none!important; }" }); await page.screenshot({ path: resolve(out, name), fullPage: true, caret: "initial" }); };
const receipt = { login: false, canonicalRedirect: false, desktop: false, mobile390: false, confirmBeforeWhatsApp: false, proposalFlow: false, failureNoComposer: false, hoursSave: false, publicWebsite: false, customPriceAndMediaEdit: "Covered by site-admin-custom-browser-acceptance.mjs", errors };
try {
  await page.goto(`${base}/site-admin/login`);
  await page.locator('[name="email"]').fill(login.email);
  await page.locator('[name="password"]').fill(login.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForURL(`**/site-admin/${slug}`);
  await page.getByRole("heading", { name: "Übersicht", exact: true }).waitFor();
  receipt.login = true;
  assert.equal(await page.locator(".premium-nav a").count(), 5);
  const service = await page.locator('[name="service0Title"]').inputValue();
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const available = await (await context.request.get(`${base}/api/public/booking?slug=${slug}&date=${day}`)).json();
  assert(available.slots?.length >= 4);
  for (const [i, name] of [names.alex, names.sam, names.robin].entries()) {
    const response = await context.request.post(`${base}/api/public/booking`, { headers: { origin: base }, data: { slug, start: available.slots[i].startsAt, service, name, phone: "+4917612345678", email: "ux@example.invalid" } });
    assert.equal(response.status(), 201, await response.text());
  }
  await page.reload();
  await screenshot("overview-1280.png");
  await page.locator('.premium-nav a[href="#appointments"]').click();
  await page.getByRole("heading", { name: names.alex }).waitFor();
  assert(!/Hold bis|approval_request|version|requested/.test(await page.locator('.premium-booking').innerText()));
  await screenshot("appointments-1280.png");
  const card = page.locator(".premium-appointment").filter({ has: page.getByRole("heading", { name: names.alex, exact: true }) });
  await card.getByRole("button", { name: "Bestätigen & WhatsApp", exact: true }).click();
  await page.waitForFunction(() => window.__uxComposer?.startsWith("https://wa.me/"));
  const composer = await page.evaluate(() => window.__uxComposer);
  assert(new URL(composer).searchParams.get("text").includes("ist bestätigt"));
  const after = await (await context.request.get(`${base}/api/public/booking?slug=${slug}&date=${day}`)).json();
  assert(!after.slots.some(slot => slot.startsAt === available.slots[0].startsAt));
  receipt.confirmBeforeWhatsApp = true;
  await page.getByRole("button", { name: "Bestätigt", exact: true }).click();
  await page.locator(".premium-appointment").filter({ hasText: names.alex }).getByRole("link", { name: "WhatsApp", exact: true }).waitFor();
  await screenshot("confirmed-1280.png");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  const proposal = page.locator(".premium-appointment").filter({ has: page.getByRole("heading", { name: names.sam, exact: true }) });
  await proposal.getByRole("button", { name: "Andere Zeit", exact: true }).click();
  const localTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(available.slots[3].startsAt)).replace(" ", "T");
  await proposal.locator('input[type="datetime-local"]').fill(localTime);
  await proposal.getByRole("button", { name: "Vorschlagen & WhatsApp" }).click();
  await proposal.getByRole("button", { name: "Kunde hat zugesagt" }).click();
  await proposal.getByRole("button", { name: "Bestätigen & WhatsApp", exact: true }).click();
  await proposal.waitFor({ state: "hidden" });
  receipt.proposalFlow = true;
  const failing = page.locator(".premium-appointment").filter({ hasText: names.robin });
  await page.evaluate(() => { window.__uxComposer = null; });
  await page.route(`**/api/site-admin/${slug}/booking`, route => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ errorCode: "slot_unavailable" }) }));
  await failing.getByRole("button", { name: "Bestätigen & WhatsApp", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Slot nicht mehr frei" }).waitFor();
  assert.equal(await page.evaluate(() => window.__uxComposer), null);
  await page.unroute(`**/api/site-admin/${slug}/booking`);
  receipt.failureNoComposer = true;
  await page.goto(`${base}/site-admin/${slug}/booking`);
  await page.waitForURL(`**/site-admin/${slug}#appointments`);
  receipt.canonicalRedirect = true;
  await page.locator('.premium-nav a[href="#website"]').click();
  await page.locator('.premium-groups a[href="#hours"]').click();
  const afternoon = page.locator('[name="fridayInterval0Open"]');
  assert.equal(await afternoon.inputValue(), "14:00");
  await afternoon.fill("14:30");
  await page.locator('.premium-hours-only button[type="submit"]').click();
  await page.waitForURL(/saved=1/);
  await page.goto(`${base}/site-admin/${slug}#hours`);
  assert.equal(await afternoon.inputValue(), "14:30");
  await afternoon.fill("14:00");
  await page.locator('.premium-hours-only button[type="submit"]').click();
  await page.waitForURL(/saved=1/);
  receipt.hoursSave = true;
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const section of ["overview", "appointments", "content", "services", "hours", "media", "settings"]) {
      await page.goto(`${base}/site-admin/${slug}#${section}`);
      await page.locator(".premium-heading h1").waitFor();
      await page.waitForTimeout(200);
      if (section === "appointments") await page.getByRole("button", { name: "Neu", exact: true }).click();
      await screenshot(`${section}-${width}.png`);
    }
    await page.goto(`${base}/site-admin/${slug}#content`);
    await page.locator('.premium-preview>summary').click();
    await page.locator('.premium-preview-viewport').getByRole("button", { name: "Mobil", exact: true }).click();
    assert.equal(await page.locator('.premium-preview-viewport iframe').getAttribute("width"), "390");
    await page.frameLocator(".premium-preview-viewport iframe").locator('[data-custom-design="custom/1"]').waitFor();
    await screenshot(`preview-${width}.png`);
    await page.locator('.premium-preview>summary').click();
    await page.goto(`${base}/site-admin/${slug}#appointments`);
    const settingsButton = page.locator('.premium-booking-toolbar').getByRole("button", { name: "Einstellungen", exact: true });
    if (await settingsButton.getAttribute("aria-expanded") !== "true") await settingsButton.click();
    await screenshot(`booking-settings-${width}.png`);
    await page.getByText("Geschlossene Tage", { exact: true }).click();
    await checkOverflow();
    if (width === 390) receipt.mobile390 = true; else receipt.desktop = true;
  }
  await page.goto(`${base}/site/${slug}`);
  assert.equal((await page.locator('[data-custom-design="custom/1"]').count()), 1);
  await checkOverflow();
  receipt.publicWebsite = true;
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(out, "failure.png"), fullPage: true, caret: "initial" });
  writeFileSync(resolve(out, "receipt.json"), JSON.stringify({ ...receipt, failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
