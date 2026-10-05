// One command for Windows, Linux, macOS and CI. Every suite gets an isolated Node process.
// Usage: node dev/scripts/run-tests.js [dev/test/example.test.js ...]
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const testDir = path.join(root, "dev/test");
const selected = process.argv.slice(2);
const suites = selected.length
  ? selected.map(file => path.resolve(file))
  : fs.readdirSync(testDir).filter(file => file.endsWith(".test.js")).sort()
    .map(file => path.join(testDir, file));

const invalid = suites.filter(file => {
  try { return !file.endsWith(".test.js") || !fs.statSync(file).isFile(); }
  catch { return true; }
});
if (!suites.length || invalid.length) {
  console.error(invalid.length ? `Invalid test suite:\n${invalid.join("\n")}` : "No test suites found");
  process.exit(1);
}

let failed = 0;
for (const file of suites) {
  console.log(`\nRunning ${path.relative(root, file)}`);
  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    failed++;
    console.error(`Suite failed: ${path.basename(file)} (${result.error?.message || result.signal || `exit ${result.status}`})`);
  }
}
console.log(`\n${suites.length} suites: ${suites.length - failed} passed, ${failed} failed.`);
process.exitCode = failed ? 1 : 0;
