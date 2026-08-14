import type { Metadata } from "next";
import { ReportView } from "../../../components/report-view";
export const metadata: Metadata = { title: "Evidence report" };
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main id="main" className="report-shell">
      <ReportView runId={id} />
    </main>
  );
}
