import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "/").split("/");

const REVIEW_CHECK_NAME = "Greptile Code Review";
const POLL_INTERVAL_MS = 30_000;

const ACTIONABLE_PATTERNS = [
  /vulnerability/i,
  /security\s+(issue|risk|concern)/i,
  /sql\s+injection/i,
  /xss/i,
  /critical/i,
  /high\s+severity/i,
  /must\s+fix/i,
  /action\s+required/i,
  /may\s+(cause|lead|result)/i,
  /could\s+(allow|enable|expose)/i,
  /potentially\s+(unsafe|dangerous|vulnerable)/i,
];

export async function waitForCodeReviewCompletion(opts: {
  headSha: string;
  timeoutMinutes: number;
}): Promise<void> {
  const deadline = Date.now() + opts.timeoutMinutes * 60_000;

  while (Date.now() < deadline) {
    const { data } = await octokit.checks.listForRef({ owner, repo, ref: opts.headSha });
    const reviewRun = data.check_runs.find((cr) => cr.name === REVIEW_CHECK_NAME);

    if (reviewRun) {
      if (reviewRun.head_sha !== opts.headSha) {
        console.log(`[stale] Review for ${reviewRun.head_sha}, want ${opts.headSha}`);
      } else if (reviewRun.status === "completed") {
        if (reviewRun.conclusion === "success") {
          console.log("[pass] Code review completed successfully");
          return;
        }
        throw new Error(`Code review concluded: ${reviewRun.conclusion}`);
      } else {
        console.log(`[wait] Review status: ${reviewRun.status}`);
      }
    } else {
      console.log("[wait] No review check found yet");
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Code review did not complete within ${opts.timeoutMinutes}m`);
}

export async function assertNoActionableFindingsForHead(headSha: string): Promise<void> {
  const { data: prs } = await octokit.repos.listPullRequestsAssociatedWithCommit({
    owner, repo, commit_sha: headSha,
  });
  const prNumber = prs[0]?.number;
  if (!prNumber) throw new Error(`No PR found for SHA ${headSha}`);

  const { data: reviews } = await octokit.pulls.listReviews({ owner, repo, pull_number: prNumber });
  const botReviews = reviews.filter(
    (r) => r.user?.login?.toLowerCase().includes("greptile") && r.commit_id === headSha
  );

  if (botReviews.length === 0) return;
  const latest = botReviews[botReviews.length - 1];
  if (latest.state === "APPROVED") return;

  const body = latest.body ?? "";
  if (ACTIONABLE_PATTERNS.some((p) => p.test(body))) {
    throw new Error(`Actionable findings in review for ${headSha}. Fix and push again.`);
  }

  const { data: comments } = await octokit.pulls.listReviewComments({ owner, repo, pull_number: prNumber });
  for (const c of comments.filter((c) => c.user?.login?.toLowerCase().includes("greptile") && c.commit_id === headSha)) {
    if (ACTIONABLE_PATTERNS.some((p) => p.test(c.body))) {
      throw new Error(`Actionable finding: "${c.body.slice(0, 100)}..."`);
    }
  }

  console.log("[pass] No actionable findings for current head");
}
