// Runs the entire production worker against in-memory storage and a REST-shaped
// Firestore endpoint. A controllable clock makes sync deadlines deterministic.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "../../..");
const clone = value => value === undefined ? undefined : structuredClone(value);
function cloudWorker(initial = {}, cloud = {}, options = {}) {
  let now = options.now ?? Date.parse("2026-10-04T12:00:00Z"), failNextPatch = false, failPatches = false;
  const store = clone(initial), remote = clone(cloud), alarms = new Map(options.alarms || []), requests = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const settle = (value, callback) => typeof callback === "function" ? (queueMicrotask(() => callback(value)), undefined) : Promise.resolve(value);
  const event = () => ({ addListener() {}, removeListener() {}, hasListener: () => false });
  const anything = () => new Proxy(function () {}, { get: (_, key) => key === "then" ? undefined : key === "addListener" ? () => {} : anything(),
    apply: (_, __, args) => settle(undefined, args.find(value => typeof value === "function")) });
  const chrome = new Proxy({
    runtime: { id: "test", lastError: null, getManifest: () => JSON.parse(fs.readFileSync(path.join(root, "manifest.json"))),
      getURL: file => "chrome-extension://test/" + file, onMessage: event(), onConnect: event(), onInstalled: event(), onStartup: event(), sendMessage: () => Promise.resolve() },
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
  const sandbox = { console: { log() {}, info() {}, debug() {}, warn() {}, error() {} }, Date: Clock, chrome, URL, URLSearchParams,
    Response, Headers, AbortController, TextEncoder, TextDecoder, structuredClone, crypto, atob, btoa, queueMicrotask,
    setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref?.(); return timer; }, clearTimeout,
    setInterval: (...args) => { const timer = setInterval(...args); timer.unref?.(); return timer; }, clearInterval };
  const context = vm.createContext(sandbox);
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  const call = (name, ...args) => vm.runInContext(name, context)(...args);
  sandbox.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (!String(url).includes("firestore.googleapis.com")) throw Error("Unexpected endpoint: " + url);
    if (options.method === "PATCH") {
      if (failNextPatch || failPatches) { failNextPatch = false; return new Response("{}", { status: 503 }); }
      Object.assign(remote, call("fromFSDoc", JSON.parse(options.body)));
    }
    const selected = new URL(url).searchParams.getAll("mask.fieldPaths");
    const data = selected.length ? Object.fromEntries(selected.filter(key => key in remote).map(key => [key, remote[key]])) : remote;
    return new Response(JSON.stringify({ fields: call("jsonToFirestoreFields", data) }), { status: 200 });
  };
  const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  sandbox.importScripts = (...files) => files.forEach(run);
  run("background.js");
  return { store, remote, alarms, requests, context, call, now: () => now, advance: ms => now += ms,
    failNextPatch: () => failNextPatch = true,
    failPatches: value => failPatches = value,
    request: (name, message = {}) => new Promise(resolve => call("messageHandlers." + name, { ...message, waitForCompletion: true }, {}, resolve)),
  };
}
module.exports = { cloudWorker };
