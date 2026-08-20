import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";

const baseUrl = process.env.DEMO_BASE_URL ?? "https://agenttrial.tangvu.dev";
const captureDirectory = resolve("test-results", "demo-recording");
const outputDirectory = resolve("docs", "demo");
const outputPath = resolve(outputDirectory, "agenttrial-live-demo.mp4");
const screenshotDirectory = resolve("docs", "screenshots");
const wait = (ms: number) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function caption(page: Page, chapter: string, detail: string) {
  await page.evaluate(
    ({ chapterText, detailText }) => {
      document.querySelector("[data-agenttrial-demo-caption]")?.remove();
      const node = document.createElement("aside");
      node.dataset.agenttrialDemoCaption = "true";
      node.setAttribute("aria-hidden", "true");
      Object.assign(node.style, {
        position: "fixed",
        zIndex: "2147483647",
        left: "32px",
        bottom: "28px",
        maxWidth: "560px",
        padding: "15px 18px",
        border: "1px solid rgba(232, 225, 210, .38)",
        borderLeft: "4px solid #d04d3f",
        background: "rgba(15, 18, 20, .94)",
        color: "#f1ecdf",
        boxShadow: "0 18px 60px rgba(0,0,0,.34)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        letterSpacing: ".02em",
      });
      const label = document.createElement("strong");
      label.textContent = chapterText;
      Object.assign(label.style, {
        display: "block",
        marginBottom: "6px",
        color: "#e16b5c",
        fontSize: "12px",
        letterSpacing: ".14em",
        textTransform: "uppercase",
      });
      const copy = document.createElement("span");
      copy.textContent = detailText;
      Object.assign(copy.style, { display: "block", fontSize: "15px", lineHeight: "1.45" });
      node.append(label, copy);
      document.body.append(node);
    },
    { chapterText: chapter, detailText: detail },
  );
}

async function smoothScroll(page: Page, top: number) {
  await page.evaluate((nextTop) => window.scrollTo({ top: nextTop, behavior: "smooth" }), top);
  await wait(3_500);
}

await rm(captureDirectory, { recursive: true, force: true });
await mkdir(captureDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
  reducedMotion: "no-preference",
  recordVideo: { dir: captureDirectory, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const video = page.video();

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: resolve(screenshotDirectory, "landing.png"), fullPage: true });
  await caption(
    page,
    "01 / CLAIMS NEED PROOF",
    "AgentTrial is the evidence layer for agent marketplaces.",
  );
  await wait(5_000);
  await smoothScroll(page, 620);
  await smoothScroll(page, 0);

  await page
    .getByRole("link", { name: /Run a live trial/ })
    .first()
    .click();
  await page.waitForURL(/\/new$/);
  await caption(
    page,
    "02 / CONTROLLED BENCHMARK",
    "Choose a real deterministic agent fixture—no account or API key required.",
  );
  await page.screenshot({ path: resolve(screenshotDirectory, "new-trial.png"), fullPage: true });
  await wait(5_000);
  await page.getByRole("radio", { name: /Evidence Researcher/ }).click();
  await wait(2_000);
  await page.getByRole("button", { name: /Run live trial/ }).click();
  await page.waitForURL(/\/live\//);
  await caption(
    page,
    "03 / AUTONOMOUS EXECUTION",
    "Discover → seal plan → execute → verify → score → sign.",
  );
  await page.getByRole("heading", { name: "Evidence sealed." }).waitFor({ timeout: 30_000 });
  await wait(5_000);
  await smoothScroll(page, 500);
  await page.screenshot({
    path: resolve(screenshotDirectory, "live-complete.png"),
    fullPage: true,
  });
  await wait(4_000);

  await page.getByRole("link", { name: /Open full report/ }).click();
  await page.waitForURL(/\/reports\//);
  await caption(
    page,
    "04 / VERDICT IN 30 SECONDS",
    "Every score traces to deterministic assertions and captured evidence.",
  );
  await page.screenshot({ path: resolve(screenshotDirectory, "report.png"), fullPage: true });
  await wait(5_000);
  await smoothScroll(page, 720);
  await wait(4_000);

  await page.getByRole("link", { name: /Verify receipt/ }).click();
  await page.waitForURL(/\/verify/);
  await page.getByText("Receipt is cryptographically valid").waitFor({ timeout: 20_000 });
  await caption(
    page,
    "05 / VERIFY LOCALLY",
    "The browser recomputes hashes, event chain, score, seed opening, and Ed25519 trust.",
  );
  await page.screenshot({ path: resolve(screenshotDirectory, "verifier.png"), fullPage: true });
  await wait(7_000);
  await page.getByRole("button", { name: /Modify one byte/ }).click();
  await page.getByText("Verification failed").waitFor();
  await caption(
    page,
    "06 / TAMPER DETECTED",
    "One changed byte fails at the first mismatched commitment.",
  );
  await wait(6_000);

  await page.goto(`${baseUrl}/benchmark`, { waitUntil: "networkidle" });
  await caption(
    page,
    "07 / SAME CLAIMS, DIFFERENT EVIDENCE",
    "Run the secure and intentionally gullible agents head-to-head.",
  );
  await page.screenshot({ path: resolve(screenshotDirectory, "benchmark.png"), fullPage: true });
  await wait(5_000);
  await page.getByRole("button", { name: /Run both live/ }).click();
  await page.getByText("The evidence separated them.").waitFor({ timeout: 30_000 });
  await caption(
    page,
    "08 / DETERMINISTIC SEPARATION",
    "Fresh runs expose provenance, injection, stale-data, timeout, and consistency failures.",
  );
  await wait(8_000);
  await smoothScroll(page, 560);
  await wait(5_000);

  await page.goto(`${baseUrl}/methodology`, { waitUntil: "networkidle" });
  await caption(
    page,
    "09 / PORTABLE TRUST",
    "Versioned methodology. Canonical evidence. Optional Base Sepolia EAS anchor.",
  );
  await wait(7_000);
  await smoothScroll(page, 520);
  await wait(5_000);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await caption(page, "AGENTTRIAL", "AI agents make claims. AgentTrial makes them prove it.");
  await wait(7_000);
} finally {
  await context.close();
  await browser.close();
}

const recordedPath = await video?.path();
if (!recordedPath) throw new Error("Playwright did not produce a video artifact.");
const encoded = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    recordedPath,
    "-an",
    "-vf",
    "setpts=0.9*PTS",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ],
  { stdio: "inherit" },
);
if (encoded.status !== 0) throw new Error(`ffmpeg failed with status ${encoded.status}.`);
console.log(`Demo video: ${outputPath}`);
