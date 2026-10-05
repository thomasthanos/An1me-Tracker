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
const manifest = JSON.parse(read("dist/an1me-tracker-safari/manifest.json"));
const html = read("popup.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");
const css = [...read("popup.html").matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => read(match[1])).join("\n");
const executablePath = [process.env.AT_TEST_BROWSER, ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean).flatMap(dir => [path.join(dir, "Microsoft/Edge/Application/msedge.exe"), path.join(dir, "Google/Chrome/Application/chrome.exe")]), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean).find(file => fs.existsSync(file));
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" };

async function setup(browser, { promiseOnly = false, grant = true, allowed = [], mobile = true } = {}) {
  const context = await browser.newContext(mobile ? phone : { viewport: { width: 420, height: 700 } });
  const page = await context.newPage();
  await page.setContent(html);
  await page.addStyleTag({ content: css });
  if (mobile) await page.evaluate(() => {
    document.documentElement.classList.add("is-mobile");
    document.querySelector(".auth-content").classList.add("auth-mobile");
  });
  await page.evaluate(({ manifest, promiseOnly, grant, allowed }) => {
    const granted = new Set(allowed);
    window.__checks = 0; window.__requests = []; window.__cleanups = 0; window.__lastErrorReads = 0;
    window.__events = { added: new Set(), removed: new Set() };
    const event = name => ({ addListener: fn => window.__events[name].add(fn), removeListener: fn => window.__events[name].delete(fn) });
    const permissions = { onAdded: event("added"), onRemoved: event("removed"),
      contains(details, callback) {
        if (promiseOnly && arguments.length !== 1) throw new TypeError("Promise-only API takes one argument");
        window.__checks++;
        const result = details.origins.every(origin => granted.has(origin));
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
    window.__grantOutside = () => { manifest.optional_host_permissions.forEach(origin => granted.add(origin)); for (const fn of window.__events.added) fn({ origins: manifest.optional_host_permissions }); };
  }, { manifest, promiseOnly, grant, allowed });
  await page.addScriptTag({ content: read("src/common/utils.js") });
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
