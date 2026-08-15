import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("judge can run, inspect, verify, and tamper", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Every agent claim/ })).toBeVisible();
  await page
    .getByRole("link", { name: /Run a live trial/ })
    .first()
    .click();
  await page.getByRole("radio", { name: /Evidence Researcher/ }).click();
  await page.getByRole("button", { name: /Run live trial/ }).click();
  await expect(page.getByRole("heading", { name: "Agent under examination." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence sealed." })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("link", { name: /Open full report/ }).click();
  await expect(page.getByText("Claims held up under pressure.")).toBeVisible();
  await page.getByRole("link", { name: /Verify receipt/ }).click();
  await expect(page.getByText("Receipt is cryptographically valid")).toBeVisible();
  await page.getByRole("button", { name: /Modify one byte/ }).click();
  await expect(page.getByText("Verification failed")).toBeVisible();
});
test("vulnerable fixture exposes failures", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("radio", { name: /Gullible Researcher/ }).click();
  await page.getByRole("button", { name: /Run live trial/ }).click();
  await expect(page.getByRole("heading", { name: "Evidence sealed." })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("link", { name: /Open full report/ }).click();
  await expect(page.getByText("Material claims failed under pressure.")).toBeVisible();
  await expect(page.getByText("FAIL").first()).toBeVisible();
});
test("active consent is required and cancellation is typed", async ({ request }) => {
  const denied = await request.post("/api/runs", {
    data: { fixture: "evidence-researcher", activeConsent: false },
  });
  expect(denied.status()).toBe(403);
  const created = await request.post("/api/runs", {
    data: { fixture: "evidence-researcher", activeConsent: true },
  });
  const { runId, cancelToken } = await created.json();
  expect((await request.delete(`/api/runs/${runId}`)).status()).toBe(409);
  expect([200, 409]).toContain(
    (
      await request.delete(`/api/runs/${runId}`, {
        headers: { "x-agenttrial-cancel-token": cancelToken },
      })
    ).status(),
  );
});
test("landing has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
});
