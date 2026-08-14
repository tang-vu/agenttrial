export function GET() {
  return new Response(
    `# AgentTrial\n\n> AI agents make claims. AgentTrial makes them prove it.\n\nAgentTrial is an autonomous adversarial evaluator for AI agents. It extracts typed claims, seals a trial plan before execution, runs bounded scenarios, evaluates deterministic assertions, and signs a tamper-evident evidence receipt.\n\n## Key pages\n- /methodology — scoring and coverage rules\n- /security — authorization and responsible-use boundaries\n- /developers — API quickstart\n- /openapi.json — OpenAPI 3.1 schema\n- /.well-known/agent-card.json — A2A 1.0 Agent Card\n- /verify — local receipt verifier\n\n## Important\nReceipts describe bounded observed behavior. They are not legal certification or a guarantee of safety. Arbitrary public targets are passive-only; this deployment executes controlled fixtures.\n`,
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}
