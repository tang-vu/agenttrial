import { generateTargetBindingAudit } from "./audit-target-bindings";

const audit = await generateTargetBindingAudit();

if (!audit.mainTrialAllowed || audit.status !== "ready" || audit.blockers.length !== 0) {
  console.error(
    JSON.stringify({
      status: audit.status,
      mainTrialAllowed: false,
      blockers: audit.blockers,
      submissionAllowed: false,
    }),
  );
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: audit.status, mainTrialAllowed: true }));
}
