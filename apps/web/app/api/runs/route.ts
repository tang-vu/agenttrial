import { NextResponse } from "next/server";
import { createFixtureRun } from "@agenttrial/runtime";
import type { FixtureId } from "@agenttrial/fixtures";
const allowed = new Set(["evidence-researcher", "gullible-researcher"]);
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!allowed.has(body.fixture))
      return NextResponse.json({ error: "Choose a controlled fixture." }, { status: 400 });
    if (body.activeConsent !== true)
      return NextResponse.json(
        { error: "Active testing requires explicit consent." },
        { status: 403 },
      );
    const run = createFixtureRun(body.fixture as FixtureId);
    return NextResponse.json(
      { runId: run.id, state: run.state },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Invalid trial request." }, { status: 400 });
  }
}
