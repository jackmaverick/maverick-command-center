import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(
  new URL("./assert-production-branch.mjs", import.meta.url),
);

function run(vercelEnv?: string, branch?: string) {
  const env = { ...process.env };
  if (vercelEnv === undefined) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = vercelEnv;
  if (branch === undefined) delete env.VERCEL_GIT_COMMIT_REF;
  else env.VERCEL_GIT_COMMIT_REF = branch;
  return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
}

describe("production branch guard", () => {
  it("allows local and preview builds", () => {
    expect(run().status).toBe(0);
    expect(run("preview", "codex/example").status).toBe(0);
  });

  it("allows production builds from main", () => {
    expect(run("production", "main").status).toBe(0);
  });

  it("blocks production builds from feature or unknown branches", () => {
    expect(run("production", "codex/meta-ads-funnel").status).toBe(1);
    expect(run("production").status).toBe(1);
  });
});
