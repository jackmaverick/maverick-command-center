import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "jackmaverick/maverick-command-center").split("/");

async function main() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: prs } = await octokit.pulls.list({ owner, repo, state: "all", sort: "updated", direction: "desc", per_page: 100 });
  const thisWeek = prs.filter((pr) => new Date(pr.updated_at) >= weekAgo);
  const merged = thisWeek.filter((pr) => pr.merged_at);

  const { data: issues } = await octokit.issues.listForRepo({ owner, repo, labels: "harness-gap", state: "all", per_page: 100 });
  const openGaps = issues.filter((i) => i.state === "open");
  const closedThisWeek = issues.filter((i) => i.state === "closed" && i.closed_at && new Date(i.closed_at) >= weekAgo);

  const metrics = {
    period: { start: weekAgo.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) },
    prs: { total: thisWeek.length, merged: merged.length },
    harnessGaps: { open: openGaps.length, closedThisWeek: closedThisWeek.length },
  };

  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((err) => { console.error(`[fail] ${err.message}`); process.exit(1); });
