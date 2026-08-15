import { NextResponse } from "next/server";
import {
  createExternalRun,
  createFixtureRun,
  takeCancellationCapability,
} from "@agenttrial/runtime";
import type { FixtureId } from "@agenttrial/fixtures";
import { consumeRateLimit } from "@agenttrial/security";
import { z } from "zod";
const requestSchema = z.union([
  z
    .object({
      fixture: z.enum(["evidence-researcher", "gullible-researcher"]),
      activeConsent: z.literal(true),
    })
    .strict(),
  z.object({ targetUrl: z.string().url().max(2048), mode: z.literal("passive") }).strict(),
]);
export async function POST(request: Request) {
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
      process.env.AGENTTRIAL_TRUST_PROXY === "true"
        ? (request.headers.get("x-real-ip") ?? "anonymous")
        : "anonymous";
    const rate = consumeRateLimit(`create:${client}`, 10, 60_000);
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
    const body = requestSchema.parse(JSON.parse(raw));
    const run =
      "fixture" in body
        ? createFixtureRun(body.fixture as FixtureId)
        : createExternalRun(body.targetUrl);
    return NextResponse.json(
      { runId: run.id, state: run.state, cancelToken: takeCancellationCapability(run.id) },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Invalid trial request." }, { status: 400 });
  }
}
