import { NextResponse } from "next/server";
import { runs } from "@agenttrial/runtime";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = runs.get(id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json(
    { runId: run.id, state: run.state, events: run.events, report: run.report, error: run.error },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { cancelRun } = await import("@agenttrial/runtime");
  return cancelRun(id)
    ? NextResponse.json({ state: "CANCELLING" })
    : NextResponse.json({ error: "Run cannot be cancelled." }, { status: 409 });
}
