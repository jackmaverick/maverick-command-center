import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { chromium, type Browser, type Page } from "@playwright/test";
import path from "path";

const EVIDENCE_DIR = path.resolve(__dirname, "../../.evidence");
const SCREENSHOTS_DIR = path.join(EVIDENCE_DIR, "screenshots");
const MANIFEST_PATH = path.join(EVIDENCE_DIR, "manifest.json");

const BASE_URL = process.env.BASE_URL ?? "https://maverick-command-center.vercel.app";

interface EvidenceEntry {
  flow: string;
  entrypoint: string;
  accountIdentity: string;
  timestamp: string;
  screenshots: string[];
  assertions: Record<string, boolean>;
}

interface EvidenceManifest {
  capturedAt: string;
  headSha: string;
  entries: EvidenceEntry[];
}

interface FlowDefinition {
  name: string;
  entrypoint: string;
  run: (page: Page) => Promise<Record<string, boolean>>;
}

const flows: FlowDefinition[] = [
  {
    name: "dashboard-home",
    entrypoint: "/",
    run: async (page) => {
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      const hasTitle = await page.locator("h1, h2, [class*='title']").first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasCards = await page.locator("[class*='card'], [class*='Card']").first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasCharts = await page.locator("svg.recharts-surface, [class*='chart']").first().isVisible({ timeout: 5000 }).catch(() => false);
      return { "page-loaded": hasTitle, "kpi-cards-visible": hasCards, "charts-rendered": hasCharts };
    },
  },
  {
    name: "pipeline-view",
    entrypoint: "/pipeline",
    run: async (page) => {
      await page.goto(`${BASE_URL}/pipeline`, { waitUntil: "networkidle" });
      const pageLoaded = await page.locator("h1, h2, [class*='title']").first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasFunnel = await page.locator("svg, [class*='funnel'], [class*='pipeline'], [class*='stage']").first().isVisible({ timeout: 5000 }).catch(() => false);
      return { "page-loaded": pageLoaded, "pipeline-funnel-visible": hasFunnel };
    },
  },
  {
    name: "segments-view",
    entrypoint: "/segments/retail",
    run: async (page) => {
      await page.goto(`${BASE_URL}/segments/retail`, { waitUntil: "networkidle" });
      const pageLoaded = await page.locator("h1, h2, [class*='title']").first().isVisible({ timeout: 10000 }).catch(() => false);
      const hasData = await page.locator("[class*='card'], table, [class*='chart']").first().isVisible({ timeout: 5000 }).catch(() => false);
      return { "page-loaded": pageLoaded, "segment-data-visible": hasData };
    },
  },
];

async function captureEvidence(): Promise<void> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const headSha = getHeadSha();
  const manifest: EvidenceManifest = { capturedAt: new Date().toISOString(), headSha, entries: [] };

  const browser: Browser = await chromium.launch({ headless: true });

  try {
    for (const flow of flows) {
      console.log(`Capturing: ${flow.name}`);
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();

      let assertions: Record<string, boolean> = {};
      try {
        assertions = await flow.run(page);
      } catch (err) {
        console.error(`  [error] ${flow.name}: ${err}`);
        assertions = { "flow-completed": false };
      }

      const screenshotName = `${flow.name}-${Date.now()}.png`;
      const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      manifest.entries.push({
        flow: flow.name,
        entrypoint: flow.entrypoint,
        accountIdentity: "public-dashboard",
        timestamp: new Date().toISOString(),
        screenshots: [screenshotPath],
        assertions,
      });

      await context.close();
      for (const [key, value] of Object.entries(assertions)) {
        console.log(`  ${value ? "[pass]" : "[FAIL]"} ${key}`);
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nEvidence manifest written to ${MANIFEST_PATH}`);
}

function getHeadSha(): string {
  try { return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim(); } catch { return "unknown"; }
}

captureEvidence().catch((err) => { console.error(`[fail] ${err.message}`); process.exit(1); });
