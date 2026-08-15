import { NextResponse } from "next/server";
import { getRun } from "@agenttrial/runtime";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (!run.bundle)
    return NextResponse.json({ error: "Evidence bundle is not ready." }, { status: 409 });
  return new NextResponse(JSON.stringify(run.bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="agenttrial-${id}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
