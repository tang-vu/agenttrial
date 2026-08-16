import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  A2ACardSchema,
  safePublicFetch,
  validateAuthorizedA2ASelection,
} from "@agenttrial/adapters";
import {
  AuthorizationGrantSchema,
  AuthorizationRecordSchema,
  type AuthorizationRecord,
} from "@agenttrial/core";
import { hashObject, hashText } from "@agenttrial/evidence";
import { normalizeTargetUrl, privateTestTargetsAllowed } from "@agenttrial/security";
import { z } from "zod";

const inputSchema = z
  .object({
    cardUrl: z.string().url().max(2048),
    interfaceUrl: z.string().url().max(2048),
    skillId: z.string().min(1).max(160),
    proofUrl: z.string().url().max(2048),
    testMessage: z.string().trim().min(1).max(1000),
    expectedSubstring: z.string().trim().min(1).max(120),
  })
  .strict();

const challengeDocumentSchema = z
  .object({
    schemaVersion: z.literal("agenttrial.authorization.v1"),
    challengeId: z.string().uuid(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    subject: z
      .object({
        cardUrl: z.string().url(),
        cardSha256: z.string().regex(/^[0-9a-f]{64}$/),
        interfaceUrl: z.string().url(),
        protocolBinding: z.literal("HTTP+JSON"),
        protocolVersion: z.literal("1.0"),
        tenant: z.string().min(1).max(160).optional(),
        skillId: z.string(),
      })
      .strict(),
    grant: AuthorizationGrantSchema,
    trialInputHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type AuthorizationChallengeDocument = z.infer<typeof challengeDocumentSchema>;

const memory = new Map<string, AuthorizationRecord>();

function authorizationDirectory() {
  const base = process.env.AGENTTRIAL_DATA_DIR;
  return base ? resolve(base, "authorizations") : undefined;
}
function authorizationPath(id: string) {
  if (!z.string().uuid().safeParse(id).success)
    throw new Error("Invalid authorization identifier.");
  const directory = authorizationDirectory();
  return directory ? join(directory, `${id}.json`) : undefined;
}
async function persist(record: AuthorizationRecord) {
  memory.set(record.id, record);
  const directory = authorizationDirectory();
  const path = authorizationPath(record.id);
  if (!directory || !path) return;
  await mkdir(directory, { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(record), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  await unlink(temporary).catch(() => undefined);
}
async function load(id: string) {
  const cached = memory.get(id);
  if (cached) return cached;
  const path = authorizationPath(id);
  if (!path) return undefined;
  try {
    const parsed = AuthorizationRecordSchema.parse(JSON.parse(await readFile(path, "utf8")));
    memory.set(id, parsed);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function normalizeAuthorizedUrl(raw: string) {
  const url = normalizeTargetUrl(raw);
  if (!privateTestTargetsAllowed() && url.protocol !== "https:")
    throw new Error("Active authorization requires HTTPS.");
  if (!privateTestTargetsAllowed() && url.port && url.port !== "443")
    throw new Error("Active authorization requires HTTPS port 443.");
  return url;
}

function tokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashText(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function issueAuthorizationChallenge(input: z.input<typeof inputSchema>) {
  const body = inputSchema.parse(input);
  const cardUrl = normalizeAuthorizedUrl(body.cardUrl);
  const interfaceUrl = normalizeAuthorizedUrl(body.interfaceUrl);
  const proofUrl = normalizeAuthorizedUrl(body.proofUrl);
  if (cardUrl.origin !== interfaceUrl.origin || cardUrl.origin !== proofUrl.origin)
    throw new Error("Card, A2A interface, and proof must use the same HTTPS origin in v1.");
  const cardResponse = await safePublicFetch(cardUrl.toString(), {
    timeoutMs: 5_000,
    maxBytes: 64 * 1024,
    maxRedirects: 0,
  });
  if (!(cardResponse.headers["content-type"] ?? "").toLowerCase().includes("json"))
    throw new Error("Agent Card must be served as JSON.");
  const card = A2ACardSchema.parse(JSON.parse(cardResponse.body));
  const selected = validateAuthorizedA2ASelection(card, interfaceUrl.toString(), body.skillId);
  const id = randomUUID();
  const nonce = randomBytes(32).toString("base64url");
  const verificationToken = randomBytes(32).toString("base64url");
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const grant = AuthorizationGrantSchema.parse({
    mode: "active",
    actions: ["SendMessage"],
    trialCategories: ["core-functionality", "structured-output"],
    maxMessages: 2,
    maxRequestBytes: 16_384,
    maxResponseBytes: 1_000_000,
    timeoutMs: 15_000,
  });
  const cardHash = hashText(cardResponse.body);
  const trialInputHash = hashObject({
    testMessage: body.testMessage,
    expectedSubstring: body.expectedSubstring,
  });
  const document = challengeDocumentSchema.parse({
    schemaVersion: "agenttrial.authorization.v1",
    challengeId: id,
    nonce,
    issuedAt,
    expiresAt,
    subject: {
      cardUrl: cardUrl.toString(),
      cardSha256: cardHash,
      interfaceUrl: interfaceUrl.toString(),
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
      ...(selected.selectedInterface.tenant ? { tenant: selected.selectedInterface.tenant } : {}),
      skillId: body.skillId,
    },
    grant,
    trialInputHash,
  });
  const scopeHash = hashObject({ subject: document.subject, grant, trialInputHash });
  const record = AuthorizationRecordSchema.parse({
    id,
    status: "issued",
    origin: cardUrl.origin,
    cardUrl: cardUrl.toString(),
    cardHash,
    interfaceUrl: interfaceUrl.toString(),
    protocolBinding: "HTTP+JSON",
    protocolVersion: "1.0",
    ...(selected.selectedInterface.tenant ? { tenant: selected.selectedInterface.tenant } : {}),
    skillId: body.skillId,
    proofUrl: proofUrl.toString(),
    scopeHash,
    documentHash: hashObject(document),
    nonceHash: hashText(nonce),
    verificationTokenHash: hashText(verificationToken),
    actorId: `anonymous-builder-session:${hashText(verificationToken).slice(0, 16)}`,
    grant,
    testMessage: body.testMessage,
    expectedSubstring: body.expectedSubstring,
    issuedAt,
    expiresAt,
  });
  await persist(record);
  return { id, verificationToken, expiresAt, proofUrl: record.proofUrl, document };
}

export async function verifyAuthorizationChallenge(id: string, verificationToken: string) {
  const record = await load(id);
  if (!record || !tokenMatches(verificationToken, record.verificationTokenHash))
    throw new Error("Authorization challenge or private verification token is invalid.");
  if (record.status !== "issued") throw new Error("Authorization challenge is not pending.");
  if (Date.parse(record.expiresAt) <= Date.now()) {
    await persist({ ...record, status: "expired" });
    throw new Error("Authorization challenge expired.");
  }
  const proofResponse = await safePublicFetch(record.proofUrl, {
    timeoutMs: 5_000,
    maxBytes: 16 * 1024,
    maxRedirects: 0,
  });
  if (!(proofResponse.headers["content-type"] ?? "").toLowerCase().includes("json"))
    throw new Error("Authorization proof must be served as JSON.");
  const proof = challengeDocumentSchema.parse(JSON.parse(proofResponse.body));
  if (hashObject(proof) !== record.documentHash)
    throw new Error("Published authorization proof does not match the issued challenge.");
  const cardResponse = await safePublicFetch(record.cardUrl, {
    timeoutMs: 5_000,
    maxBytes: 64 * 1024,
    maxRedirects: 0,
  });
  if (hashText(cardResponse.body) !== record.cardHash)
    throw new Error("Agent Card changed after authorization was issued.");
  const verifiedAt = new Date().toISOString();
  const verified = AuthorizationRecordSchema.parse({
    ...record,
    status: "verified",
    verifiedAt,
    verificationEvidence: {
      proofHash: hashText(proofResponse.body),
      verifiedAt,
      cardHash: record.cardHash,
      proofUrl: record.proofUrl,
    },
  });
  await persist(verified);
  return publicAuthorization(verified);
}

export async function consumeAuthorization(id: string, verificationToken: string) {
  const record = await load(id);
  if (!record || !tokenMatches(verificationToken, record.verificationTokenHash))
    throw new Error("Authorization challenge or private verification token is invalid.");
  if (record.status !== "verified")
    throw new Error("Authorization is not verified or was consumed.");
  if (Date.parse(record.expiresAt) <= Date.now()) {
    await persist({ ...record, status: "expired" });
    throw new Error("Authorization expired before the active run started.");
  }
  const consumed = AuthorizationRecordSchema.parse({
    ...record,
    status: "consumed",
    consumedAt: new Date().toISOString(),
  });
  await persist(consumed);
  return consumed;
}

export function publicAuthorization(record: AuthorizationRecord) {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== "verificationTokenHash" && key !== "nonceHash",
    ),
  ) as Omit<AuthorizationRecord, "verificationTokenHash" | "nonceHash">;
}
