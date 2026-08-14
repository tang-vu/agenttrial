import type { Metadata } from "next";
import { LiveRun } from "../../../components/live-run";
export const metadata: Metadata = { title: "Live trial" };
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main id="main" className="live-shell">
      <LiveRun runId={id} />
    </main>
  );
}
