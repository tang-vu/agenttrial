import type { Metadata } from "next";
import { NewTrialForm } from "../../components/new-trial-form";
export const metadata: Metadata = { title: "New trial" };
export default function NewTrialPage() {
  return (
    <main id="main" className="page-shell">
      <div className="page-intro">
        <span className="kicker">NEW EVALUATION</span>
        <h1>Put an agent’s claims on trial.</h1>
        <p>
          Choose a controlled benchmark for the full live experience, or describe a public target
          for a passive safety check.
        </p>
      </div>
      <NewTrialForm />
    </main>
  );
}
