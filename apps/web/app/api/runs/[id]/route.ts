import { NextResponse } from "next/server";
import { getRun } from "@agenttrial/runtime";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json(
    {
      runId: run.id,
      state: run.state,
      events: run.events,
      report: run.report,
      attestation: run.bundle?.attestation,
      error: run.error,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.headers.get("x-agenttrial-cancel-token") ?? "";
  const { cancelRunAuthorized } = await import("@agenttrial/runtime");
  return (await cancelRunAuthorized(id, token))
    ? NextResponse.json({ state: "CANCELLING" })
    : NextResponse.json({ error: "Run cannot be cancelled." }, { status: 409 });
}
