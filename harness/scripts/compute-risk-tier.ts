import { execSync } from "child_process";
import { readFileSync } from "fs";
import { minimatch } from "minimatch";
import path from "path";

interface RiskPolicy {
  version: string;
  riskTierRules: Record<string, string[]>;
  mergePolicy: Record<string, { requiredChecks: string[]; requireCodeReview: boolean }>;
}

const POLICY_PATH = path.resolve(__dirname, "../risk-policy.json");

export function loadPolicy(): RiskPolicy {
  return JSON.parse(readFileSync(POLICY_PATH, "utf-8"));
}

export function getChangedFiles(base = "origin/main"): string[] {
  try {
    const output = execSync(`git diff --name-only ${base}...HEAD`, {
      encoding: "utf-8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    const output = execSync("git diff --name-only HEAD~1", {
      encoding: "utf-8",
    });
    return output.trim().split("\n").filter(Boolean);
  }
}

export function computeRiskTier(
  changedFiles: string[],
  policy: RiskPolicy
): "high" | "low" {
  const highPatterns = policy.riskTierRules.high ?? [];

  for (const file of changedFiles) {
    for (const pattern of highPatterns) {
      if (minimatch(file, pattern)) {
        return "high";
      }
    }
  }

  return "low";
}

export function computeRequiredChecks(
  changedFiles: string[],
  policy: RiskPolicy
): string[] {
  const tier = computeRiskTier(changedFiles, policy);
  return policy.mergePolicy[tier]?.requiredChecks ?? [];
}

export function needsCodeReviewAgent(
  changedFiles: string[],
  policy: RiskPolicy
): boolean {
  const tier = computeRiskTier(changedFiles, policy);
  return policy.mergePolicy[tier]?.requireCodeReview ?? false;
}

if (require.main === module) {
  const policy = loadPolicy();
  const files = getChangedFiles();
  const tier = computeRiskTier(files, policy);
  const checks = computeRequiredChecks(files, policy);
  const needsReview = needsCodeReviewAgent(files, policy);

  console.log(JSON.stringify({ tier, checks, needsReview, changedFiles: files }, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = require("fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `risk_tier=${tier}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `required_checks=${JSON.stringify(checks)}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `needs_review=${needsReview}\n`);
  }
}
