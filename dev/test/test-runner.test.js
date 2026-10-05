// Exercise the command with real child processes; a later pass must not mask a failure.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const runner = path.join(root, "dev/scripts/run-tests.js");

function fixture(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-runner-"));
  try { fn(temp); }
  finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

function run(cwd, files) {
  return spawnSync(process.execPath, [runner, ...files], { cwd, encoding: "utf8" });
}

test("a later passing suite does not mask a failing suite or suppress its diagnostics", () => {
  fixture(temp => {
    const bad = path.join(temp, "bad.test.js");
    const good = path.join(temp, "good.test.js");
    fs.writeFileSync(bad, 'console.error("expected failure diagnostic"); process.exitCode = 3;');
    fs.writeFileSync(good, 'console.log("later suite executed");');
    const result = run(root, [bad, good]);
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /expected failure diagnostic/);
    assert.match(result.stdout, /later suite executed/);
    assert.match(result.stdout, /1 passed, 1 failed/);
  });
});

test("suites run with the repository as cwd even when invoked from another directory", () => {
  fixture(temp => {
    const file = path.join(temp, "root.test.js");
    fs.writeFileSync(file, `require("node:assert/strict").equal(process.cwd(), ${JSON.stringify(root)});`);
    const result = run(temp, [file]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /1 passed, 0 failed/);
  });
});

test("invalid suite paths fail before any selected suite executes", () => {
  fixture(temp => {
    const marker = path.join(temp, "executed");
    const file = path.join(temp, "valid.test.js");
    fs.writeFileSync(file, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");`);
    const result = run(root, [file, path.join(temp, "missing.test.js")]);
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(marker), false);
    assert.match(result.stderr, /Invalid test suite/);
  });
});
