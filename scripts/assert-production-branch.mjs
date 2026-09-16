const environment = process.env.VERCEL_ENV;
const branch = process.env.VERCEL_GIT_COMMIT_REF;

if (environment === "production" && branch !== "main") {
  console.error(
    `[production-branch-guard] Refusing production build from ${branch ?? "an unknown branch"}. ` +
      "Deploy a preview, merge the reviewed change into main, and let main publish production.",
  );
  process.exit(1);
}

console.log(
  `[production-branch-guard] ${environment === "production" ? "Production main" : "Non-production"} build allowed.`,
);
