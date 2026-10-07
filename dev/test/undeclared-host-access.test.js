// The Safari build reaches Jikan over CORS without declaring it. permissions.contains() is false for an
// undeclared host forever, so asking about it must never pause work or show an "allow access" notice.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "../..");
const SAFARI_HOSTS = ["https://an1me.to/*", "https://*.an1me.to/*", "https://www.animefillerlist.com/*",
  "https://myanimelist.net/*", "https://s4.anilist.co/*"];

function pick(source, name) {
  const normalized = source.replace(/\r\n/g, "\n");
  const start = normalized.indexOf(name);
  return normalized.slice(start, normalized.indexOf("\n}\n", start) + 2);
}

function repairContext(manifest, granted) {
  const source = fs.readFileSync(path.join(ROOT, "src/background/jobs/metadata-repair.js"), "utf8");
  const context = {
    setTimeout, clearTimeout, Promise,
    self: {},
    chrome: { runtime: { getManifest: () => manifest }, permissions: { contains: (d, cb) => cb(granted.includes(d.origins[0])) } },
  };
  context.globalThis = context;
  vm.runInNewContext(`const METADATA_REPAIR_HOST_ORIGINS = ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"];
${pick(source, "async function getMetadataRepairBlockedOrigins")}
${pick(source, "function metadataRepairDeclaredOrigins")}
this.blocked = getMetadataRepairBlockedOrigins;`, context);
  return context;
}

test("metadata repair does not wait for an undeclared host", async () => {
  const context = repairContext({ host_permissions: SAFARI_HOSTS }, ["https://www.animefillerlist.com/*"]);
  assert.deepEqual([...await context.blocked(["https://api.jikan.moe/*"])], []);
});

test("metadata repair still pauses for a declared host that is withheld", async () => {
  const context = repairContext({ host_permissions: SAFARI_HOSTS }, []);
  assert.deepEqual([...await context.blocked([])], ["https://www.animefillerlist.com/*"]);
});

test("without a host list in the manifest both hosts are still checked", async () => {
  const context = repairContext({ version: "x" }, []);
  assert.deepEqual([...await context.blocked([])], ["https://www.animefillerlist.com/*", "https://api.jikan.moe/*"]);
});

test("the popup's filler notice ignores undeclared hosts", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/popup/lib/site-access.js"), "utf8");
  assert.match(source, /GROUPS\.flatMap\(\(group\) => group\.origins\)\.filter\(isDeclared\)/);
});
