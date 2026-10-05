// Real mobile popup DOM with browser permission APIs at the boundary; no network or storage writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; console.log("SKIP site-access setup: expose Playwright through NODE_PATH"); process.exit(0); }
const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
execFileSync(process.execPath, [path.join(root, "dev/scripts/package.js"), "--target", "safari"]);
const safariManifest = JSON.parse(read("dist/an1me-tracker-safari/manifest.json"));
// The request flow below is for builds that list each service as optional (8.2.8–8.2.10), which the code still
// supports; the current Safari build asks for every website in one pattern instead (tested at the end).
const CORE = ["https://an1me.to/*", "https://*.an1me.to/*"];
const manifest = { ...safariManifest, host_permissions: CORE,
  optional_host_permissions: JSON.parse(read("manifest.json")).host_permissions.filter(origin => !CORE.includes(origin) && origin !== "https://graphql.anilist.co/*") };
const html = read("popup.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");
const css = [...read("popup.html").matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => read(match[1])).join("\n");
const executablePath = [process.env.AT_TEST_BROWSER, ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean).flatMap(dir => [path.join(dir, "Microsoft/Edge/Application/msedge.exe"), path.join(dir, "Google/Chrome/Application/chrome.exe")]), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean).find(file => fs.existsSync(file));
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" };

