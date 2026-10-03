// Pins the an1me.to watchlist request built by src/content/page/watchlist-sync.js.
//
//   node test/watchlist-request.test.js
//
// an1me.to (the Kiranime theme) verifies a nonce on add_to_watchlist / remove_from_watchlist and
// answers HTTP 403 without it. The site's own script sends kiraConfig.nonce.watchlist_actions; the
// extension sent none, so every status push from both request paths was rejected.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const KIRA_CONFIG =
  'var kiraConfig = {"rest_api":"https:\\/\\/an1me.to\\/wp-json\\/kiranime\\/v1\\/","logged_in":true,"user_id":7,"ajax_url":"https:\\/\\/an1me.to\\/wp-admin\\/admin-ajax.php","nonce":{"history_actions":"aaa","watchlist_actions":"wl-nonce-123","system_actions":"bbb"}};';

function load() {
  const requests = [];
  let messageListener = null;
  const sandbox = {
    FormData,
    URLSearchParams,
    AbortController,
    setTimeout: (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms)),
    clearTimeout: () => {},
    location: { pathname: "/" },
    document: { querySelectorAll: () => [{ textContent: "window.foo = 1;" }, { textContent: KIRA_CONFIG }] },
    fetch: async (url, init) => {
      requests.push({ url, body: Object.fromEntries(init.body.entries()) });
      return { ok: true, status: 200, text: async () => '{"success":true,"data":{"message":"ok"}}' };
    },
    chrome: {
      runtime: {
        sendMessage: () => {},
        onMessage: { addListener: (fn) => (messageListener = fn) },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.AnimeTrackerUtils = { sleep: async () => {} };
  vm.createContext(sandbox);
  const rel = "src/content/page/watchlist-sync.js";
  new vm.Script(fs.readFileSync(path.join(REPO, rel), "utf8"), { filename: rel }).runInContext(sandbox);
  return { WatchlistSync: sandbox.AnimeTrackerContent.WatchlistSync, requests, sendMessage: (msg) => new Promise((resolve) => messageListener(msg, {}, resolve)) };
}

let failures = 0;
function check(label, actual, expected) {
  try {
    // Values built inside the vm sandbox carry its prototypes; compare them as plain data.
    assert.deepStrictEqual(actual === undefined ? actual : JSON.parse(JSON.stringify(actual)), expected);
    console.log(`  PASS  ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

(async () => {
  {
    const { WatchlistSync, requests } = load();
    const ok = await WatchlistSync._sendWatchlistRequest(4242, "on_hold", { debug() {}, warn() {} });
    check("status push succeeds", ok, true);
    check("status push carries the page's watchlist nonce", requests[0].body, {
      action: "add_to_watchlist",
      anime_id: "4242",
      type: "on_hold",
      nonce: "wl-nonce-123",
    });
  }
  {
    const { WatchlistSync, requests } = load();
    await WatchlistSync._sendWatchlistRequest(4242, "remove", { debug() {}, warn() {} });
    check("removal carries the nonce too", [requests[0].body.action, requests[0].body.nonce], ["remove_from_watchlist", "wl-nonce-123"]);
  }
  {
    const { requests, sendMessage } = load();
    const response = await sendMessage({ type: "WATCHLIST_SYNC_EXECUTE", animeId: 99, watchlistType: "completed" });
    check("background-requested push succeeds", response, { success: true });
    check("background-requested push carries the nonce", requests[0].body, {
      action: "add_to_watchlist",
      anime_id: "99",
      type: "completed",
      nonce: "wl-nonce-123",
    });
  }

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})();
