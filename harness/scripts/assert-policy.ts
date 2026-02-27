import { Octokit } from "@octokit/rest";
import {
  loadPolicy,
  getChangedFiles,
  computeRiskTier,
  computeRequiredChecks,
  needsCodeReviewAgent,
} from "./compute-risk-tier";
import { assertDocsDriftRules } from "./assert-docs-drift";
import { waitForCodeReviewCompletion, assertNoActionableFindingsForHead } from "./wait-for-review";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "/").split("/");

async function getCheckRuns(headSha: string) {
  const { data } = await octokit.checks.listForRef({ owner, repo, ref: headSha });
  return data.check_runs.map((cr) => ({
    name: cr.name,
    status: cr.status,
    conclusion: cr.conclusion,
  }));
}

async function assertRequiredChecksSuccessful(requiredChecks: string[], headSha: string) {
  const checksToVerify = requiredChecks.filter((c) => c !== "risk-policy-gate");
  const runs = await getCheckRuns(headSha);

  for (const required of checksToVerify) {
    const run = runs.find((r) => r.name === required);
    if (!run) {
      console.log(`[info] Check "${required}" not yet reported`);
      continue;
    }
    if (run.status !== "completed") {
      console.log(`[info] Check "${required}" still running (${run.status})`);
      continue;
    }
    if (run.conclusion !== "success") {
      throw new Error(`Required check "${required}" failed: ${run.conclusion}`);
    }
    console.log(`[pass] ${required}`);
  }
}

async function main() {
  const headSha = process.env.PR_HEAD_SHA ?? process.env.GITHUB_SHA ?? "";
  if (!headSha) throw new Error("No head SHA available.");

  const policy = loadPolicy();
  const changedFiles = getChangedFiles();
  const tier = computeRiskTier(changedFiles, policy);
  const requiredChecks = computeRequiredChecks(changedFiles, policy);

  console.log(`Risk tier: ${tier}`);
  console.log(`Required checks: ${requiredChecks.join(", ")}`);
  console.log(`Changed files: ${changedFiles.length}`);

  await assertDocsDriftRules(changedFiles);
  console.log("[pass] docs-drift");

  await assertRequiredChecksSuccessful(requiredChecks, headSha);

  if (needsCodeReviewAgent(changedFiles, policy)) {
    console.log("[info] Code review required — waiting for Greptile...");
    await waitForCodeReviewCompletion({ headSha, timeoutMinutes: 20 });
    await assertNoActionableFindingsForHead(headSha);
    console.log("[pass] code-review-agent");
  } else {
    console.log("[skip] code-review-agent (low tier)");
  }

  console.log("\n[pass] All policy gates passed");
}

main().catch((err) => {
  console.error(`[fail] ${err.message}`);
  process.exit(1);
});
