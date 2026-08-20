import { NextResponse } from "next/server";
import {
  abandonRunIdempotency,
  consumeAuthorization,
  consumeDistributedRateLimit,
  createAuthorizedA2ARun,
  createExternalRun,
  createFixtureRun,
  finalizeRunIdempotency,
  getRun,
  reserveRunIdempotency,
  takeCancellationCapability,
} from "@agenttrial/runtime";
import { hashObject } from "@agenttrial/evidence";
import type { FixtureId } from "@agenttrial/fixtures";
import { UnsafeTargetError, consumeRateLimit } from "@agenttrial/security";
import { z } from "zod";
const requestSchema = z.union([
  z
    .object({
      fixture: z.enum(["evidence-researcher", "gullible-researcher"]),
      activeConsent: z.literal(true),
    })
    .strict(),
  z
    .object({
      targetUrl: z.string().url().max(2048),
      mode: z.literal("passive"),
      capabilityDescription: z.string().trim().min(1).max(2000).optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("active"),
      authorizationId: z.string().uuid(),
      activeConsent: z.literal(true),
    })
    .strict(),
]);
export async function POST(request: Request) {
  let reservation:
    | { scopeKey: string; idempotencyHash: string; requestHash: string; active: boolean }
    | undefined;
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      return NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 415 },
      );
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 4096)
      return NextResponse.json({ error: "Request body exceeds 4 KiB." }, { status: 413 });
    const client =
      process.env.AGENTTRIAL_CLOUDFLARE_TUNNEL === "true"
        ? (request.headers.get("cf-connecting-ip") ?? "anonymous")
        : process.env.AGENTTRIAL_TRUST_PROXY === "true"
          ? (request.headers.get("x-real-ip") ?? "anonymous")
          : "anonymous";
    const createKey = `create:${client}`;
    const createLimit = client === "anonymous" ? 20 : 10;
    const rate =
      (await consumeDistributedRateLimit(createKey, createLimit, 60_000)) ??
      consumeRateLimit(createKey, createLimit, 60_000);
    if (!rate.allowed)
      return NextResponse.json(
        { error: "Trial creation rate limit exceeded." },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
          },
        },
      );
    const raw = await request.text();
    if (raw.length > 4096)
      return NextResponse.json({ error: "Request body exceeds 4 KiB." }, { status: 413 });
    const parsed = JSON.parse(raw);
    if ((parsed?.fixture || parsed?.mode === "active") && parsed.activeConsent !== true)
      return NextResponse.json(
        { error: "Active testing requires explicit consent." },
        { status: 403 },
      );
    const body = requestSchema.parse(parsed);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey) {
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey))
        return NextResponse.json(
          { error: "Idempotency-Key must be 8-128 safe ASCII characters." },
          { status: 400 },
        );
      const scopeKey = hashObject({ client });
      const idempotencyHash = hashObject({ idempotencyKey });
      const requestHash = hashObject(body);
      const result = await reserveRunIdempotency(scopeKey, idempotencyHash, requestHash);
      if (result.status === "conflict")
        return NextResponse.json(
          { error: "Idempotency-Key was already used with a different request." },
          { status: 422 },
        );
      if (result.status === "pending")
        return NextResponse.json(
          { error: "The idempotent request is still being created." },
          { status: 409, headers: { "retry-after": "1" } },
        );
      if (result.status === "replay") {
        const existing = await getRun(result.runId);
        return NextResponse.json(
          { runId: result.runId, state: existing?.state ?? "CREATED", replayed: true },
          { status: 200, headers: { "idempotency-replayed": "true" } },
        );
      }
      reservation = { scopeKey, idempotencyHash, requestHash, active: true };
    }
    if ("targetUrl" in body) {
      const targetOrigin = new URL(body.targetUrl).origin.toLowerCase();
      const targetKey = `target:${targetOrigin}`;
      const targetRate =
        (await consumeDistributedRateLimit(targetKey, 5, 60_000)) ??
        consumeRateLimit(targetKey, 5, 60_000);
      if (!targetRate.allowed)
        return NextResponse.json(
          { error: "This target has reached its passive evaluation limit." },
          {
            status: 429,
            headers: {
              "retry-after": String(
                Math.max(1, Math.ceil((targetRate.resetAt - Date.now()) / 1000)),
              ),
            },
          },
        );
    }
    let run;
    if ("fixture" in body) run = createFixtureRun(body.fixture as FixtureId);
    else if (body.mode === "passive")
      run = createExternalRun(body.targetUrl, body.capabilityDescription);
    else {
      const verificationToken = request.headers.get("x-agenttrial-verification-token");
      if (!verificationToken)
        return NextResponse.json(
          { error: "Private verification token is required." },
          { status: 401 },
        );
      const authorization = await consumeAuthorization(body.authorizationId, verificationToken);
      run = createAuthorizedA2ARun(authorization);
    }
    if (reservation) {
      const finalized = await finalizeRunIdempotency(
        reservation.scopeKey,
        reservation.idempotencyHash,
        reservation.requestHash,
        run.id,
      );
      if (!finalized) throw new Error("Could not finalize idempotent request.");
      reservation.active = false;
    }
    return NextResponse.json(
      { runId: run.id, state: run.state, cancelToken: takeCancellationCapability(run.id) },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (reservation?.active)
      await abandonRunIdempotency(
        reservation.scopeKey,
        reservation.idempotencyHash,
        reservation.requestHash,
      ).catch(() => undefined);
    console.error("Trial creation rejected", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return NextResponse.json(
      { error: error instanceof UnsafeTargetError ? error.message : "Invalid trial request." },
      { status: 400 },
    );
  }
}
