import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { encode } from "@auth/core/jwt";
import { chromium } from "@playwright/test";

const host = "127.0.0.1";
const port = 3418;
const baseUrl = `http://${host}:${port}`;
const authSecret = "layout-e2e-secret-that-is-at-least-32-characters";

const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    host,
    "-p",
    String(port),
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      AUTH_SECRET: authSecret,
      AUTH_GOOGLE_ID: "layout-google-id",
      AUTH_GOOGLE_SECRET: "layout-google-secret",
      AUTH_ALLOWED_DOMAIN: "maverickexteriorskc.com",
      REPLIES_ENABLED: "true",
      REPLIES_SEND_CONFIRMED: "false",
      REPLIES_ALLOWED_EMAILS: "jack@maverickexteriorskc.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      // Starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`next start did not become ready:\n${serverOutput}`);
}

const inboxPayload = {
  workspaces: [
    { key: "speed_to_lead", label: "Speed to Lead", count: 28, attentionCount: 12 },
    { key: "insurance", label: "Insurance", count: 209, attentionCount: 128 },
    { key: "sales_follow_up", label: "Sales Follow-up", count: 83, attentionCount: 45 },
    { key: "general", label: "General", count: 218, attentionCount: 50 },
  ],
  rows: [
    {
      contactJnid: "contact-layout",
      jobJnid: "job-layout",
      name: "Layout Test",
      street: "100 Main Street",
      phone: "+19135550100",
      email: "layout@example.com",
      status: "Claim # Needed",
      statusOrder: 8,
      salesRep: "Jack",
      campaign: "Estimate Follow-Up",
      lastAt: "2026-10-28T18:00:00.000Z",
      preview: "Can you call me?",
      channel: "SMS",
      direction: "incoming",
      line: "Maverick Main",
      sender: "Layout Test",
      unread: true,
      unresponded: true,
      jobUrl: null,
    },
  ],
  columns: [{ status: "Claim # Needed", order: 8, count: 1 }],
  total: 209,
  page: 0,
  pageSize: 50,
  hasMore: false,
  warnings: [],
};

const threadPayload = {
  homeowner: {
    contactJnid: "contact-layout",
    name: "Layout Test",
    address: "100 Main Street",
    phones: ["+19135550100"],
    emails: ["layout@example.com"],
  },
  jobs: [
    {
      jobJnid: "job-layout",
      name: "Layout job",
      status: "Claim # Needed",
      address: "100 Main Street",
      salesRep: "Jack",
    },
  ],
  campaigns: [],
  items: [
    {
      id: "sms:1",
      type: "text",
      direction: "inbound",
      deliveryStatus: "received",
      occurredAt: "2026-10-28T18:00:00.000Z",
      channel: "SMS",
      line: "Maverick Main",
      sender: "Layout Test",
      preview: "Can you call me?",
      body: "Can you call me?",
      durationSeconds: null,
    },
  ],
  notes: [],
  primaryJob: {
    jobJnid: "job-layout",
    status: "Claim # Needed",
    salesRep: "Jack",
  },
  warnings: [],
  nextCursor: null,
};

const replyContext = {
  capabilities: {
    text: {
      enabled: true,
      allowed: true,
      canCompose: true,
      sendConfirmed: false,
      sendNow: false,
      queueFor: null,
      reason: "Live send awaits Jack confirmation",
    },
    email: {
      enabled: true,
      allowed: true,
      canCompose: false,
      sendConfirmed: false,
      sendNow: false,
      queueFor: null,
      reason: "Email sending not set up yet",
    },
    note: {
      enabled: true,
      allowed: true,
      canCompose: true,
      sendConfirmed: false,
      sendNow: false,
      queueFor: null,
      reason: "Live send awaits Jack confirmation",
    },
  },
  text: {
    selectedLine: {
      phoneNumberId: "line-1",
      phoneNumber: "+19132686052",
      name: "Maverick Main",
    },
    recipient: "+19135550100",
    lines: [],
    optedOut: false,
    blockedReason: null,
  },
  email: {
    reply: null,
    newEmail: {
      defaultFrom: "info@maverickexteriorskc.com",
      fromOptions: [
        "jack@maverickexteriorskc.com",
        "info@maverickexteriorskc.com",
        "michael@maverickexteriorskc.com",
      ],
      to: ["layout@example.com"],
    },
  },
  drafts: [],
  outbound: [],
};

async function mockApis(page) {
  await page.route("**/api/campaign-inbox?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(inboxPayload) })
  );
  await page.route("**/api/campaign-thread/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(threadPayload) })
  );
  await page.route("**/api/replies/context?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(replyContext) })
  );
  await page.route("**/api/replies/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ repliesOn: true }) })
  );
  await page.route("**/api/replies", (route) => {
    throw new Error(`Layout test must never send: ${route.request().method()}`);
  });
}

async function assertComposer(page, viewport, view) {
  const textarea = page.locator("textarea").last();
  await textarea.waitFor({ state: "visible" });
  const box = await textarea.boundingBox();
  assert.ok(box, `${view} textarea has no bounding box at ${viewport.width}x${viewport.height}`);
  assert.ok(
    box.y >= 0 && box.y + box.height <= viewport.height,
    `${view} textarea is clipped at ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`
  );
  await textarea.focus();
  assert.equal(
    await textarea.evaluate((element) => document.activeElement === element),
    true,
    `${view} textarea is not focusable at ${viewport.width}x${viewport.height}`
  );
}

let browser;
try {
  await waitForServer();
  const token = await encode({
    token: {
      sub: "layout-user",
      name: "Jack",
      email: "jack@maverickexteriorskc.com",
    },
    secret: authSecret,
    salt: "authjs.session-token",
    maxAge: 60 * 60,
  });
  browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
  });

  for (const viewport of [
    { width: 1024, height: 500 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: token,
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await mockApis(page);
    await page.goto(
      `${baseUrl}/campaign-board?view=inbox&workspace=insurance&thread=contact-layout`
    );
    await page.getByText("Replies on").waitFor();
    await page.getByText("Email sending not set up yet").waitFor();
    assert.equal(
      await page.getByRole("button", { name: "email", exact: true }).isDisabled(),
      true,
      "Email control must stay disabled without Gmail service-account credentials"
    );
    await assertComposer(page, viewport, "inbox");

    await page.goto(
      `${baseUrl}/campaign-board?view=board&workspace=insurance&thread=contact-layout`
    );
    await assertComposer(page, viewport, "board slide-over");
    await context.close();
  }

  console.log(
    "Inbox composer verified in Inbox and Board slide-over at 1024x500, 1280x720, and 1440x900."
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
