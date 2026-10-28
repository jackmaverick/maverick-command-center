import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const appDirectory = join(process.cwd(), "src", "app");
const host = "127.0.0.1";
const port = 3417;
const baseUrl = `http://${host}:${port}`;

const publicPages = new Set(["/login", "/configuration-error"]);
const serviceRoutes = new Set([
  "/api/qbo/cron",
  "/api/qbo/sheet-sync",
  "/api/qbo/webhook",
  "/api/snapshots/generate",
]);

function collectFiles(directory, filename) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path, filename);
    return entry.name === filename ? [path] : [];
  });
}

function pathForFile(file) {
  const directory = relative(appDirectory, file.slice(0, -"/page.tsx".length));
  const route = directory
    .split(sep)
    .filter((segment) => segment && !segment.startsWith("("))
    .map((segment) => (segment.startsWith("[") ? "e2e-value" : segment))
    .join("/");
  return `/${route}`.replace(/\/+$/, "") || "/";
}

function apiPathForFile(file) {
  const directory = relative(appDirectory, file.slice(0, -"/route.ts".length));
  const route = directory
    .split(sep)
    .filter((segment) => segment && !segment.startsWith("("))
    .map((segment) => (segment.startsWith("[") ? "e2e-value" : segment))
    .join("/");
  return `/${route}`;
}

const protectedPages = collectFiles(appDirectory, "page.tsx")
  .map(pathForFile)
  .filter((path) => !publicPages.has(path));

const protectedApis = collectFiles(join(appDirectory, "api"), "route.ts")
  .map(apiPathForFile)
  .filter(
    (path) => !path.startsWith("/api/auth/") && !serviceRoutes.has(path)
  );

const server = spawn(
  process.execPath,
  [join("node_modules", "next", "dist", "bin", "next"), "start", "-H", host, "-p", String(port)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      AUTH_SECRET: "e2e-only-secret-that-is-at-least-32-characters",
      AUTH_GOOGLE_ID: "e2e-google-client-id",
      AUTH_GOOGLE_SECRET: "e2e-google-client-secret",
      AUTH_ALLOWED_DOMAIN: "maverickexteriorskc.com",
      AUTH_ALLOWED_EMAILS: "",
      CRON_SECRET: "e2e-cron-secret",
      DASHBOARD_PASSWORD: "legacy-password-must-not-authorize",
      SESSION_SECRET: "legacy-session-secret-must-not-authorize",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk;
});
server.stderr.on("data", (chunk) => {
  output += chunk;
});

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`next start did not become ready:\n${output}`);
}

function assertLoginRedirect(response, path) {
  assert.ok(
    [302, 303, 307, 308].includes(response.status),
    `${path} returned ${response.status}, expected an auth redirect`
  );
  const location = response.headers.get("location");
  assert.ok(location, `${path} did not provide a redirect location`);
  assert.equal(new URL(location, baseUrl).pathname, "/login");
}

async function request(path, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: "manual",
  });
}

try {
  await waitForServer();

  for (const path of protectedPages) {
    assertLoginRedirect(await request(path), path);
  }

  for (const path of protectedApis) {
    const response = await request(path);
    if (![401, 403].includes(response.status)) {
      assertLoginRedirect(response, path);
    }
  }

  assertLoginRedirect(
    await request("/", {
      headers: {
        cookie:
          "dashboard_session=legacy; session=legacy; next-auth.session-token=legacy",
      },
    }),
    "/ with legacy cookies"
  );

  for (const path of [
    "/api/qbo/cron",
    "/api/qbo/sheet-sync",
    "/api/snapshots/generate",
  ]) {
    assert.equal(
      (await request(path)).status,
      401,
      `${path} must reject a missing cron secret`
    );
  }
  assert.equal(
    (await request("/api/qbo/webhook", { method: "POST", body: "{}" })).status,
    401,
    "/api/qbo/webhook must reject a missing signature"
  );

  console.log(
    `Auth gate verified: ${protectedPages.length} pages, ${protectedApis.length} APIs, legacy cookies, and ${serviceRoutes.size} service routes.`
  );
} finally {
  server.kill("SIGTERM");
}
