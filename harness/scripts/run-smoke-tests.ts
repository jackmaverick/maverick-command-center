import { execSync } from "child_process";

const SMOKE_TESTS = [
  { name: "typecheck", command: "npm run typecheck" },
  { name: "lint", command: "npm run lint" },
  { name: "build", command: "npm run build" },
];

async function main() {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  for (const test of SMOKE_TESTS) {
    try {
      console.log(`\n--- Running: ${test.name} ---`);
      execSync(test.command, { stdio: "inherit", timeout: 300_000 });
      results.push({ name: test.name, passed: true });
    } catch (err) {
      results.push({ name: test.name, passed: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log("\n--- Smoke Test Results ---");
  for (const r of results) console.log(`${r.passed ? "[pass]" : "[FAIL]"} ${r.name}`);

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) { console.error(`\n${failed.length} smoke test(s) failed`); process.exit(1); }
  console.log("\nAll smoke tests passed");
}

main();
