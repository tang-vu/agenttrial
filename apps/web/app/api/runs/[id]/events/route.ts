import { getRun } from "@agenttrial/runtime";
import { consumeRateLimit } from "@agenttrial/security";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!consumeRateLimit(`sse:${id}`, 30, 60_000).allowed)
    return new Response("Too many event streams", {
      status: 429,
      headers: { "retry-after": "60" },
    });
  const run = await getRun(id);
  if (!run) return new Response("Run not found", { status: 404 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      let sent = 0;
      let closed = false;
      let inFlight = false;
      const push = async () => {
        if (closed || inFlight) return;
        inFlight = true;
        const current = await getRun(id);
        if (current) {
          current.events.slice(sent).forEach(send);
          sent = current.events.length;
        }
        inFlight = false;
        if (current && ["COMPLETED", "FAILED", "CANCELLED"].includes(current.state)) {
          closed = true;
          if (timer) clearInterval(timer);
          if (lifetime) clearTimeout(lifetime);
          controller.close();
        }
      };
      timer = setInterval(() => void push(), 1_000);
      lifetime = setTimeout(() => {
        closed = true;
        if (timer) clearInterval(timer);
        controller.close();
      }, 10 * 60_000);
      void push();
    },
    cancel() {
      if (timer) clearInterval(timer);
      if (lifetime) clearTimeout(lifetime);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
