// Runs the entire production worker against in-memory storage and a REST-shaped
// Firestore endpoint. A controllable clock makes sync deadlines deterministic.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "../../..");
const clone = value => value === undefined ? undefined : structuredClone(value);
function cloudWorker(initial = {}, cloud = {}, options = {}) {
  const optionsBeforeRequest = options.beforeRequest;
  let now = options.now ?? Date.parse("2026-10-04T12:00:00Z"), failNextPatch = false, failPatches = false;
  const store = clone(initial), remote = clone(cloud), alarms = new Map(options.alarms || []), requests = [], installedListeners = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const settle = (value, callback) => typeof callback === "function" ? (queueMicrotask(() => callback(value)), undefined) : Promise.resolve(value);
  const event = () => ({ addListener() {}, removeListener() {}, hasListener: () => false });
  const anything = () => new Proxy(function () {}, { get: (_, key) => key === "then" ? undefined : key === "addListener" ? () => {} : anything(),
    apply: (_, __, args) => settle(undefined, args.find(value => typeof value === "function")) });
  const chrome = new Proxy({
    runtime: { id: "test", lastError: null, getManifest: () => JSON.parse(fs.readFileSync(path.join(root, "manifest.json"))),
      getURL: file => "chrome-extension://test/" + file, onMessage: event(), onConnect: event(), onInstalled: { addListener: listener => installedListeners.push(listener) }, onStartup: event(), sendMessage: () => Promise.resolve() },
    storage: { local: { get: (keys, callback) => {
      const list = keys == null ? Object.keys(store) : typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return settle(clone(Object.fromEntries(list.filter(key => key in store).map(key => [key, store[key]]))), callback);
    }, set: (data, callback) => { Object.assign(store, clone(data)); return settle(undefined, callback); },
    remove: (keys, callback) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key]; return settle(undefined, callback); } },
    sync: { get: (_, callback) => settle({}, callback), remove: (_, callback) => settle(undefined, callback) }, onChanged: event() },
    // Packed Chrome cannot fire a newly scheduled alarm earlier than 30 seconds.
    alarms: { create: async (name, info) => alarms.set(name, { ...info,
      scheduledTime: Math.max(now + 30000, info.when || now + (info.delayInMinutes ?? info.periodInMinutes ?? 0) * 60000) }),
      get: async name => alarms.get(name), clear: async name => alarms.delete(name), getAll: async () => [...alarms.values()], onAlarm: event() },
  }, { get: (target, key) => key in target ? target[key] : anything() });
  const deniedSites = new Set(options.safariDenied || []), addedSites = [], removedSites = [];
  if (Array.isArray(options.safariDenied)) {
    const manifest = chrome.runtime.getManifest();
    manifest.optional_host_permissions = manifest.host_permissions.filter(origin =>
      !origin.includes('an1me.to') && !origin.includes('graphql.anilist.co'));
    manifest.host_permissions = manifest.host_permissions.filter(origin => origin.includes('an1me.to'));
    chrome.runtime.getManifest = () => manifest;
    chrome.permissions = {
      contains: (details, callback) => settle(details.origins.every(origin => !deniedSites.has(origin)), callback),
      onAdded: { addListener: fn => addedSites.push(fn) }, onRemoved: { addListener: fn => removedSites.push(fn) },
    };
  }
  const sandbox = { console: { log() {}, info() {}, debug() {}, warn() {}, error() {} }, Date: Clock, chrome, URL, URLSearchParams,
    Response, Headers, ReadableStream, AbortController, TextEncoder, TextDecoder, structuredClone, crypto, atob, btoa, queueMicrotask,
    setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref?.(); return timer; }, clearTimeout,
    setInterval: (...args) => { const timer = setInterval(...args); timer.unref?.(); return timer; }, clearInterval };
  const context = vm.createContext(sandbox);
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  const call = (name, ...args) => vm.runInContext(name, context)(...args);
  // Firestore semantics the sync relies on: every write gets a new document updateTime, PATCH honours
  // currentDocument.updateTime / currentDocument.exists preconditions, and updateMask paths (including
  // map entries such as animeData.`slug`) replace or delete exactly those fields.
  let version = 1, exists = options.remoteMissing !== true, lostResponses = 0;
  const updateTime = () => `2026-10-04T11:00:${String(version).padStart(2, "0")}.000000Z`;
  const bumpVersion = () => { version += 1; exists = true; };
  const maskSegments = (path) => {
    const dot = path.indexOf(".");
    if (dot < 0) return [path];
    const sub = path.slice(dot + 1);
    const key = sub.startsWith("`") && sub.endsWith("`") ? sub.slice(1, -1).replace(/\\`/g, "`").replace(/\\\\/g, "\\") : sub;
    return [path.slice(0, dot), key];
  };
  const applyMask = (patch, paths) => {
    if (!paths.length) { for (const key of Object.keys(remote)) delete remote[key]; Object.assign(remote, patch); return; }
    for (const path of paths) {
      const [field, key] = maskSegments(path);
      if (key === undefined) {
        if (field in patch) remote[field] = patch[field]; else delete remote[field];
        continue;
      }
      const source = patch[field] && typeof patch[field] === "object" ? patch[field] : {};
      if (!remote[field] || typeof remote[field] !== "object") remote[field] = {};
      if (key in source) remote[field][key] = source[key]; else delete remote[field][key];
    }
  };
  const error = (status, code) => new Response(JSON.stringify({ error: { code: status, status: code } }), { status });
  sandbox.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (typeof optionsBeforeRequest === 'function') await optionsBeforeRequest(String(url), options);
    if (!String(url).includes("firestore.googleapis.com")) throw Error("Unexpected endpoint: " + url);
    const params = new URL(url).searchParams;
    if (options.method === "PATCH") {
      if (failNextPatch || failPatches) { failNextPatch = false; return new Response("{}", { status: 503 }); }
      const expectedTime = params.get("currentDocument.updateTime");
      const mustNotExist = params.get("currentDocument.exists") === "false";
      if (expectedTime && !exists) return error(404, "NOT_FOUND");
      if (expectedTime && expectedTime !== updateTime()) return error(400, "FAILED_PRECONDITION");
      if (mustNotExist && exists) return error(409, "ALREADY_EXISTS");
      applyMask(call("fromFSDoc", JSON.parse(options.body)) || {}, params.getAll("updateMask.fieldPaths"));
      bumpVersion();
      // The commit happened, but the client never hears back.
      if (lostResponses > 0) { lostResponses -= 1; throw new TypeError("Failed to fetch"); }
    } else if (!exists) {
      return error(404, "NOT_FOUND");
    }
    const selected = params.getAll("mask.fieldPaths");
    const data = selected.length ? Object.fromEntries(selected.filter(key => key in remote).map(key => [key, remote[key]])) : remote;
    return new Response(JSON.stringify({ fields: call("jsonToFirestoreFields", data), updateTime: updateTime() }), { status: 200 });
  };
  const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  sandbox.importScripts = (...files) => files.forEach(run);
  run("background.js");
  return { store, remote, alarms, requests, installedListeners, context, call, now: () => now, advance: ms => now += ms,
    grantWebsiteAccess: () => { deniedSites.clear(); addedSites.forEach(fn => fn({ origins: chrome.runtime.getManifest().optional_host_permissions })); },
    revokeWebsiteAccess: origin => { deniedSites.add(origin); removedSites.forEach(fn => fn({ origins: [origin] })); },
    // Another device writes the document: its content changes and so does its version.
    remoteWrite: (mutate) => { mutate(remote); bumpVersion(); },
    remoteVersion: () => updateTime(),
    loseNextPatchResponse: () => { lostResponses += 1; },
    failNextPatch: () => failNextPatch = true,
    failPatches: value => failPatches = value,
    request: (name, message = {}) => new Promise(resolve => call("messageHandlers." + name, { ...message, waitForCompletion: true }, {}, resolve)),
  };
}
module.exports = { cloudWorker };
