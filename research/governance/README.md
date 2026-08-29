# P26-002 G3 governance gate

The main study is fail-closed. Automated work may prepare source checks, projections, review packets, and run infrastructure, but it cannot approve construct mappings, target authorization, data governance, or release boundaries.

`g3-approval.json` is intentionally pending and human-only. Do not replace a pending field with an approval unless the named reviewer has actually made and documented that decision. The audit reads this record but never overwrites it.

`method-freeze-approval.json` is the separate human G2 sign-off. The generated design artifact intentionally remains `redesign-required`; humans may review a future redesigned aggregate input digest through this record rather than editing the generated status field.

Any non-pending decision requires `decidedBy`, a valid `decidedOn` date, and evidence with `path`, `sha256`, and `mainTrialInputDigest`. The evidence path must resolve inside `research/governance/evidence/`; the gate reads its bytes and verifies both hashes. The aggregate digest covers the design and target artifacts, every readiness audit, executable method source, dependency lockfile, and Node runtime.

`construct-review-packet.json` contains 80 provisional family-order bindings. Family order is only a deterministic way to prepare the review packet. It is not a scientific justification for matching a source unit to a generic scenario variant. Two different human reviewers must assess every row, and a third person must adjudicate disagreements. The audit validates this packet but never overwrites it.

Each row includes full target, fault, and control descriptors plus canonical hashes. Projection readiness is excluded from the construct decision. Reviewers must follow `construct-mapping-protocol.md`; the current variant labels are not operational definitions and cannot be approved on their names alone.

The current gate also remains blocked because:

- 60 historical fault projection hashes are not currently reconstructed by the gate and are excluded, leaving 0 of 80 readiness-eligible fault projections;
- 0 of 80 matched-control projections are available;
- only 60 of 80 control bindings have pinned inputs, and those 60 represent only 20 unique input references;
- BFCL and tau2 controlled candidate executions do not yet exist;
- AgentDojo and tau2 controls are defined only as conditions, not pinned execution artifacts.
- scenario variants are not operationally distinct, so the current family-order mappings cannot be approved;
- fixed upstream executions cannot satisfy the current 20-execution repetition model through evaluator replay;
- source-lock metadata is pinned, but the gate does not yet derive execution payload bytes from upstream blobs or reexecute/attest controlled runs;
- independent method-freeze approval is still pending.

Run `pnpm research:audit-target-bindings` to regenerate `research/design-validity-audit.json` and the target-binding machine audit. It never overwrites a human record. Run `pnpm research:gate-main-trial` as the main-trial execution gate; a nonzero exit is the correct result while any blocker remains.