async function setup(browser, { promiseOnly = false, grant = true, allowed = [], mobile = true, manifest: shape = manifest, gate = false } = {}) {
  const context = await browser.newContext(mobile ? phone : { viewport: { width: 420, height: 700 } });
  const page = await context.newPage();
  await page.setContent(html);
  await page.addStyleTag({ content: css });
  if (mobile) await page.evaluate(() => {
    document.documentElement.classList.add("is-mobile");
    document.querySelector(".auth-content").classList.add("auth-mobile");
  });
  await page.evaluate(({ manifest, promiseOnly, grant, allowed }) => {
    window.__manifest = manifest;
    const granted = new Set(allowed);
    window.__checks = 0; window.__requests = []; window.__cleanups = 0; window.__lastErrorReads = 0;
    window.__events = { added: new Set(), removed: new Set() };
    const event = name => ({ addListener: fn => window.__events[name].add(fn), removeListener: fn => window.__events[name].delete(fn) });
    const permissions = { onAdded: event("added"), onRemoved: event("removed"),
      contains(details, callback) {
        if (promiseOnly && arguments.length !== 1) throw new TypeError("Promise-only API takes one argument");
        window.__checks++;
        const result = details.origins.every(origin => granted.has(origin) || granted.has("<all_urls>"));
        if (callback) queueMicrotask(() => callback(result));
        return Promise.resolve(result);
      },
      request(details, callback) {
        if (promiseOnly && arguments.length !== 1) throw new TypeError("Promise-only API takes one argument");
        window.__requests.push({ origins: details.origins, gesture: navigator.userActivation.isActive });
        if (grant === "callback-error") {
          queueMicrotask(() => { window.__callbackError = true; callback(false); window.__callbackError = false; });
          return;
        }
        if (grant === "reject") return Promise.reject(new Error("Safari did not offer a prompt"));
        // What the iPhone did: answer yes and leave every website on Ask.
        if (grant === "noop") { if (callback) queueMicrotask(() => callback(true)); return Promise.resolve(true); }
        if (grant === "pending") return new Promise(resolve => { window.__answer = answer => { if (callback) callback(answer); resolve(answer); }; });
        if (grant) details.origins.forEach(origin => granted.add(origin));
        if (callback) queueMicrotask(() => callback(grant));
        return Promise.resolve(grant);
      } };
    const runtime = { getManifest: () => manifest, get lastError() {
      if (!window.__callbackError) return undefined;
      window.__lastErrorReads++;
      return { message: "Safari did not offer a prompt" };
    } };
    window[promiseOnly ? "browser" : "chrome"] = { permissions, runtime };
    window.fetch = () => { throw new Error("Permission setup must not fetch"); };
    window.setInterval = () => { throw new Error("Permission setup must not poll"); };
    window.__grantInSettings = () => [...manifest.host_permissions, ...(manifest.optional_host_permissions || [])].forEach(origin => granted.add(origin));
    window.__allowAllWebsites = () => granted.add("<all_urls>");
    window.__grantOutside = () => { manifest.optional_host_permissions.forEach(origin => granted.add(origin)); for (const fn of window.__events.added) fn({ origins: manifest.optional_host_permissions }); };
  }, { manifest: shape, promiseOnly, grant, allowed });
  await page.addScriptTag({ content: read("src/common/utils.js") });
  // The popup loads the access gate before the card; the current Safari build needs it to know what to ask for.
  if (gate) await page.addScriptTag({ content: read("src/common/website-access.js") });
  await page.addScriptTag({ content: read("src/popup/lib/site-access.js") });
  await page.evaluate(() => { window.__dispose = window.AnimeTracker.SiteAccess.mountSetup([document.getElementById("authSiteAccess"), document.getElementById("mobileSiteAccess")]); });
  await page.waitForTimeout(80);
  return { context, page };
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  let failures = 0;
  async function test(name, fn) { try { await fn(); console.log("PASS " + name); } catch (error) { failures++; console.error("FAIL " + name + ": " + error.message); } }
  try {
    await test("first mobile popup offers every required service from one tap, before sign-in", async () => {
      const p = await setup(browser);
      assert.equal(await p.page.isVisible("#authSiteAccess .site-access-btn"), true);
      assert.equal(await p.page.evaluate(() => window.__requests.length), 0, "no prompt without a gesture");
      const box = await p.page.locator("#authSiteAccess .site-access-btn").boundingBox();
      assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= 390);
      await p.page.click("#authSiteAccess .site-access-btn");
      await p.page.waitForTimeout(100);
      const requests = await p.page.evaluate(() => window.__requests);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].gesture, true);
      assert.deepEqual(requests[0].origins, manifest.optional_host_permissions);
      for (const host of ["https://api.aniskip.com/*", "https://firestore.googleapis.com/*", "https://cdn.myanimelist.net/*", "https://image.tmdb.org/*"]) assert.ok(requests[0].origins.includes(host), host);
      assert.equal(await p.page.isVisible("#authSiteAccess"), false);
      await p.context.close();
    });
    await test("Promise-only browser API requests the missing hosts, preserving already granted access", async () => {
      const allowed = ["https://myanimelist.net/*"];
      const p = await setup(browser, { promiseOnly: true, allowed });
      await p.page.click("#authSiteAccess .site-access-btn");
      await p.page.waitForTimeout(100);
      assert.deepEqual(await p.page.evaluate(() => window.__requests[0].origins), manifest.optional_host_permissions.filter(origin => !allowed.includes(origin)));
      assert.equal(await p.page.isVisible("#authSiteAccess"), false);
      await p.context.close();
    });
    await test("a refusal leaves setup available with manual Settings instructions", async () => {
      const p = await setup(browser, { grant: false });
      await p.page.click("#authSiteAccess .site-access-btn");
      await p.page.waitForTimeout(100);
      assert.equal(await p.page.isVisible("#authSiteAccess"), true);
      assert.equal(await p.page.isVisible("#authSiteAccess .site-access-steps"), true);
      assert.equal(await p.page.locator("#authSiteAccess .site-access-btn").isEnabled(), true);
      await p.context.close();
    });
    await test("setup and sign-in remain reachable in a partially expanded Safari sheet", async () => {
      const p = await setup(browser, { grant: false });
      await p.page.setViewportSize({ width: 390, height: 460 });
      assert.ok((await p.page.locator("#authSiteAccess").boundingBox()).y >= 0, "setup heading must not be clipped above the sheet");
      await p.page.click("#authSiteAccess .site-access-btn");
      assert.ok((await p.page.locator("#authSiteAccess").boundingBox()).y >= 0, "refusal must not push instructions off screen");
      await p.page.locator("#emailSignInBtn").scrollIntoViewIfNeeded();
      const signIn = await p.page.locator("#emailSignInBtn").boundingBox();
      assert.ok(signIn.y >= 0 && signIn.y + signIn.height <= 460, "sign-in can be reached by scrolling");
      await p.context.close();
    });
    await test("a pending native prompt shows feedback and prevents repeated requests", async () => {
      const p = await setup(browser, { grant: "pending" });
      await p.page.click("#authSiteAccess .site-access-btn");
      assert.equal(await p.page.locator("#authSiteAccess .site-access-btn").isDisabled(), true);
      assert.match(await p.page.locator("#authSiteAccess .site-access-btn").innerText(), /waiting/i);
      await p.page.evaluate(() => window.__answer(false));
      assert.equal(await p.page.locator("#authSiteAccess .site-access-btn").isEnabled(), true);
      assert.match(await p.page.locator("#authSiteAccess .site-access-btn").innerText(), /allow/i);
      assert.equal(await p.page.isVisible("#authSiteAccess .site-access-steps"), true);
      assert.equal(await p.page.evaluate(() => window.__requests.length), 1);
      await p.context.close();
    });
    await test("Settings offers a single access action while the shared library notice remains available", async () => {
      const p = await setup(browser, { grant: "pending" });
      await p.page.evaluate(async () => {
        document.getElementById("authSection").style.display = "none";
        document.getElementById("mainApp").style.display = "flex";
        document.querySelector(".app").classList.add("settings-mode");
        const view = document.getElementById("settingsView");
        view.removeAttribute("hidden");
        const card = document.createElement("div"); card.id = "settingsSiteAccess"; card.className = "site-access";
        view.append(card);
        await window.AnimeTracker.SiteAccess.renderSetup(card);
      });
      assert.equal(await p.page.locator("#mainApp .site-access-btn:visible").count(), 1, "do not offer two simultaneous consent actions");
      await p.page.click("#settingsSiteAccess .site-access-btn");
      assert.equal(await p.page.locator("#mainApp .site-access-btn:visible:enabled").count(), 0);
      await p.page.evaluate(() => window.__answer(false));
      await p.page.evaluate(() => document.querySelector(".app").classList.remove("settings-mode"));
      assert.equal(await p.page.isVisible("#mobileSiteAccess .site-access-btn"), true, "the library notice returns after leaving Settings");
      await p.context.close();
    });
    await test("a rejected permission API reveals usable Settings instructions", async () => {
      const p = await setup(browser, { promiseOnly: true, grant: "reject" });
      await p.page.click("#authSiteAccess .site-access-btn");
      assert.equal(await p.page.isVisible("#authSiteAccess .site-access-steps"), true);
      assert.equal(await p.page.locator("#authSiteAccess .site-access-btn").isEnabled(), true);
      await p.context.close();
    });
    await test("cloud-only or image-only denial offers the same single-tap consent inside the fetch modal", async () => {
      for (const origin of ['https://firestore.googleapis.com/*', 'https://cdn.myanimelist.net/*']) {
        const p = await setup(browser);
        await p.page.evaluate(async origin => {
          const container = document.createElement('div'); container.id = 'modalAccess'; document.body.append(container);
          await AnimeTracker.SiteAccess.render(container, { knownBlockedOrigins: [origin] });
        }, origin);
        assert.equal(await p.page.isVisible('#modalAccess .site-access-btn'), true);
        await p.page.click('#modalAccess .site-access-btn');
        assert.deepEqual(await p.page.evaluate(() => window.__requests[0].origins), manifest.optional_host_permissions);
        await p.context.close();
      }
    });
    await test("missing core site access shows manual steps rather than requesting an empty optional list", async () => {
      const p = await setup(browser, { allowed: manifest.optional_host_permissions });
      await p.page.evaluate(async origins => {
        window.AnimeTrackerWebsiteAccess = { enabled: true, origins };
        await AnimeTracker.SiteAccess.renderSetup(document.getElementById('authSiteAccess'));
      }, [...manifest.host_permissions, ...manifest.optional_host_permissions]);
      assert.equal(await p.page.isVisible('#authSiteAccess .site-access-steps'), true);
      assert.equal(await p.page.locator('#authSiteAccess .site-access-btn').count(), 0);
      assert.equal(await p.page.evaluate(() => window.__requests.length), 0);
      await p.context.close();
    });
    await test("callback API errors are consumed and show manual instructions", async () => {
      const p = await setup(browser, { grant: "callback-error" });
      await p.page.click("#authSiteAccess .site-access-btn");
      assert.equal(await p.page.isVisible("#authSiteAccess .site-access-steps"), true);
      assert.ok(await p.page.evaluate(() => window.__lastErrorReads > 0), "runtime.lastError must be read in the callback");
      await p.context.close();
    });
    await test("permission events refresh setup and listeners are released when the popup closes", async () => {
      const p = await setup(browser);
      assert.deepEqual(await p.page.evaluate(() => [window.__events.added.size, window.__events.removed.size]), [1, 1]);
      await p.page.evaluate(() => window.__grantOutside());
      await p.page.waitForTimeout(100);
      assert.equal(await p.page.isVisible("#authSiteAccess"), false);
      await p.page.evaluate(() => window.__dispose());
      assert.deepEqual(await p.page.evaluate(() => [window.__events.added.size, window.__events.removed.size]), [0, 0]);
      await p.context.close();
    });
    await test("Safari answering yes while leaving the websites on Ask leads to Settings, not the same button again", async () => {
      const p = await setup(browser, { grant: "noop" });
      assert.equal(await p.page.isVisible("#authSiteAccess .site-access-steps"), false, "the prompt comes first");
      await p.page.click("#authSiteAccess .site-access-btn");
      await p.page.waitForTimeout(150);
      assert.equal(await p.page.isVisible("#authSiteAccess"), true, "nothing was granted, so the card stays");
      assert.equal(await p.page.isVisible("#authSiteAccess .site-access-steps"), true);
      const link = p.page.locator("#authSiteAccess .site-access-link");
      assert.equal(await link.isVisible(), true);
      assert.equal(await link.getAttribute("href"), "an1metracker://safari-settings");
      const box = await link.boundingBox();
      assert.ok(box.height >= 44 && box.x + box.width <= 390, "a full-size tap target inside the sheet");
      assert.equal(await p.page.evaluate(() => document.querySelector("#authSiteAccess details").open), true, "the websites to allow are listed");
      // A later render (the popup opened again) leads with Settings too.
      await p.page.evaluate(() => window.AnimeTracker.SiteAccess.renderSetup(document.getElementById("mobileSiteAccess")));
      assert.equal(await p.page.evaluate(() => document.querySelector("#mobileSiteAccess .site-access-steps").hidden), false,
        "the library card (behind sign-in here) leads with Settings as well");
      assert.equal(await p.page.evaluate(() => window.__requests.length), 1);
      await p.context.close();
    });
    await test("coming back from Settings checks again without a permission event", async () => {
      const p = await setup(browser, { grant: false });
      await p.page.evaluate(() => { window.__grantInSettings(); document.dispatchEvent(new Event("visibilitychange")); });
      await p.page.waitForTimeout(100);
      assert.equal(await p.page.isVisible("#authSiteAccess"), false);
      assert.equal(await p.page.evaluate(() => document.getElementById("mobileSiteAccess").hidden), true);
      await p.context.close();
    });
    await test("the Safari build offers one button that asks Safari for every service in one prompt", async () => {
      const services = safariManifest.optional_host_permissions.filter(origin => origin !== "<all_urls>");
      assert.deepEqual(safariManifest.host_permissions, CORE);
      assert.ok(safariManifest.optional_host_permissions.includes("<all_urls>"));
      const p = await setup(browser, { manifest: safariManifest, gate: true, allowed: CORE });
      const before = await p.page.evaluate(() => {
        const el = document.getElementById("authSiteAccess");
        return { hidden: el.hidden, steps: el.querySelector(".site-access-steps").hidden, link: el.querySelector(".site-access-link").hidden };
      });
      assert.deepEqual(before, { hidden: false, steps: true, link: true }, "the button first; no trip to Settings");
      await p.page.click("#authSiteAccess .site-access-btn");
      await p.page.waitForTimeout(150);
      const requests = await p.page.evaluate(() => window.__requests);
      assert.equal(requests.length, 1, "one tap, one prompt");
      assert.equal(requests[0].gesture, true);
      assert.deepEqual(requests[0].origins, services, "every service, and not the all-websites pattern Safari will not grant");
      assert.equal(await p.page.isVisible("#authSiteAccess"), false);
      assert.equal(await p.page.evaluate(() => window.AnimeTrackerWebsiteAccess.isPaused()), false);
      await p.context.close();
    });
    await test("if Safari leaves them on Ask, Settings appears under the button with the one All Websites step", async () => {
      const p = await setup(browser, { manifest: safariManifest, gate: true, allowed: CORE, grant: "noop" });
      await p.page.click("#authSiteAccess .site-access-btn");
      await p.page.waitForTimeout(150);
      const card = await p.page.evaluate(() => {
        const el = document.getElementById("authSiteAccess");
        return { hidden: el.hidden, button: !!el.querySelector(".site-access-btn"), steps: el.querySelector(".site-access-steps").hidden,
          step: el.querySelectorAll(".site-access-steps li")[1].textContent, link: el.querySelector(".site-access-link").hidden,
          href: el.querySelector(".site-access-link").getAttribute("href") };
      });
      assert.deepEqual(card, { hidden: false, button: true, steps: false, step: "Under Permissions, set All Websites to Allow.", link: false,
        href: "an1metracker://safari-settings" });
      // Turning All Websites on in Settings is enough on its own; coming back checks again.
      await p.page.evaluate(() => { window.__allowAllWebsites(); document.dispatchEvent(new Event("visibilitychange")); });
      await p.page.waitForTimeout(150);
      assert.equal(await p.page.isVisible("#authSiteAccess"), false);
      assert.equal(await p.page.evaluate(() => window.AnimeTrackerWebsiteAccess.isPaused()), false);
      await p.context.close();
    });
    await test("desktop and already granted mobile installs do not show setup or request access", async () => {
      for (const options of [{ mobile: false }, { allowed: manifest.optional_host_permissions }]) {
        const p = await setup(browser, options);
        assert.equal(await p.page.isVisible("#authSiteAccess"), false);
        assert.equal(await p.page.evaluate(() => window.__requests.length), 0);
        if (options.mobile === false) assert.equal(await p.page.evaluate(() => window.__checks), 0);
        await p.context.close();
      }
    });
  } finally { await browser.close(); }
  process.exitCode = failures ? 1 : 0;
})();
