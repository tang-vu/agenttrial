import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const origin = process.env.CAPTURE_ORIGIN ?? "http://127.0.0.1:4190";
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
await page.goto(origin, { waitUntil: "networkidle" });
await page.screenshot({ path: "docs/screenshots/landing.png", fullPage: true });
await page.goto(`${origin}/new`, { waitUntil: "networkidle" });
await page.screenshot({ path: "docs/screenshots/new-trial.png", fullPage: true });
await page.getByRole("button", { name: /Run live trial/ }).click();
await page.getByRole("heading", { name: "Evidence sealed." }).waitFor({ timeout: 30_000 });
await page.evaluate(() => document.querySelector(".skip")?.blur());
await page.screenshot({ path: "docs/screenshots/live-complete.png", fullPage: true });
await page.getByRole("link", { name: /Open full report/ }).click();
await page.getByText("Claims held up under pressure.").waitFor();
await page.evaluate(() => document.querySelector(".skip")?.blur());
await page.screenshot({ path: "docs/screenshots/report.png", fullPage: true });
await page.getByRole("link", { name: /Verify receipt/ }).click();
await page.getByText("Receipt is cryptographically valid").waitFor();
await page.evaluate(() => document.querySelector(".skip")?.blur());
await page.screenshot({ path: "docs/screenshots/verifier.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(origin, { waitUntil: "networkidle" });
await page.screenshot({ path: "docs/screenshots/mobile.png", fullPage: true });
await browser.close();
console.log("Captured landing, new trial, live, report, verifier, and mobile screenshots.");
