import { readFileSync } from "fs";
import { minimatch } from "minimatch";
import path from "path";

interface DocsDriftRules {
  watchPaths: string[];
  requireUpdatedDocs: string[];
}

function loadDocsDriftRules(): DocsDriftRules {
  const policy = JSON.parse(
    readFileSync(path.resolve(__dirname, "../risk-policy.json"), "utf-8")
  );
  return policy.docsDriftRules;
}

export async function assertDocsDriftRules(changedFiles: string[]): Promise<void> {
  const rules = loadDocsDriftRules();
  const watchedFileChanged = changedFiles.some((file) =>
    rules.watchPaths.some((pattern) => minimatch(file, pattern))
  );
  if (!watchedFileChanged) return;

  const requiredDocsUpdated = rules.requireUpdatedDocs.every((doc) =>
    changedFiles.includes(doc)
  );
  if (!requiredDocsUpdated) {
    const missing = rules.requireUpdatedDocs.filter((doc) => !changedFiles.includes(doc));
    throw new Error(
      `Control-plane files changed but required docs not updated: ${missing.join(", ")}`
    );
  }
}

if (require.main === module) {
  const { getChangedFiles } = require("./compute-risk-tier");
  assertDocsDriftRules(getChangedFiles())
    .then(() => console.log("[pass] No docs drift detected"))
    .catch((err) => { console.error(`[fail] ${err.message}`); process.exit(1); });
}
