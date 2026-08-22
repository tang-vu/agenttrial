import { NextResponse } from "next/server";
export function GET() {
  const build = process.env.AGENTTRIAL_BUILD_COMMIT?.trim();
  return NextResponse.json({
    status: "ok",
    service: "agenttrial-web",
    version: "0.6.0",
    build: build && /^[0-9a-f]{7,64}$/i.test(build) ? build : "development",
    timestamp: new Date().toISOString(),
  });
}
