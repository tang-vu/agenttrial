import { NextResponse } from "next/server";
import { consumeDistributedRateLimit, issueAuthorizationChallenge } from "@agenttrial/runtime";
import { consumeRateLimit } from "@agenttrial/security";

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      return NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 415 },
      );
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 8 * 1024)
      return NextResponse.json({ error: "Request body exceeds 8 KiB." }, { status: 413 });
    const rate =
      (await consumeDistributedRateLimit("authorization:anonymous", 10, 60_000)) ??
      consumeRateLimit("authorization:anonymous", 10, 60_000);
    if (!rate.allowed)
      return NextResponse.json(
        { error: "Authorization challenge rate limit exceeded." },
        { status: 429 },
      );
    const challenge = await issueAuthorizationChallenge(JSON.parse(raw));
    return NextResponse.json(challenge, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not issue authorization." },
      { status: 400 },
    );
  }
}
