import type { Metadata } from "next";
import { ReceiptVerifier } from "../../components/receipt-verifier";
export const metadata: Metadata = { title: "Receipt verifier" };
export default function VerifyPage() {
  return (
    <main id="main" className="page-shell narrow">
      <div className="page-intro">
        <span className="kicker">LOCAL RECEIPT VERIFIER</span>
        <h1>
          Trust the evidence,
          <br />
          not our server.
        </h1>
        <p>Verification runs entirely in this browser. Uploaded bundles are never sent anywhere.</p>
      </div>
      <ReceiptVerifier />
    </main>
  );
}
