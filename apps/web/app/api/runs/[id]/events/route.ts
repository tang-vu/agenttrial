import { runs, subscribe } from "@agenttrial/runtime";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = runs.get(id);
  if (!run) return new Response("Run not found", { status: 404 });
  const encoder = new TextEncoder();
  let close: (() => void) | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const initial = run.events;
      initial.forEach(send);
      close = subscribe(id, (event) => {
        send(event);
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(event.state)) {
          close?.();
          controller.close();
        }
      });
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.state)) {
        close?.();
        controller.close();
      }
    },
    cancel() {
      close?.();
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
