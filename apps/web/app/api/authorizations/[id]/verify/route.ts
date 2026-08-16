import { NextResponse } from "next/server";
import { verifyAuthorizationChallenge } from "@agenttrial/runtime";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = request.headers.get("x-agenttrial-verification-token");
    if (!token || token.length > 200)
      return NextResponse.json(
        { error: "Private verification token is required." },
        { status: 401 },
      );
    const { id } = await context.params;
    const authorization = await verifyAuthorizationChallenge(id, token);
    return NextResponse.json({ authorization }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify authorization." },
      { status: 400 },
    );
  }
}
