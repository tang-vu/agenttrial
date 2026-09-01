export type OracleDecision = "reliable" | "unreliable" | "indeterminate" | null;

export interface OracleReview {
  decision: OracleDecision;
  reviewer: string | null;
  rationale: string | null;
}

export interface OracleAdjudicationRow {
  targetId: string;
  condition: "fault" | "control";
  executionReference: string;
  sourceLockSha256: string;
  oracleCriteriaSha256: string;
  reviewerA: OracleReview;
  reviewerB: OracleReview;
  adjudication: {
    decision: OracleDecision;
    adjudicator: string | null;
    rationale: string | null;
  };
}

export interface OracleAdjudicationPacket {
  schemaVersion: "p26-002-oracle-adjudication-0.1.0";
  status: "awaiting-execution-evidence" | "pending-human-review" | "resolved";
  humanOnly: true;
  blinding: {
    evaluatorVerdictsExcluded: true;
    evaluatorIdentityExcluded: true;
    treatmentImplementationFieldsExcluded: true;
  };
  rows: OracleAdjudicationRow[];
  releaseAllowed: false;
  submissionAllowed: false;
}

function fail(message: string): never {
  throw new Error(`Oracle adjudication validation failed: ${message}`);
}

function exactKeys(value: object, expected: string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function validSha256(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function normalizedPerson(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function validateReview(row: OracleAdjudicationRow, label: string, review: OracleReview) {
  if (!exactKeys(review, ["decision", "rationale", "reviewer"]))
    fail(`${row.targetId} ${label} has unexpected fields`);
  if (![null, "reliable", "unreliable", "indeterminate"].includes(review.decision))
    fail(`${row.targetId} ${label} has an invalid decision`);
  const nulls = [review.decision, review.reviewer, review.rationale].map((value) => value === null);
  if (!nulls.every((value) => value === nulls[0]))
    fail(`${row.targetId} ${label} must set decision, reviewer, and rationale together`);
  if (review.reviewer !== null && review.reviewer.trim() === "")
    fail(`${row.targetId} ${label} reviewer is blank`);
  if (review.rationale !== null && review.rationale.trim() === "")
    fail(`${row.targetId} ${label} rationale is blank`);
}

function rowStatus(row: OracleAdjudicationRow) {
  validateReview(row, "reviewer A", row.reviewerA);
  validateReview(row, "reviewer B", row.reviewerB);
  if (
    row.reviewerA.reviewer !== null &&
    row.reviewerB.reviewer !== null &&
    normalizedPerson(row.reviewerA.reviewer) === normalizedPerson(row.reviewerB.reviewer)
  )
    fail(`${row.targetId} requires two independent reviewers`);
  const decisions = [row.reviewerA.decision, row.reviewerB.decision];
  const adjudicationValues = [
    row.adjudication.decision,
    row.adjudication.adjudicator,
    row.adjudication.rationale,
  ];
  const adjudicationNull = adjudicationValues.every((value) => value === null);
  const adjudicationComplete = adjudicationValues.every((value) => value !== null);
  if (!adjudicationNull && !adjudicationComplete)
    fail(`${row.targetId} must set all adjudication fields together`);
  if (decisions.includes(null)) {
    if (!adjudicationNull) fail(`${row.targetId} cannot be adjudicated before both reviews`);
    return "pending" as const;
  }
  if (decisions[0] === decisions[1]) {
    if (!adjudicationNull) fail(`${row.targetId} cannot add adjudication when reviewers agree`);
    return "resolved" as const;
  }
  if (!adjudicationComplete) return "pending" as const;
  if (!["reliable", "unreliable", "indeterminate"].includes(row.adjudication.decision as string))
    fail(`${row.targetId} adjudication decision is invalid`);
  if (row.adjudication.adjudicator!.trim() === "" || row.adjudication.rationale!.trim() === "")
    fail(`${row.targetId} adjudication identity or rationale is blank`);
  const adjudicator = normalizedPerson(row.adjudication.adjudicator!);
  if (
    adjudicator === normalizedPerson(row.reviewerA.reviewer!) ||
    adjudicator === normalizedPerson(row.reviewerB.reviewer!)
  )
    fail(`${row.targetId} adjudicator must be independent of both reviewers`);
  return "resolved" as const;
}

export function buildBlankOraclePacket(
  executions: Array<
    Pick<
      OracleAdjudicationRow,
      "targetId" | "condition" | "executionReference" | "sourceLockSha256" | "oracleCriteriaSha256"
    >
  >,
): OracleAdjudicationPacket {
  const keys = executions.map(
    (execution) =>
      `${execution.targetId}\u0000${execution.condition}\u0000${execution.executionReference}`,
  );
  if (new Set(keys).size !== keys.length) fail("execution rows are duplicated");
  for (const execution of executions) {
    if (
      !/^ext-\d{3}$/.test(execution.targetId) ||
      !["fault", "control"].includes(execution.condition) ||
      execution.executionReference.trim() === "" ||
      !validSha256(execution.sourceLockSha256) ||
      !validSha256(execution.oracleCriteriaSha256)
    )
      fail(`execution envelope is invalid for ${execution.targetId}`);
  }
  return {
    schemaVersion: "p26-002-oracle-adjudication-0.1.0",
    status: executions.length === 0 ? "awaiting-execution-evidence" : "pending-human-review",
    humanOnly: true,
    blinding: {
      evaluatorVerdictsExcluded: true,
      evaluatorIdentityExcluded: true,
      treatmentImplementationFieldsExcluded: true,
    },
    rows: executions.map((execution) => ({
      ...execution,
      reviewerA: { decision: null, reviewer: null, rationale: null },
      reviewerB: { decision: null, reviewer: null, rationale: null },
      adjudication: { decision: null, adjudicator: null, rationale: null },
    })),
    releaseAllowed: false,
    submissionAllowed: false,
  };
}

export function validateOraclePacket(packet: OracleAdjudicationPacket) {
  if (
    !exactKeys(packet, [
      "blinding",
      "humanOnly",
      "releaseAllowed",
      "rows",
      "schemaVersion",
      "status",
      "submissionAllowed",
    ]) ||
    packet.schemaVersion !== "p26-002-oracle-adjudication-0.1.0" ||
    packet.humanOnly !== true ||
    !exactKeys(packet.blinding, [
      "evaluatorIdentityExcluded",
      "evaluatorVerdictsExcluded",
      "treatmentImplementationFieldsExcluded",
    ]) ||
    !Object.values(packet.blinding).every((value) => value === true) ||
    packet.releaseAllowed !== false ||
    packet.submissionAllowed !== false ||
    !Array.isArray(packet.rows)
  )
    fail("packet envelope is invalid");
  const keys = new Set<string>();
  let resolved = 0;
  for (const row of packet.rows) {
    if (
      !exactKeys(row, [
        "adjudication",
        "condition",
        "executionReference",
        "oracleCriteriaSha256",
        "reviewerA",
        "reviewerB",
        "sourceLockSha256",
        "targetId",
      ]) ||
      !exactKeys(row.adjudication, ["adjudicator", "decision", "rationale"]) ||
      !/^ext-\d{3}$/.test(row.targetId) ||
      !["fault", "control"].includes(row.condition) ||
      row.executionReference.trim() === "" ||
      !validSha256(row.sourceLockSha256) ||
      !validSha256(row.oracleCriteriaSha256)
    )
      fail(`row envelope is invalid for ${row.targetId}`);
    const key = `${row.targetId}\u0000${row.condition}\u0000${row.executionReference}`;
    if (keys.has(key)) fail(`row is duplicated for ${row.targetId}`);
    keys.add(key);
    if (rowStatus(row) === "resolved") resolved += 1;
  }
  const expectedStatus =
    packet.rows.length === 0
      ? "awaiting-execution-evidence"
      : resolved === packet.rows.length
        ? "resolved"
        : "pending-human-review";
  if (packet.status !== expectedStatus) fail(`packet status must be ${expectedStatus}`);
  return { rows: packet.rows.length, resolved, pending: packet.rows.length - resolved };
}
