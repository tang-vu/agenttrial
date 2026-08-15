import { getRun } from "@agenttrial/runtime";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) return new Response("Run not found", { status: 404 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
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
          controller.close();
        }
      };
      timer = setInterval(() => void push(), 350);
      void push();
    },
    cancel() {
      if (timer) clearInterval(timer);
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
