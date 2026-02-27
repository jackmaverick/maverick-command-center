import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "/").split("/");

export async function autoResolveBotOnlyThreads(prNumber: number): Promise<number> {
  const query = `
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              comments(first: 50) {
                nodes { author { login } body }
              }
            }
          }
        }
      }
    }
  `;

  const result: any = await octokit.graphql(query, { owner, repo, pr: prNumber });
  const threads = result.repository.pullRequest.reviewThreads.nodes;
  let resolved = 0;

  for (const thread of threads) {
    if (thread.isResolved) continue;
    const allBot = thread.comments.nodes.every((c: any) => /greptile/i.test(c.author?.login ?? ""));
    if (!allBot) {
      console.log(`[skip] Thread ${thread.id} has human participation`);
      continue;
    }

    await octokit.graphql(
      `mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { id } } }`,
      { threadId: thread.id }
    );
    console.log(`[resolved] Thread ${thread.id}`);
    resolved++;
  }

  return resolved;
}

if (require.main === module) {
  const prNumber = parseInt(process.env.PR_NUMBER ?? "0", 10);
  if (!prNumber) { console.error("PR_NUMBER required"); process.exit(1); }
  autoResolveBotOnlyThreads(prNumber)
    .then((n) => console.log(`Auto-resolved ${n} bot-only thread(s)`))
    .catch((err) => { console.error(`[fail] ${err.message}`); process.exit(1); });
}
