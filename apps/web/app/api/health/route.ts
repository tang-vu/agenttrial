import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "agenttrial-web",
    version: "0.5.0",
    timestamp: new Date().toISOString(),
  });
}
