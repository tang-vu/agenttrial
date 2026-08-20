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
  await expect(page.getByText("Tested claims held up under pressure.")).toBeVisible();
  await page.getByRole("link", { name: /Verify receipt/ }).click();
  await expect(page.getByText("Receipt is cryptographically valid")).toBeVisible();
  await expect(page.getByText("seed opening")).toBeVisible();
  await expect(page.getByText("evaluator provenance")).toBeVisible();
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
  await expect(page.getByText("Material tested claims failed under pressure.")).toBeVisible();
  await expect(page.getByText("FAIL").first()).toBeVisible();
});
test("head-to-head benchmark executes fresh evidence for both agents", async ({ page }) => {
  await page.goto("/benchmark");
  await expect(page.getByRole("heading", { name: /Same claims/ })).toBeVisible();
  await page.getByRole("button", { name: /Run both live/ }).click();
  await expect(page.getByText("The evidence separated them.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/point evidence gap/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Inspect report/ })).toHaveCount(2);
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
test("trial creation is idempotent and rejects key reuse with different input", async ({
  request,
}) => {
  const key = `e2e-${Date.now()}-fixture`;
  const first = await request.post("/api/runs", {
    headers: { "Idempotency-Key": key },
    data: { fixture: "evidence-researcher", activeConsent: true },
  });
  expect(first.status()).toBe(201);
  const created = await first.json();
  const replay = await request.post("/api/runs", {
    headers: { "Idempotency-Key": key },
    data: { fixture: "evidence-researcher", activeConsent: true },
  });
  expect(replay.status()).toBe(200);
  expect(replay.headers()["idempotency-replayed"]).toBe("true");
  expect((await replay.json()).runId).toBe(created.runId);
  const conflict = await request.post("/api/runs", {
    headers: { "Idempotency-Key": key },
    data: { fixture: "gullible-researcher", activeConsent: true },
  });
  expect(conflict.status()).toBe(422);
});
test("cancelled live run stops progress and explains receipt semantics", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/runs", {
    data: { fixture: "evidence-researcher", activeConsent: true },
  });
  const { runId, cancelToken } = await created.json();
  await request.delete(`/api/runs/${runId}`, {
    headers: { "x-agenttrial-cancel-token": cancelToken },
  });
  await page.goto(`/live/${runId}`);
  await expect(page.getByRole("heading", { name: "Trial cancelled." })).toBeVisible();
  await expect(page.getByText("No receipt was issued.")).toBeVisible();
  await expect(page.getByText("Evaluator is working")).toHaveCount(0);
});

test("zero-coverage reports never present an agent score", async ({ page, request }) => {
  const created = await request.post("/api/runs", {
    data: { fixture: "evidence-researcher", activeConsent: true },
  });
  const { runId } = await created.json();
  let source:
    | {
        state: string;
        report: {
          target: { controlled: boolean };
          score: {
            coverage: number;
            confidence: string;
            badge: string;
            untestedClaims: string[];
          };
          claims: Array<{ id: string }>;
        };
      }
    | undefined;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await request.get(`/api/runs/${runId}`);
    source = await response.json();
    if (source.state === "COMPLETED") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!source?.report) throw new Error("Fixture report did not complete");
  source.report.target.controlled = false;
  source.report.score.coverage = 0;
  source.report.score.confidence = "low";
  source.report.score.badge = "not-verified";
  source.report.score.untestedClaims = source.report.claims.map(
    (claim: { id: string }) => claim.id,
  );
  await page.route("**/api/runs/passive-preview", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(source) }),
  );
  await page.goto("/reports/passive-preview");
  await expect(page.getByText("N/A")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public surface checks only" })).toBeVisible();
  await expect(page.getByText("Capability claims remain unverified.")).toBeVisible();
});
test("landing has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
});
test("key product screens have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/new", "/benchmark", "/verify"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  }
});
test("machine endpoints report truthful optional-provider status", async ({ request }) => {
  const ready = await request.get("/api/ready");
  expect(ready.status()).toBe(200);
  const body = await ready.json();
  expect(body.ready).toBe(true);
  expect(body.plannerProvider).toBe("deterministic");
  expect(body.openAIProvider).toBe("not-configured");
  const descriptor = await request.get("/.well-known/agenttrial.json");
  const descriptorBody = await descriptor.json();
  expect(descriptorBody.a2a.supported).toBe(false);
  expect((await request.get(new URL(descriptorBody.schema).pathname)).status()).toBe(200);
  const openapi = await (await request.get("/openapi.json")).json();
  expect(openapi.openapi).toBe("3.1.0");
  for (const schema of [
    "Claim",
    "Trial",
    "Observation",
    "AssertionResult",
    "Score",
    "EvidenceItem",
    "Report",
    "Receipt",
    "EvidenceBundle",
  ])
    expect(openapi.components.schemas[schema], `${schema} schema`).toBeTruthy();
  expect(openapi.components.schemas.Run.required).toContain("id");
  expect(openapi.components.schemas.EvidenceBundle.properties.report.$ref).toContain("Report");
  const methodology = await (await request.get("/api/methodology")).json();
  expect(methodology.methodologyVersion).toBe("agenttrial-1.1.0");
  expect(methodology.assertionRegistryHash).toMatch(/^[0-9a-f]{64}$/);
  expect(methodology.scoreAuthority).toBe("deterministic-code-only");
  expect(openapi.components.schemas.MethodologyManifest).toBeTruthy();
  const security = await request.get("/.well-known/security.txt");
  expect(security.status()).toBe(200);
  expect(await security.text()).toContain("agenttrial.tangvu.dev/.well-known/security.txt");
});

test("production pages enforce a nonce CSP without inline script execution", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  const policy = response.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("script-src 'self' 'nonce-");
  expect(policy).toContain("'strict-dynamic'");
  expect(policy.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
  expect(response.headers()["strict-transport-security"]).toBeUndefined();

  await page.goto("/");
  await page
    .getByRole("link", { name: /Run a live trial/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole("button", { name: /Run live trial/ })).toBeEnabled();
});
