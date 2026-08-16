import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  consumeAuthorization,
  issueAuthorizationChallenge,
  verifyAuthorizationChallenge,
} from "./authorizations";
import { createAuthorizedA2ARun, getRun } from "./index";
import { verifyBundle } from "@agenttrial/evidence";

describe("A2A domain-control authorization", () => {
  afterEach(() => delete process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS);

  it("binds the exact card, scope, proof, and private browser token", async () => {
    process.env.AGENTTRIAL_ALLOW_PRIVATE_TEST_TARGETS = "true";
    let proof: unknown = { pending: true };
    let messageCalls = 0;
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/.well-known/agent-card.json") {
        response.end(
          JSON.stringify({
            name: "Owned research agent",
            description: "Controlled authorization fixture",
            version: "1.0.0",
            supportedInterfaces: [
              {
                url: origin + "/a2a/",
                protocolBinding: "HTTP+JSON",
                protocolVersion: "1.0",
              },
            ],
            capabilities: {},
            defaultInputModes: ["text/plain"],
            defaultOutputModes: ["text/plain"],
            skills: [
              { id: "research", name: "Research", description: "Researches", tags: ["test"] },
            ],
          }),
        );
      } else if (request.url === "/a2a/message:send") {
        messageCalls += 1;
        response.setHeader("content-type", "application/a2a+json");
        response.end(
          JSON.stringify({
            message: {
              messageId: `response-${messageCalls}`,
              role: "ROLE_AGENT",
              parts: [{ text: "EVIDENCE-OK" }],
            },
          }),
        );
      } else response.end(JSON.stringify(proof));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    const challenge = await issueAuthorizationChallenge({
      cardUrl: `${origin}/.well-known/agent-card.json`,
      interfaceUrl: `${origin}/a2a/`,
      skillId: "research",
      proofUrl: `${origin}/.well-known/agenttrial-proof.json`,
      testMessage: "Return EVIDENCE-OK",
      expectedSubstring: "EVIDENCE-OK",
    });
    proof = challenge.document;
    await expect(verifyAuthorizationChallenge(challenge.id, "wrong-token")).rejects.toThrow(
      /invalid/i,
    );
    const verified = await verifyAuthorizationChallenge(challenge.id, challenge.verificationToken);
    expect(verified.status).toBe("verified");
    expect(JSON.stringify(verified)).not.toContain(challenge.verificationToken);
    const consumed = await consumeAuthorization(challenge.id, challenge.verificationToken);
    expect(consumed.status).toBe("consumed");
    await expect(consumeAuthorization(challenge.id, challenge.verificationToken)).rejects.toThrow(
      /consumed|not verified/i,
    );
    const run = createAuthorizedA2ARun(consumed);
    let completed = await getRun(run.id);
    for (let attempt = 0; attempt < 100 && completed?.state !== "COMPLETED"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      completed = await getRun(run.id);
    }
    expect(completed?.state, completed?.error).toBe("COMPLETED");
    expect(completed?.report?.score.coverage).toBe(100);
    expect(completed?.report?.observations[0]?.status).toBe("completed");
    const verification = verifyBundle(completed!.bundle!, {
      trustedPublicKeys: [completed!.bundle!.receipt.publicKey],
    });
    expect(verification.valid, JSON.stringify(verification.checks)).toBe(true);
    expect(messageCalls).toBe(2);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
