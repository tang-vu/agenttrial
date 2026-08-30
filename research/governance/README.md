# P26-002 G3 governance gate

The main study is fail-closed. Automated work may prepare source checks, projections, review packets, and run infrastructure, but it cannot approve construct mappings, target authorization, data governance, or release boundaries.

`g3-approval.json` is intentionally pending and human-only. Do not replace a pending field with an approval unless the named reviewer has actually made and documented that decision. The audit reads this record but never overwrites it.

`method-freeze-approval.json` is the separate human G2 sign-off. The generated design artifact intentionally remains `redesign-required`; humans may review a future redesigned aggregate input digest through this record rather than editing the generated status field.

Any non-pending decision requires `decidedBy`, a valid `decidedOn` date, and evidence with `path`, `sha256`, and `mainTrialInputDigest`. The evidence path must resolve inside `research/governance/evidence/`; the gate reads its bytes and verifies both hashes. The aggregate digest covers the design and target artifacts, source-specific control contracts, every readiness audit, executable method source, dependency lockfile, and Node runtime.

`construct-review-packet.json` contains 80 provisional family-order bindings. Family order is only a deterministic way to prepare the review packet. It is not a scientific justification for matching a source unit to a generic scenario variant. Two different human reviewers must assess every row, and a third person must adjudicate disagreements. The audit validates this packet but never overwrites it.

`pnpm research:refresh-construct-review` may refresh descriptor hashes only while every human field is still null. It refuses to overwrite a packet containing any human decision.

Each row includes full target, fault, and control descriptors plus canonical hashes. Projection readiness is excluded from the construct decision. Reviewers must follow `construct-mapping-protocol.md`; the operational contracts require independent construct review and cannot be approved from their variant names alone.

`oracle-adjudication-template.json` freezes a separate evaluator-blind two-reviewer and third-adjudicator workflow for execution-level oracle decisions. No materialized execution evidence or human oracle review exists, so the packet remains empty. Evaluator verdicts, evaluator identity, and treatment implementation fields are forbidden from the packet.

The current gate also remains blocked because:

- 0 of 80 fault projections have materialized gate evidence; a local receipt verifies 50 reproducible candidates but is unpublished and readiness-ineligible, while the 10 clean artifact-tampering sources have a source-locked prospective operator plan whose application remains prohibited pending construct review and authorized evidence materialization;
- 0 of 80 matched-control projections are available;
- only 60 of 80 control bindings have pinned inputs, and those 60 represent only 20 unique input references;
- BFCL and tau2 controlled candidate executions do not yet exist;
- AgentDojo and tau2 control task and acceptance contracts are pinned, but none is a completed execution artifact;
- fixed upstream executions cannot satisfy the current 20-execution repetition model through evaluator replay;
- controlled runs require actual Ed25519 attestations from a human-registered key; the verifier exists, but the committed trust policy is intentionally unkeyed;
- independent method-freeze approval is still pending.

Run `pnpm research:audit-target-bindings` to regenerate `research/design-validity-audit.json`, `research/targets/control-execution-contracts.json`, and the target-binding machine audit. It never overwrites a human record. Run `pnpm research:gate-main-trial` as the main-trial execution gate; a nonzero exit is the correct result while any blocker remains.
