import type { PipelineState } from "./types";

const transitions: Record<PipelineState, readonly PipelineState[]> = {
  CREATED: ["DISCOVERING", "CANCELLED", "FAILED"], DISCOVERING: ["CLAIMS_EXTRACTED", "FAILED", "CANCELLED"],
  CLAIMS_EXTRACTED: ["PLANNING", "FAILED", "CANCELLED"], PLANNING: ["PLAN_SEALED", "FAILED", "CANCELLED"],
  PLAN_SEALED: ["EXECUTING", "FAILED", "CANCELLED"], EXECUTING: ["VERIFYING", "FAILED", "CANCELLED"],
  VERIFYING: ["SCORING", "FAILED", "CANCELLED"], SCORING: ["RECEIPT_SIGNED", "FAILED", "CANCELLED"],
  RECEIPT_SIGNED: ["ATTESTING", "COMPLETED", "FAILED"], ATTESTING: ["COMPLETED", "FAILED"],
  COMPLETED: [], FAILED: [], CANCELLED: [],
};

export class TrialStateMachine {
  constructor(public state: PipelineState = "CREATED") {}
  canTransition(next: PipelineState) { return transitions[this.state].includes(next); }
  transition(next: PipelineState) {
    if (!this.canTransition(next)) throw new Error(`Illegal transition: ${this.state} -> ${next}`);
    this.state = next;
    return this.state;
  }
}
