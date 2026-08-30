import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DesignValidityAudit } from "./design-validity";
import type { TargetBindingAudit } from "./target-binding";
import type { TrustedRunnerPolicy } from "./trusted-runner";
import {
  validateArtifactTamperingMutationPlan,
  type ArtifactTamperingMutationPlan,
} from "./artifact-tampering-plan";
import {
  validateControlledRunJobInventory,
  type ControlledRunJobInventory,
} from "./controlled-run-job-inventory";

type BlockerClass = "human-only" | "execution-or-source-evidence";

function classify(message: string): BlockerClass {
  if (
    message.includes("independent human reviews") ||
    message.startsWith("Human G3 gate ") ||
    message.startsWith("Independent human method-freeze approval")
  )
    return "human-only";
  if (
    message.startsWith("Only ") ||
    message.startsWith("Method validity: static-target-repeat-mismatch") ||
    message.startsWith("Method validity: reused-matched-control-inputs") ||
    message.startsWith("Method validity: ineligible-legacy-projections")
  )
    return "execution-or-source-evidence";
  throw new Error(`Unclassified readiness blocker: ${message}`);
}

export function buildBlockerLedger(input: {
  audit: TargetBindingAudit;
  designValidity: DesignValidityAudit;
  trustedRunnerPolicy: TrustedRunnerPolicy;
  artifactTamperingPlan: ArtifactTamperingMutationPlan;
  controlledRunJobInventory: ControlledRunJobInventory;
}) {
  const {
    audit,
    designValidity,
    trustedRunnerPolicy,
    artifactTamperingPlan,
    controlledRunJobInventory,
  } = input;
  validateArtifactTamperingMutationPlan(artifactTamperingPlan);
  validateControlledRunJobInventory(controlledRunJobInventory);
  if (audit.mainTrialAllowed || audit.submissionAllowed !== false)
    throw new Error("Blocker ledger can only be built from a fail-closed readiness audit");
  const blockers = audit.blockers.map((message, index) => ({
    id: `P26-002-B${String(index + 1).padStart(2, "0")}`,
    class: classify(message),
    message,
    cleared: false,
  }));
  const counts = {
    total: blockers.length,
    machineOnly: 0,
    humanOnly: blockers.filter((item) => item.class === "human-only").length,
    executionOrSourceEvidence: blockers.filter(
      (item) => item.class === "execution-or-source-evidence",
    ).length,
  };
  if (
    counts.total !== 13 ||
    counts.humanOnly !== 6 ||
    counts.executionOrSourceEvidence !== 7 ||
    designValidity.checks.variantOperationalization.passed !== true ||
    designValidity.checks.sourceExecutionDerivation.passed !== true ||
    trustedRunnerPolicy.status !== "pending-key-registration" ||
    trustedRunnerPolicy.keys.length !== 0
  )
    throw new Error("Readiness blocker ledger does not match the audited P26-002 state");

  return {
    schemaVersion: "p26-002-readiness-blocker-ledger-0.1.0",
    status: "blocked",
    scope: "new-paper-machine-and-human-handoff-not-main-trial-evidence",
    counts,
    completedMachineGates: [
      {
        id: "P26-002-M01",
        gate: "operational-variant-contracts",
        evidence: `${designValidity.checks.variantOperationalization.operationalProfiles}/80 operational profiles`,
      },
      {
        id: "P26-002-M02",
        gate: "source-execution-derivation-verifier",
        evidence: designValidity.checks.sourceExecutionDerivation.controlledRunVerification,
      },
      {
        id: "P26-002-M03",
        gate: "prospective-artifact-tampering-operator-plan",
        evidence: `${artifactTamperingPlan.entries.length}/10 source-locked entries; applicationAllowed=false; evidenceMaterialized=false`,
      },
      {
        id: "P26-002-M04",
        gate: "fail-closed-controlled-run-job-inventory",
        evidence: `${controlledRunJobInventory.jobs.length}/50 source-locked envelopes; runnableJobs=0; executionAllowed=false`,
      },
    ],
    blockers,
    nextSafeMachineAction:
      "Materialize fixed-upstream evidence through an authorized evidence boundary and define the 30 missing exact runner contracts; keep all 50 controlled-run envelopes unscheduled and the artifact-tampering operator unapplied until their human and authorization prerequisites are satisfied.",
    mainTrialAllowed: false,
    releaseAllowed: false,
    submissionAllowed: false,
  } as const;
}

const modulePath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === resolve(modulePath)) {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const [
    audit,
    designValidity,
    trustedRunnerPolicy,
    artifactTamperingPlan,
    controlledRunJobInventory,
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, "research/targets/target-binding-audit.json"), "utf8").then(
      (value) => JSON.parse(value) as TargetBindingAudit,
    ),
    readFile(resolve(repositoryRoot, "research/design-validity-audit.json"), "utf8").then(
      (value) => JSON.parse(value) as DesignValidityAudit,
    ),
    readFile(resolve(repositoryRoot, "research/targets/trusted-runner-policy.json"), "utf8").then(
      (value) => JSON.parse(value) as TrustedRunnerPolicy,
    ),
    readFile(
      resolve(repositoryRoot, "research/targets/artifact-tampering-mutation-plan.json"),
      "utf8",
    ).then((value) => JSON.parse(value) as ArtifactTamperingMutationPlan),
    readFile(
      resolve(repositoryRoot, "research/targets/controlled-run-job-inventory.json"),
      "utf8",
    ).then((value) => JSON.parse(value) as ControlledRunJobInventory),
  ]);
  const ledger = buildBlockerLedger({
    audit,
    designValidity,
    trustedRunnerPolicy,
    artifactTamperingPlan,
    controlledRunJobInventory,
  });
  const destination = resolve(repositoryRoot, "research/readiness-blocker-ledger.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
  console.log(JSON.stringify(ledger.counts));
}
