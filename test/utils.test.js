// Pins the shared helpers in src/common/utils.js.
//
//   node test/utils.test.js
//
// Each helper replaced several copies spread over the worker, popup and content scripts. Where the
// copies disagreed, the cases below record which behavior was kept.
const assert = require("assert");
const path = require("path");

global.self = global;
require(path.join(__dirname, "..", "src/common/utils.js"));
const Utils = global.self.AnimeTrackerUtils;

let failures = 0;
function check(label, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log(`  PASS  ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected ${JSON.stringify(expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

const ISO = "2026-09-01T12:00:00.000Z";
const MS = Date.parse(ISO);

check("toMillis parses an ISO string", Utils.toMillis(ISO), MS);
check("toMillis passes a number through", Utils.toMillis(MS), MS);
check("toMillis is 0 for missing", Utils.toMillis(null), 0);
check("toMillis is 0 for garbage", Utils.toMillis("not a date"), 0);
// cache-policy tells "never cached" from epoch 0 by NaN; the other copies wanted 0.
check("toMillisOrNaN is NaN for missing", Number.isNaN(Utils.toMillisOrNaN(undefined)), true);
check("toMillisOrNaN is NaN for garbage", Number.isNaN(Utils.toMillisOrNaN("x")), true);
check("toMillisOrNaN parses like toMillis", Utils.toMillisOrNaN(ISO), MS);

check("slugify", Utils.slugify("  Re:Zero — Starting Life_in Another World! "), "re-zero-starting-life-in-another-world");
check("slugify empty", Utils.slugify(null), "");

check("decode named entities", Utils.decodeHtmlEntities("Tom &amp; Jerry &quot;Movie&quot;"), 'Tom & Jerry "Movie"');
check("decode numeric entities", Utils.decodeHtmlEntities("It&#39;s &#x2014; ok"), "It's — ok");
check("decode typographic entities", Utils.decodeHtmlEntities("Don&rsquo;t stop&hellip;"), "Don’t stop…");
check("decode double-encoded text", Utils.decodeHtmlEntities("A &amp;amp; B"), "A & B");
check("decode leaves unknown entities", Utils.decodeHtmlEntities("&bogus; &"), "&bogus; &");
check("decode leaves out-of-range code points", Utils.decodeHtmlEntities("&#99999999;"), "&#99999999;");
check("decode non-strings", Utils.decodeHtmlEntities(undefined), "");

check("hashText is the 32-bit FNV-1a used by the old copies", Utils.hashText("anime"), "1db1rvz");
check("cacheSignature prefers the library revision", Utils.cacheSignature({ a: 1 }, 7), "revision:7");
check("cacheSignature hashes the data without a revision", Utils.cacheSignature({ a: 1 }), `7|${Utils.hashText('{"a":1}')}`);
check("cacheSignature ignores a negative revision", Utils.cacheSignature({}, -1), `2|${Utils.hashText("{}")}`);

(async () => {
  const started = Date.now();
  await Utils.sleep(-50);
  check("sleep treats a negative delay as 0", Date.now() - started < 50, true);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
})();
