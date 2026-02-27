import { readFileSync, existsSync } from "fs";
import path from "path";

const EVIDENCE_DIR = path.resolve(__dirname, "../../.evidence");
const MANIFEST_PATH = path.join(EVIDENCE_DIR, "manifest.json");
const POLICY_PATH = path.resolve(__dirname, "../risk-policy.json");

function verifyEvidence(): void {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Evidence manifest not found. Run: npm run harness:ui:capture-browser-evidence`);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const policy = JSON.parse(readFileSync(POLICY_PATH, "utf-8")).browserEvidence;
  const errors: string[] = [];

  const ageSec = (Date.now() - new Date(manifest.capturedAt).getTime()) / 1000;
  if (ageSec > policy.maxAgeSec) {
    errors.push(`Evidence is ${Math.round(ageSec)}s old (max ${policy.maxAgeSec}s). Re-capture.`);
  }

  const capturedFlows = new Set(manifest.entries.map((e: any) => e.flow));
  for (const required of policy.requiredFlows) {
    if (!capturedFlows.has(required)) errors.push(`Missing required flow: ${required}`);
  }

  for (const entry of manifest.entries) {
    for (const field of policy.requiredFields) {
      const value = (entry as any)[field];
      if (value === undefined || value === null || value === "") {
        errors.push(`Flow "${entry.flow}" missing field: ${field}`);
      }
    }
    for (const [assertion, passed] of Object.entries(entry.assertions)) {
      if (!passed) errors.push(`Flow "${entry.flow}" assertion failed: ${assertion}`);
    }
  }

  if (errors.length > 0) {
    console.error("Browser evidence verification FAILED:\n");
    for (const err of errors) console.error(`  - ${err}`);
    throw new Error(`${errors.length} evidence verification error(s)`);
  }

  console.log(`[pass] All ${manifest.entries.length} flows verified`);
  console.log(`[pass] Evidence age: ${Math.round(ageSec)}s (max ${policy.maxAgeSec}s)`);
  console.log(`[pass] Head SHA: ${manifest.headSha}`);
}

verifyEvidence();
