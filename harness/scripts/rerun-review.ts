import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "/").split("/");

const RERUN_MARKER = "<!-- greptile-auto-rerun -->";
const REVIEW_TRIGGER = "@greptile review";

export async function requestReviewRerun(prNumber: number, headSha: string): Promise<boolean> {
  const trigger = `sha:${headSha}`;
  const { data: comments } = await octokit.issues.listComments({ owner, repo, issue_number: prNumber });

  const alreadyRequested = comments.some(
    (c) => c.body?.includes(RERUN_MARKER) && c.body?.includes(trigger)
  );

  if (alreadyRequested) {
    console.log(`[skip] Rerun already requested for ${headSha}`);
    return false;
  }

  await octokit.issues.createComment({
    owner, repo, issue_number: prNumber,
    body: `${RERUN_MARKER}\n${REVIEW_TRIGGER}\n${trigger}`,
  });

  console.log(`[done] Requested Greptile re-review for ${headSha}`);
  return true;
}

if (require.main === module) {
  const prNumber = parseInt(process.env.PR_NUMBER ?? "0", 10);
  const headSha = process.env.PR_HEAD_SHA ?? "";
  if (!prNumber || !headSha) { console.error("PR_NUMBER and PR_HEAD_SHA required"); process.exit(1); }
  requestReviewRerun(prNumber, headSha).catch((err) => { console.error(`[fail] ${err.message}`); process.exit(1); });
}
